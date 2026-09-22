// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus } from "siyuan";
import { isMermaidCodeBlock, registerBlockIconTrigger } from "./trigger";

// 菜单文案走 i18n：断言中文，需固定界面语言为 zh-CN
document.documentElement.setAttribute("lang", "zh-CN");

/**
 * T9：block-icon 触发入口（REQ-TRIGGER-001 场景 1/2 / D §5.1）。
 *
 * 事实核实（2026-09-16，思源 3.8.3 生产验证三重证据交叉确认）：
 * - `click-blockicon` 事件负载 `{ menu: subMenu, protyle, blockElements }`
 *   （siyuan.d.ts:191 IEventBusMap）；派发器派发前创建 subMenu 注入 detail.menu，
 *   插件 addItem 后由派发器挂入块菜单的「插件」子菜单（前端派发器源码 +
 *   参考插件 siyuan-plugin-task-note-management v7.1.1 生产代码同模式）。
 * - 块 DOM 实测：代码块元素 `div[data-type="NodeCodeBlock"][data-subtype="mermaid"]`
 *   （class="render-node"）；历史形态 `data-type="code-block"` + `code.language-mermaid`。
 *
 * 与 T8 的 dialog.test.ts 同一基建：vi.mock("siyuan") + happy-dom，
 * 事件总线/菜单均以最小 Mock 对齐思源真实 API 形态。
 */

const siyuanState = vi.hoisted(() => {
  /** 对齐 siyuan subMenu：addItem 记录注入项并压入 menus。 */
  class MockSubMenu {
    menus: Array<Record<string, unknown>> = [];
    addItem = vi.fn((menu: Record<string, unknown>) => {
      this.menus.push(menu);
    });
    addSeparator = vi.fn();
  }

  /** 对齐 siyuan EventBus：on/off 维护监听表，emit 派发 CustomEvent。 */
  class MockEventBus {
    handlers: Record<string, Array<(event: CustomEvent) => void>> = {};
    on = vi.fn((type: string, listener: (event: CustomEvent) => void) => {
      (this.handlers[type] ??= []).push(listener);
    });
    off = vi.fn((type: string, listener: (event: CustomEvent) => void) => {
      const list = this.handlers[type];
      if (!list) {
        return;
      }
      const index = list.indexOf(listener);
      if (index >= 0) {
        list.splice(index, 1);
      }
    });
    emit = vi.fn((type: string, detail?: unknown) => {
      const list = this.handlers[type] ?? [];
      for (const listener of [...list]) {
        listener(new CustomEvent(type, { detail }));
      }
      return true;
    });
  }

  return { MockEventBus, MockSubMenu };
});

vi.mock("siyuan", () => ({
  EventBus: siyuanState.MockEventBus,
  subMenu: siyuanState.MockSubMenu,
  fetchSyncPost: vi.fn(),
}));

beforeEach(() => {
  document.body.innerHTML = "";
});

/** 构造思源 3.8.3 代码块 DOM：data-type="NodeCodeBlock" + data-subtype="mermaid"。 */
function buildMermaidBlock(blockId = "block-1"): HTMLElement {
  const el = document.createElement("div");
  el.dataset.type = "NodeCodeBlock";
  el.dataset.subtype = "mermaid";
  el.dataset.nodeId = blockId;
  el.classList.add("render-node");
  return el;
}

/** 构造历史形态代码块 DOM：data-type="code-block" + code.language-mermaid 兜底信号。 */
function buildMermaidBlockLegacy(blockId = "block-2"): HTMLElement {
  const el = document.createElement("div");
  el.dataset.type = "code-block";
  el.dataset.nodeId = blockId;
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.className = "language-mermaid";
  pre.appendChild(code);
  el.appendChild(pre);
  return el;
}

/** 派发 click-blockicon（对齐思源派发器：detail 携带注入的 menu subMenu）。 */
function emitClickBlockIcon(
  bus: InstanceType<typeof siyuanState.MockEventBus>,
  subMenu: InstanceType<typeof siyuanState.MockSubMenu>,
  blocks: HTMLElement[],
): void {
  bus.emit("click-blockicon", { menu: subMenu, protyle: {}, blockElements: blocks });
}

