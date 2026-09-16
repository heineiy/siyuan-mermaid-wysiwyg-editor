/**
 * block-icon 触发入口（REQ-TRIGGER-001 / D §5.1）。
 *
 * 事实核实（2026-09-16，siyuan@1.2.7 类型定义 + 思源前端源码 cross-check）：
 * - `click-blockicon` 事件负载：`{ menu: subMenu, protyle: IProtyle,
 *   blockElements: HTMLElement[] }`（siyuan.d.ts IEventBusMap）。思源在用户点击
 *   块级 block-icon 后弹出块菜单（subMenu），同时广播该事件；插件同步向
 *   `detail.menu.addItem(...)` 加项，该项即出现在弹出的块菜单中（官方
 *   plugin-sample / 社区插件通用模式）。
 * - 块 DOM 约定：`data-node-id` = 块 id；`data-type="code-block"` = 代码块；
 *   Mermaid 语言标记 `data-subtype="mermaid"`（Lute 渲染 code-block 时以语言名
 *   作为 subtype 写到块元素上）；另有兜底信号 `code.language-mermaid` class
 *   （highlight.js 渲染约定，思源 wysiwyg codeBlock.ts 亦按 `language-` 前缀解析）。
 * - `Menu` 类：addItem(IMenu) / open(IPosition) / close()（siyuan.d.ts）。
 *
 * 行为契约：
 * - 仅命中 Mermaid 代码块时注入"可视化编辑"菜单项；非 mermaid 块（含普通块、
 *   其他语言代码块、空 blockElements）零副作用，不触碰任何菜单对象。
 * - 注入路径二选一：缺省走事件自带的 subMenu（思源原生块菜单）；传入 menu 时
 *   改用该 Menu 实例承载并 open（定位锚点为被点击块的 bounding rect）。
 * - 返回卸载函数：移除 click-blockicon 监听，幂等。
 */
import type { IEventBusMap, IMenu, Menu, Plugin } from "siyuan";

/** registerBlockIconTrigger 选项。 */
export interface BlockIconTriggerOptions {
  /** 思源插件事件总线（Plugin["eventBus"]）。 */
  eventBus: Plugin["eventBus"];
  /**
   * 可选菜单承载：传入时用该 siyuan Menu 实例弹出"可视化编辑"项；
   * 缺省时注入到 click-blockicon 事件自带的 subMenu（思源原生块菜单）。
   */
  menu?: Menu;
  /** 点击"可视化编辑"后的回调，参数为 Mermaid 块的 data-node-id。 */
  onOpenMermaidEditor: (blockId: string) => void;
}

/**
 * 判定元素是否为 Mermaid 代码块（纯 DOM 判定，可单测）。
 *
 * 判定信号（满足其一即真）：
 * 1. `data-type="code-block"` 且 `data-subtype="mermaid"`（思源 Lute 渲染主信号）；
 * 2. `data-type="code-block"` 且块内含 `code.language-mermaid` 元素
 *    （旧版本/渲染形态差异下的兜底信号）。
 */
export function isMermaidCodeBlock(el: HTMLElement | null | undefined): el is HTMLElement {
  if (!el || el.dataset.type !== "code-block") {
    return false;
  }
  return el.dataset.subtype === "mermaid" || el.querySelector("code.language-mermaid") !== null;
}

/**
 * 注册 block-icon 触发：监听 `click-blockicon`，命中 Mermaid 代码块时
 * 弹出含"可视化编辑"的菜单，点击回调 onOpenMermaidEditor(blockId)。
 * 返回卸载函数（移除监听，幂等）。
 */
export function registerBlockIconTrigger(options: BlockIconTriggerOptions): () => void {
  const { eventBus, menu: hostMenu, onOpenMermaidEditor } = options;

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
    if (hostMenu) {
      // 独立 Menu 承载：显式 open，锚点为被点击块的位置。
      hostMenu.addItem(menuItem);
      const rect = block.getBoundingClientRect();
      hostMenu.open({ x: rect.left, y: rect.top });
    } else {
      // 思源原生块菜单：事件携带的 subMenu 即将弹出，注入后项即随菜单展示。
      event.detail.menu.addItem(menuItem);
    }
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
