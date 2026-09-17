// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendFactory, RenderBackend, RenderBackendOptions } from "./backend";

/**
 * T4 接口契约测试（REQ-BACKEND-001 / REQ-RENDER-001）。
 *
 * 测试策略：真实 @visimer/core/@visimer/dom 需要 mermaid 渲染 + 完整 DOM，
 * 单测环境（happy-dom）不具备真实 mermaid 运行能力，因此对 Visimer 做 vi.mock，
 * 验证 VisimerBackend 正确组装 MermaidWysiwygEditor + MermaidCanvasView、
 * 正确订阅 change 事件并转发给 onGraphChange、destroy 正确清理。
 */

const mocks = vi.hoisted(() => {
  class MockEditor {
    result = { typeInfo: { id: "flowchart", capability: "edit" }, flowchart: { direction: "TD" } };
    selection: string[] = [];
    canUndo = false;
    canRedo = false;
    dispatch = vi.fn(() => ({ created: [] }));
    undo = vi.fn();
    redo = vi.fn();
    deleteEntities = vi.fn();
    code = "";
    code: string;
    changeHandlers: Array<({ code }: { code: string }) => void> = [];
    constructor(opts: { code: string }) {
      this.code = opts.code;
    }
    on(event: string, fn: ({ code }: { code: string }) => void): () => void {
      if (event === "change") {
        this.changeHandlers.push(fn);
      }
      return () => {
        this.changeHandlers = this.changeHandlers.filter((h) => h !== fn);
      };
    }
    emitChange(newCode: string): void {
      for (const h of [...this.changeHandlers]) {
        h({ code: newCode });
      }
    }
  }

  class MockView {
    renderError: string | null = null;
    setTool = vi.fn();
    addNode = vi.fn();
    toolChangeHandlers: Array<() => void> = [];
    on = vi.fn((event: string, fn: () => void) => { if (event === "render") this.toolChangeHandlers.push(fn); return () => {}; });
    editor: unknown;
    container: unknown;
    mermaid: unknown;
    destroyCalls = 0;
    constructor(opts: { editor: unknown; container: unknown; mermaid: unknown }) {
      this.editor = opts.editor;
      this.container = opts.container;
      this.mermaid = opts.mermaid;
    }
    destroy(): void {
      this.destroyCalls += 1;
    }
  }

  return {
    MockEditor,
    MockView,
    editorCtor: vi.fn().mockImplementation(function(opts) { return new MockEditor(opts); }),
    viewCtor: vi.fn().mockImplementation(function(opts) { return new MockView(opts); }),
  };
});

vi.mock("@visimer/core", () => ({
  MermaidWysiwygEditor: mocks.editorCtor,
  bindTextPane: vi.fn().mockReturnValue({
    applying: false,
    notifyTextChange: vi.fn(),
    notifyCaretMove: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    dispose: vi.fn(),
  }),
}));

vi.mock("@visimer/dom", () => ({
  MermaidCanvasView: mocks.viewCtor,
}));

vi.mock("@visimer/codemirror", () => ({
  MermaidCodeMirror: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn(), view: { destroy: vi.fn() } };
  }),
}));

/** 最小 mock mermaid：满足 MermaidLike 形状。 */
const mockMermaid = {
  initialize: vi.fn(),
  render: vi.fn().mockResolvedValue({ svg: "<svg></svg>" }),
  parse: vi.fn().mockResolvedValue({}),
};

function makeContainer(): HTMLElement {
  return document.createElement("div");
}

/** REQ-BACKEND-001 场景用的 fake 后端。 */
class FakeBackend implements RenderBackend {
  initCalls: string[] = [];
  destroyCalls = 0;
  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: RenderBackendOptions): Promise<void> {
    this.initCalls.push(code);
    this.onChange = opts.onGraphChange;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  emitChange(code: string): void {
    this.onChange?.(code);
  }
}

async function runBackendSession(
  backend: RenderBackend,
  code: string,
  opts: RenderBackendOptions,
): Promise<void> {
  await backend.init(code, opts);
  backend.destroy();
}

