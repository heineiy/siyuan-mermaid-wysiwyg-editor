// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "../adapters/registry";
import type { AdapterOptions, DiagramAdapter } from "../adapters/registry";
import { initEditorSession } from "./sync";

/**
 * T11 双向同步协调器测试（REQ-READ-001 / REQ-WRITE-001 / REQ-DEBOUNCE-001）。
 *
 * 核心闭环：正向 getBlockMarkdown → stripFence 剥离围栏 → route → adapter.init；
 * 反向 onGraphChange → 防抖（500ms）聚合 → wrapFence 包回 → updateBlock。
 *
 * mock 策略（任务约束「mock 一切注入项」）：
 * - getBlockMarkdown / updateBlock：vi.fn / 内联函数注入；
 * - 适配器：真实 AdapterRegistry 中注册 fake 适配器（控制 init 收到的 code /
 *   onGraphChange / init 拒绝），兜底 ReadOnlyAdapter 经模块级 vi.mock 替换；
 * - 容器：happy-dom 真实 div（验证错误/提示文案渲染进画布容器）。
 */

/** 兜底 ReadOnlyAdapter 模块 mock：sync.ts 内部 `new ReadOnlyAdapter()` 落到本类。 */
const readonlyMock = vi.hoisted(() => {
  class MockReadOnlyAdapter {
    static instances: MockReadOnlyAdapter[] = [];
    readonly type = "*" as const;
    readonly supportLevel = "readonly" as const;
    init = vi.fn();
    destroy = vi.fn();
    constructor() {
      MockReadOnlyAdapter.instances.push(this);
    }
  }
  return { MockReadOnlyAdapter };
});

vi.mock("../adapters/readonly-adapter", () => ({
  ReadOnlyAdapter: readonlyMock.MockReadOnlyAdapter,
}));

/** fake full 适配器：记录 init 收到的 code/opts，可模拟画布编辑回调与 init 拒绝。 */
class FakeFullAdapter implements DiagramAdapter {
  readonly type = "flowchart" as const;
  readonly supportLevel = "full" as const;
  initCalls: Array<{ code: string; opts: AdapterOptions }> = [];
  destroyCalls = 0;
  /** 设置后 init 以该 Error 拒绝（模拟 backend init 失败，如 VisimerLoadError）。 */
  rejectInitWith: Error | null = null;

  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: AdapterOptions): Promise<void> {
    this.initCalls.push({ code, opts });
    this.onChange = opts.onGraphChange;
    if (this.rejectInitWith) {
      throw this.rejectInitWith;
    }
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  /** 模拟用户在画布中编辑后触发 onGraphChange。 */
  emitChange(code: string): void {
    this.onChange?.(code);
  }

  /** 取出 init 时透传给适配器的 onGraphChange 回调。 */
  capturedOnChange(): (code: string) => void {
    expect(this.initCalls).toHaveLength(1);
    return this.initCalls[0]!.opts.onGraphChange;
  }
}

/** fake readonly 适配器：只读渲染（不回调 onGraphChange），记录 init/destroy。 */
class FakeReadonlyAdapter implements DiagramAdapter {
  readonly type = "sequenceDiagram" as const;
  readonly supportLevel = "readonly" as const;
  initCalls = 0;
  destroyCalls = 0;

  init(_code: string, _opts: AdapterOptions): void {
    this.initCalls += 1;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }
}

// 注：首行用 "flowchart" 而非旧语法 "graph"——router.detectDiagramType 取首个 token，
// "graph" 不在 KNOWN_DIAGRAM_TYPES 会落 unknown 分支（router 既有语义，测试对齐之）。
const FENCED_FLOWCHART = "```mermaid\nflowchart TD;\n  A-->B\n```";
const STRIPPED_FLOWCHART = "flowchart TD;\n  A-->B";

const makeContainer = (): HTMLDivElement => document.createElement("div");