describe("isMermaidCodeBlock", () => {
  it("NodeCodeBlock + data-subtype=mermaid → true（3.8.3 主形态）", () => {
    expect(isMermaidCodeBlock(buildMermaidBlock())).toBe(true);
  });

  it("code-block + code 元素带 language-mermaid class → true（历史兜底形态）", () => {
    expect(isMermaidCodeBlock(buildMermaidBlockLegacy())).toBe(true);
  });

  it("data-subtype 为其他语言的代码块 → false", () => {
    const el = document.createElement("div");
    el.dataset.type = "NodeCodeBlock";
    el.dataset.subtype = "javascript";
    expect(isMermaidCodeBlock(el)).toBe(false);
  });

  it("普通块（data-type 非代码块）→ false", () => {
    const el = document.createElement("div");
    el.dataset.type = "p";
    el.dataset.nodeId = "block-3";
    expect(isMermaidCodeBlock(el)).toBe(false);
  });

  it("null / undefined → false", () => {
    expect(isMermaidCodeBlock(null)).toBe(false);
    expect(isMermaidCodeBlock(undefined)).toBe(false);
  });
});

describe("registerBlockIconTrigger", () => {
  it("点击 Mermaid 块 → 向 detail.menu 注入'可视化编辑'项，点击回调 blockId", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    const unregister = registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });

    const subMenu = new siyuanState.MockSubMenu();
    emitClickBlockIcon(bus, subMenu, [buildMermaidBlock("block-9")]);

    expect(subMenu.addItem).toHaveBeenCalledTimes(1);
    const item = subMenu.addItem.mock.calls[0]![0] as { label: string; click: () => void };
    expect(item.label).toBe("可视化编辑");

    // 点击菜单项 → 回调拿到 block DOM 上的 data-node-id
    item.click();
    expect(onOpenMermaidEditor).toHaveBeenCalledTimes(1);
    expect(onOpenMermaidEditor).toHaveBeenCalledWith("block-9");

    unregister();
  });

  it("点击非 Mermaid 代码块 → 不注入菜单项、无回调", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });

    const subMenu = new siyuanState.MockSubMenu();
    const el = document.createElement("div");
    el.dataset.type = "NodeCodeBlock";
    el.dataset.subtype = "javascript";
    emitClickBlockIcon(bus, subMenu, [el]);

    expect(subMenu.addItem).not.toHaveBeenCalled();
    expect(onOpenMermaidEditor).not.toHaveBeenCalled();
  });

  it("点击普通块 → 不注入菜单项、无回调", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });

    const subMenu = new siyuanState.MockSubMenu();
    const el = document.createElement("div");
    el.dataset.type = "p";
    el.dataset.nodeId = "block-3";
    emitClickBlockIcon(bus, subMenu, [el]);

    expect(subMenu.addItem).not.toHaveBeenCalled();
    expect(onOpenMermaidEditor).not.toHaveBeenCalled();
  });

  it("blockElements 为空 → 不注入菜单项、无回调", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });

    const subMenu = new siyuanState.MockSubMenu();
    emitClickBlockIcon(bus, subMenu, []);

    expect(subMenu.addItem).not.toHaveBeenCalled();
    expect(onOpenMermaidEditor).not.toHaveBeenCalled();
  });

  it("卸载函数移除监听且幂等：再次点击 Mermaid 块无任何副作用", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    const unregister = registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });
    expect(bus.handlers["click-blockicon"]).toHaveLength(1);

    unregister();
    unregister(); // 幂等

    expect(bus.handlers["click-blockicon"]).toHaveLength(0);
    const subMenu = new siyuanState.MockSubMenu();
    emitClickBlockIcon(bus, subMenu, [buildMermaidBlock()]);
    expect(subMenu.addItem).not.toHaveBeenCalled();
    expect(onOpenMermaidEditor).not.toHaveBeenCalled();
  });
});