describe("RenderBackend 可替换契约（REQ-BACKEND-001）", () => {
  it("满足接口的 fake 后端可被通用消费方注入使用", async () => {
    const onGraphChange = vi.fn();
    const fake = new FakeBackend();
    await runBackendSession(fake, "flowchart TD\n  A --> B", { container: makeContainer(), onGraphChange });
    expect(fake.initCalls).toEqual(["flowchart TD\n  A --> B"]);
    expect(fake.destroyCalls).toBe(1);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("fake 后端编辑后触发 onGraphChange(newCode)", async () => {
    const onGraphChange = vi.fn();
    const fake = new FakeBackend();
    await fake.init("flowchart TD\n  A --> B", { container: makeContainer(), onGraphChange });
    fake.emitChange("flowchart TD\n  A --> B --> C");
    expect(onGraphChange).toHaveBeenCalledExactlyOnceWith("flowchart TD\n  A --> B --> C");
  });

  it("BackendFactory 使后端可按 id 注入", () => {
    const factory: BackendFactory = { id: "fake", create: () => new FakeBackend() };
    const backend = factory.create();
    expect(backend).toBeInstanceOf(FakeBackend);
    expect(typeof backend.init).toBe("function");
    expect(typeof backend.destroy).toBe("function");
  });
});

describe("VisimerBackend 真实组装", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("init 创建 MermaidWysiwygEditor + MermaidCanvasView，传正确参数", async () => {
    const { VisimerBackend } = await import("./visimer-backend");
    const backend = new VisimerBackend({ mermaidInstance: mockMermaid as unknown as typeof import("mermaid").default });
    const container = makeContainer();
    const onGraphChange = vi.fn();

    await backend.init("flowchart TD\n  A --> B", { container, onGraphChange });

    expect(mocks.editorCtor).toHaveBeenCalledExactlyOnceWith({ code: "flowchart TD\n  A --> B" });
    // container 不再是原始 container——backend 内部会创建 flex 布局 + canvasSlot，
    // viewCtor 接到的是 layout 内部的 canvas-slot div。用 .mw-canvas-slot class 校验即可。
    const calledContainer = mocks.viewCtor.mock.calls[0]?.[0]?.container as HTMLElement;
    expect(calledContainer.classList.contains("mw-canvas-slot")).toBe(true);
    // 原始 container 应该已经被改成 flex column + 含 toolbar + body 结构
    expect(container.style.display).toBe("flex");
    expect(container.style.flexDirection).toBe("column");
    expect(container.children.length).toBe(3); // toolbar + body
    expect(mocks.viewCtor).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      editor: expect.any(mocks.MockEditor),
      mermaid: mockMermaid,
      panZoom: true,
      readOnly: false,
      accentColor: "#2b6cb0",
    }));
  });

  it("editor change 事件转发到 onGraphChange（REQ-RENDER-001 反向流）", async () => {
    const { VisimerBackend } = await import("./visimer-backend");
    const backend = new VisimerBackend({ mermaidInstance: mockMermaid as unknown as typeof import("mermaid").default });
    const onGraphChange = vi.fn();
    const container = makeContainer();

    await backend.init("flowchart TD\n  A --> B", { container, onGraphChange });

    const editor = mocks.editorCtor.mock.results[0]?.value as InstanceType<typeof mocks.MockEditor>;
    editor.emitChange("flowchart TD\n  A[Start] --> B");
    expect(onGraphChange).toHaveBeenCalledExactlyOnceWith("flowchart TD\n  A[Start] --> B");
  });

  it("destroy 清理 view + 解绑 change 订阅，幂等", async () => {
    const { VisimerBackend } = await import("./visimer-backend");
    const backend = new VisimerBackend({ mermaidInstance: mockMermaid as unknown as typeof import("mermaid").default });
    const container = makeContainer();
    const onGraphChange = vi.fn();

    await backend.init("flowchart TD\n  A --> B", { container, onGraphChange });

    backend.destroy();
    const view = mocks.viewCtor.mock.results[0]?.value as InstanceType<typeof mocks.MockView>;
    expect(view.destroyCalls).toBe(1);

    backend.destroy();
    expect(view.destroyCalls).toBe(1);

    const editor = mocks.editorCtor.mock.results[0]?.value as InstanceType<typeof mocks.MockEditor>;
    editor.emitChange("new code");
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("destroy 幂等：未 init 时重复调用不抛", async () => {
    const { VisimerBackend } = await import("./visimer-backend");
    const backend = new VisimerBackend();
    expect(() => {
      backend.destroy();
      backend.destroy();
    }).not.toThrow();
  });

  it("重复 init 先销毁旧实例再重建（幂等保护）", async () => {
    const { VisimerBackend } = await import("./visimer-backend");
    const backend = new VisimerBackend({ mermaidInstance: mockMermaid as unknown as typeof import("mermaid").default });
    const container = makeContainer();
    const onGraphChange = vi.fn();

    await backend.init("code1", { container, onGraphChange });
    const view1 = mocks.viewCtor.mock.results[0]?.value as InstanceType<typeof mocks.MockView>;

    await backend.init("code2", { container, onGraphChange });
    const view2 = mocks.viewCtor.mock.results[1]?.value as InstanceType<typeof mocks.MockView>;

    expect(view1.destroyCalls).toBe(1);
    expect(view2.destroyCalls).toBe(0);
  });
});