const baseOpts = (overrides: Partial<Parameters<typeof initEditorSession>[0]> = {}) => ({
  blockId: "20230101000000",
  container: makeContainer(),
  registry: new AdapterRegistry(),
  getBlockMarkdown: () => FENCED_FLOWCHART,
  updateBlock: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  readonlyMock.MockReadOnlyAdapter.instances.length = 0;
  for (const inst of readonlyMock.MockReadOnlyAdapter.instances) {
    inst.init.mockClear();
    inst.destroy.mockClear();
  }
});

afterEach(() => {
  vi.useRealTimers();
});

describe("T11 正向流（REQ-READ-001）", () => {
  it("full 路由：adapter.init 收到 stripFence 剥离后的纯文本，容器/onGraphChange 透传", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(
      baseOpts({ registry, container, updateBlock, getBlockMarkdown: () => FENCED_FLOWCHART })
    );

    expect(adapter.initCalls).toHaveLength(1);
    expect(adapter.initCalls[0]!.code).toBe(STRIPPED_FLOWCHART);
    expect(adapter.initCalls[0]!.opts.container).toBe(container);
    expect(typeof adapter.initCalls[0]!.opts.onGraphChange).toBe("function");
    // 只建立画布，不主动写回
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
  });
});

describe("T11 反向流（REQ-WRITE-001 / REQ-DEBOUNCE-001）", () => {
  it("onGraphChange 连续高频调用（<500ms）→ updateBlock 零调用；停顿 500ms → 恰好一次 wrapFence 内容", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new FakeFullAdapter();
      const registry = new AdapterRegistry();
      registry.register(adapter);
      const updateBlock = vi.fn();

      const session = await initEditorSession(baseOpts({ registry, updateBlock }));
      const onChange = adapter.capturedOnChange();

      onChange("graph TD;\n  A-->B --> C");
      onChange("graph TD;\n  A-->B --> C --> D");
      expect(updateBlock).not.toHaveBeenCalled();

      // 停顿不足 500ms：仍不写回
      vi.advanceTimersByTime(499);
      expect(updateBlock).not.toHaveBeenCalled();

      // 满 500ms：恰好一次，内容为 wrapFence(最后一次 newCode)
      vi.advanceTimersByTime(1);
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock).toHaveBeenCalledWith(
        "20230101000000",
        "```mermaid\ngraph TD;\n  A-->B --> C --> D\n```"
      );

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("debounceMs 可配置：按注入窗口聚合写回", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new FakeFullAdapter();
      const registry = new AdapterRegistry();
      registry.register(adapter);
      const updateBlock = vi.fn();

      const session = await initEditorSession(baseOpts({ registry, updateBlock, debounceMs: 100 }));
      const onChange = adapter.capturedOnChange();

      onChange("graph TD;\n  X");
      vi.advanceTimersByTime(99);
      expect(updateBlock).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock).toHaveBeenCalledWith("20230101000000", "```mermaid\ngraph TD;\n  X\n```");

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushWrite（onBlur 场景）：立即写回一次且不重复", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new FakeFullAdapter();
      const registry = new AdapterRegistry();
      registry.register(adapter);
      const updateBlock = vi.fn();

      const session = await initEditorSession(baseOpts({ registry, updateBlock }));
      const onChange = adapter.capturedOnChange();

      onChange("graph TD;\n  A");
      session.flushWrite();

      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock).toHaveBeenCalledWith("20230101000000", "```mermaid\ngraph TD;\n  A\n```");

      // 已 flush 清除定时器：再等待也不重复
      vi.advanceTimersByTime(1000);
      expect(updateBlock).toHaveBeenCalledTimes(1);

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushWrite 无未决写回时不触发", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
  });
});

