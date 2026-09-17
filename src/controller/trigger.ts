/**
 * block-icon 触发入口。
 *
 * 事实核实（2026-09-16，思源 3.8.3 生产验证三重证据交叉确认）：
 * - `click-blockicon` 事件负载 `{ menu: subMenu, protyle, blockElements }`
 *   （siyuan.d.ts:191 IEventBusMap）。思源事件派发器在派发前创建 subMenu 并
 *   注入 detail.menu；插件同步 `detail.menu.addItem(...)` 后，派发器把插件
 *   菜单项作为块菜单的「插件」子菜单追加展示（前端源码 protyle-method.js
 *   派发器实现 + 参考插件 siyuan-plugin-task-note-management v7.1.1 生产代码
 *   同模式）。
 * - 块 DOM 实测：代码块元素为 `div[data-type="NodeCodeBlock"]`，Mermaid 语言
 *   以 `data-subtype="mermaid"` 标记（class="render-node"）；历史形态还有
 *   `data-type="code-block"` + 内嵌 `code.language-mermaid`（highlight.js 兜底）。
 *
 * 行为契约：
 * - 仅命中 Mermaid 代码块时注入"可视化编辑"菜单项；非 mermaid 块（含普通块、
 *   其他语言代码块、空 blockElements）零副作用，不触碰任何菜单对象。
 * - 返回卸载函数：移除 click-blockicon 监听，幂等。
 */
import type { IEventBusMap, IMenu, Plugin } from "siyuan";

/** registerBlockIconTrigger 选项。 */
export interface BlockIconTriggerOptions {
  /** 思源插件事件总线（Plugin["eventBus"]）。 */
  eventBus: Plugin["eventBus"];
  /** 点击"可视化编辑"后的回调，参数为 Mermaid 块的 data-node-id。 */
  onOpenMermaidEditor: (blockId: string) => void;
}

/**
 * 判定元素是否为 Mermaid 代码块（纯 DOM 判定，可单测）。
 *
 * 判定信号（思源 3.8.3 实测）：
 * 1. 主形态：`data-type="NodeCodeBlock"`（历史形态 "code-block"）且
 *    `data-subtype="mermaid"`（Mermaid 语言以 data-subtype 标记）；
 * 2. 兜底信号：`data-type="NodeCodeBlock" | "code-block"` 且块内含
 *    `code.language-mermaid` 元素（highlight.js 渲染形态）。
 */
export function isMermaidCodeBlock(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el) {
    return false;
  }
  const isCodeBlock =
    el.dataset.type === "NodeCodeBlock" || el.dataset.type === "code-block";
  if (!isCodeBlock) {
    return false;
  }
  return el.dataset.subtype === "mermaid" || el.querySelector("code.language-mermaid") !== null;
}

/**
 * 注册 block-icon 触发：监听 `click-blockicon`，命中 Mermaid 代码块时向
 * `detail.menu` 注入"可视化编辑"菜单项（思源派发器随后将其挂入块菜单的
 * 「插件」子菜单），点击回调 onOpenMermaidEditor(blockId)。
 * 返回卸载函数：移除 click-blockicon 监听，幂等。
 */
export function registerBlockIconTrigger(options: BlockIconTriggerOptions): () => void {
  const { eventBus, onOpenMermaidEditor } = options;

  const listener = (event: CustomEvent<IEventBusMap["click-blockicon"]>) => {
    const block = event.detail?.blockElements?.[0];
    if (!isMermaidCodeBlock(block)) {
      // 非 mermaid（含非 code 块 / 空 blockElements）：不注入、不弹菜单，零副作用。
      return;
    }
    const blockId = block.dataset.nodeId ?? "";
    const menuItem: IMenu = {
      icon: "iconGraph",
      label: "可视化编辑",
      click: () => onOpenMermaidEditor(blockId),
    };
    // 派发器已注入 detail.menu（subMenu）；插件菜单项将出现在块菜单的「插件」子菜单中。
    event.detail.menu.addItem(menuItem);
  };

  eventBus.on("click-blockicon", listener);

  let unregistered = false;
  return () => {
    if (unregistered) {
      return;
    }
    unregistered = true;
    eventBus.off("click-blockicon", listener);
  };
}
