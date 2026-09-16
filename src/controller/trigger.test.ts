// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus, Menu as SiyuanMenu } from "siyuan";
import { isMermaidCodeBlock, registerBlockIconTrigger } from "./trigger";

/**
 * T9：block-icon 触发入口（REQ-TRIGGER-001 场景 1/2 / D §5.1）。
 *
 * 事实核实（2026-09-16，siyuan@1.2.7 类型定义 + 思源前端源码）：
 * - `click-blockicon` 事件负载 `{ menu: subMenu, protyle: IProtyle,
 *   blockElements: HTMLElement[] }`（siyuan.d.ts IEventBusMap）；
 * - `subMenu.addItem(IMenu)` 为块级菜单注入项的标准入口（思源官方 gutter 点击
 *   block-icon 后弹出块菜单并广播该事件，插件同步向 `detail.menu` 加项即出现在菜单中）；
 * - 块 DOM 约定：`data-node-id` = 块 id、`data-type="code-block"` = 代码块、
 *   `data-subtype="mermaid"` = Mermaid 语言标记（Lute 渲染）；另有
 *   `code.language-mermaid` class 兜底信号。
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

  /** 对齐 siyuan Menu：addItem/open 记录调用。 */
  class MockMenu {
    isOpen = false;
    element!: HTMLElement;
    addItem = vi.fn();
    open = vi.fn();
    close = vi.fn();
    addSeparator = vi.fn();
    showSubMenu = vi.fn();
    fullscreen = vi.fn();
    constructor() {
      this.element = document.createElement("div");
    }
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

  return { MockEventBus, MockMenu, MockSubMenu };
});

vi.mock("siyuan", () => ({
  EventBus: siyuanState.MockEventBus,
  Menu: siyuanState.MockMenu,
  subMenu: siyuanState.MockSubMenu,
}));

beforeEach(() => {
  document.body.innerHTML = "";
});

/** 构造思源 code-block DOM：Mermaid 代码块（data-subtype 语言标记形态）。 */
function buildMermaidBlock(blockId = "block-1"): HTMLElement {
  const el = document.createElement("div");
  el.dataset.type = "code-block";
  el.dataset.subtype = "mermaid";
  el.dataset.nodeId = blockId;
  return el;
}

/** 构造思源 code-block DOM：Mermaid 代码块（code 元素 language-mermaid class 形态）。 */
function buildMermaidBlockByCodeClass(blockId = "block-2"): HTMLElement {
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

describe("isMermaidCodeBlock", () => {
  it("data-subtype=mermaid 的 code-block → true", () => {
    expect(isMermaidCodeBlock(buildMermaidBlock())).toBe(true);
  });

  it("code 元素带 language-mermaid class 的 code-block → true", () => {
    expect(isMermaidCodeBlock(buildMermaidBlockByCodeClass())).toBe(true);
  });

  it("data-subtype 为其他语言的 code-block → false", () => {
    const el = document.createElement("div");
    el.dataset.type = "code-block";
    el.dataset.subtype = "javascript";
    expect(isMermaidCodeBlock(el)).toBe(false);
  });

  it("普通块（data-type 非 code-block）→ false", () => {
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
  it("点击 Mermaid 块 → 向事件 subMenu 注入'可视化编辑'项，点击回调 blockId", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    const unregister = registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      onOpenMermaidEditor,
    });

    const subMenu = new siyuanState.MockSubMenu();
    bus.emit("click-blockicon", {
      menu: subMenu,
      protyle: {},
      blockElements: [buildMermaidBlock("block-9")],
    });

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
    el.dataset.type = "code-block";
    el.dataset.subtype = "javascript";
    bus.emit("click-blockicon", { menu: subMenu, protyle: {}, blockElements: [el] });

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
    bus.emit("click-blockicon", { menu: subMenu, protyle: {}, blockElements: [el] });

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
    bus.emit("click-blockicon", { menu: subMenu, protyle: {}, blockElements: [] });

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
    bus.emit("click-blockicon", {
      menu: subMenu,
      protyle: {},
      blockElements: [buildMermaidBlock()],
    });
    expect(subMenu.addItem).not.toHaveBeenCalled();
    expect(onOpenMermaidEditor).not.toHaveBeenCalled();
  });

  it("传入 menu 时改由独立 Menu 承载并 open，事件 subMenu 不被注入", () => {
    const bus = new siyuanState.MockEventBus();
    const onOpenMermaidEditor = vi.fn();
    const hostMenu = new siyuanState.MockMenu();
    registerBlockIconTrigger({
      eventBus: bus as unknown as EventBus,
      menu: hostMenu as unknown as SiyuanMenu,
      onOpenMermaidEditor,
    });

    const eventSubMenu = new siyuanState.MockSubMenu();
    bus.emit("click-blockicon", {
      menu: eventSubMenu,
      protyle: {},
      blockElements: [buildMermaidBlock("block-7")],
    });

    expect(eventSubMenu.addItem).not.toHaveBeenCalled();
    expect(hostMenu.addItem).toHaveBeenCalledTimes(1);
    expect(hostMenu.open).toHaveBeenCalledTimes(1);
    const item = hostMenu.addItem.mock.calls[0]![0] as { label: string; click: () => void };
    expect(item.label).toBe("可视化编辑");
    item.click();
    expect(onOpenMermaidEditor).toHaveBeenCalledWith("block-7");
  });
});