describe("T11 readonly / unknown 路由（不建立写回通道）", () => {
  it("readonly 路由：已注册 readonly 适配器只读渲染，updateBlock 零调用，flush 无副作用", async () => {
    const ro = new FakeReadonlyAdapter();
    const registry = new AdapterRegistry();
    registry.register(ro);
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(
      baseOpts({
        registry,
        container,
        updateBlock,
        getBlockMarkdown: () => "```mermaid\nsequenceDiagram\n  A->>B: hi\n```",
      })
    );

    expect(ro.initCalls).toBe(1);
    expect(updateBlock).not.toHaveBeenCalled();

    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(ro.destroyCalls).toBe(1);
  });

  it("readonly 路由：无已注册 readonly 适配器时 new ReadOnlyAdapter 兜底，不写回", async () => {
    const registry = new AdapterRegistry(); // 空注册表
    const updateBlock = vi.fn();

    const session = await initEditorSession(
      baseOpts({
        registry,
        updateBlock,
        getBlockMarkdown: () => "```mermaid\ngantt\n  title A\n  section S\n  task :a1, 2026-01-01, 1d\n```",
      })
    );

    expect(readonlyMock.MockReadOnlyAdapter.instances).toHaveLength(1);
    const fallback = readonlyMock.MockReadOnlyAdapter.instances[0]!;
    expect(fallback.init).toHaveBeenCalledTimes(1);
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(fallback.destroy).toHaveBeenCalledTimes(1);
  });

  it("unknown 路由：提示文案渲染进容器 + 兜底 ReadOnlyAdapter init + 不写回", async () => {
    const registry = new AdapterRegistry();
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(
      baseOpts({
        registry,
        container,
        updateBlock,
        getBlockMarkdown: () => "```mermaid\nzenuml\n  A->B\n```",
      })
    );

    // 提示文案渲染进画布容器
    expect(container.textContent).toContain("该图类型暂不支持可视化编辑");
    // 兜底 ReadOnlyAdapter 已 init
    expect(readonlyMock.MockReadOnlyAdapter.instances).toHaveLength(1);
    expect(readonlyMock.MockReadOnlyAdapter.instances[0]!.init).toHaveBeenCalledTimes(1);
    // 不建立写回
    expect(updateBlock).not.toHaveBeenCalled();
    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(readonlyMock.MockReadOnlyAdapter.instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("T11 会话生命周期（destroy）", () => {
  it("destroy：flush 未决写回一次 + adapter.destroy 被调 + 后续 onGraphChange 不再写回", async () => {
    vi.useFakeTimers();
    try {
      const adapter = new FakeFullAdapter();
      const registry = new AdapterRegistry();
      registry.register(adapter);
      const updateBlock = vi.fn();

      const session = await initEditorSession(baseOpts({ registry, updateBlock }));
      const onChange = adapter.capturedOnChange();

      onChange("graph TD;\n  X");
      session.destroy();

      // 未决写回被 flush 一次
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock).toHaveBeenCalledWith("20230101000000", "```mermaid\ngraph TD;\n  X\n```");
      expect(adapter.destroyCalls).toBe(1);

      // destroy 后 onGraphChange 不再写回（即使等待满防抖窗口）
      onChange("graph TD;\n  Y");
      vi.advanceTimersByTime(1000);
      expect(updateBlock).toHaveBeenCalledTimes(1);

      // destroy 幂等：重复调用不再触发
      session.destroy();
      expect(adapter.destroyCalls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backend init 拒绝（如 VisimerLoadError）：错误信息渲染进容器，不抛未捕获异常", async () => {
    const adapter = new FakeFullAdapter();
    adapter.rejectInitWith = new Error("VisimerLoadError: 后端模块未就绪");
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    // initEditorSession 正常 resolve（不抛未捕获异常），错误 message 渲染进画布容器
    const session = await initEditorSession(baseOpts({ registry, container, updateBlock }));

    expect(container.textContent).toContain("VisimerLoadError: 后端模块未就绪");
    expect(updateBlock).not.toHaveBeenCalled();

    // 会话仍可安全销毁（适配器 destroy 被调）
    session.destroy();
    expect(adapter.destroyCalls).toBe(1);
  });
});
