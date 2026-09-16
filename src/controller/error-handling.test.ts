// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdapterRegistry } from "../adapters/registry";
import type { AdapterOptions, DiagramAdapter } from "../adapters/registry";
import { VisimerLoadError } from "../render/visimer-backend";
import { initEditorSession } from "./sync";

/**
 * T13 语法/加载错误保护测试（REQ-ERROR-001 / design.md Risks）。
 *
 * 核心语义：解析/渲染异常时**保留原文本不写回**（updateBlock 零调用）+ 画布展示
 * 可读错误提示；错误路径不抛未捕获异常（Promise 拒绝均被捕获）。
 *
 * 覆盖错误来源：
 * 1. Visimer 懒加载失败（VisimerLoadError）：错误提示渲染进容器、零 updateBlock、
 *    destroy 可调用；
 * 2. 通用 backend.init 拒绝（任意 Error）：同上语义；
 * 3. init 失败后写回通道不可达：适配器残留的 onGraphChange / flushWrite 均不触发
 *    updateBlock（「不建立写回通道」的可观测语义）；
 * 4. ReadOnlyAdapter onError 路径：只读渲染失败 → 提示渲染进容器、零 updateBlock
 *    （经 sync 路由 readonly 会话验证——兜底 ReadOnlyAdapter 由 sync 注入 onError）；
 * 5. 错误后 destroy 幂等：重复调用不抛、适配器只销毁一次。
 *
 * mock 策略（沿用 T11/T12 夹具）：
 * - 兜底 ReadOnlyAdapter 模块 mock：构造时捕获注入选项（含 onError），failWith 模拟
 *   真实 ReadOnlyAdapter 渲染失败后的 onError 触发（真实实现见 readonly-adapter.test.ts）；
 * - fake full 适配器：rejectInitWith 控制 init 拒绝，且 init 在拒绝前已持有
 *   onGraphChange（模拟真实适配器残留回调场景）。
 */

/** 兜底 ReadOnlyAdapter 模块 mock：sync.ts 内部 `new ReadOnlyAdapter()` 落到本类。 */
const readonlyMock = vi.hoisted(() => {
  class MockReadOnlyAdapter {
    static instances: MockReadOnlyAdapter[] = [];
    readonly type = "*" as const;
    readonly supportLevel = "readonly" as const;
    init = vi.fn();
    destroy = vi.fn();
    private readonly options: { onError?: (err: unknown) => void };
    constructor(options: { onError?: (err: unknown) => void } = {}) {
      this.options = options;
      MockReadOnlyAdapter.instances.push(this);
    }
    /** 模拟只读渲染失败：触发 sync 注入的 onError（与真实 ReadOnlyAdapter catch 一致）。 */
    failWith(err: unknown): void {
      this.options.onError?.(err);
    }
  }
  return { MockReadOnlyAdapter };
});

vi.mock("../adapters/readonly-adapter", () => ({
  ReadOnlyAdapter: readonlyMock.MockReadOnlyAdapter,
}));

/** fake full 适配器：init 拒绝前已持有 onGraphChange（模拟残留回调），记录 init/destroy。 */
class FakeFullAdapter implements DiagramAdapter {
  readonly type = "flowchart" as const;
  readonly supportLevel = "full" as const;
  initCalls = 0;
  destroyCalls = 0;
  /** 设置后 init 以该 Error 拒绝（模拟 backend init 失败，如 VisimerLoadError）。 */
  rejectInitWith: Error | null = null;

  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: AdapterOptions): Promise<void> {
    this.initCalls += 1;
    // 与真实适配器一致：先接住 onGraphChange 再失败（残留回调场景）。
    this.onChange = opts.onGraphChange;
    if (this.rejectInitWith) {
      throw this.rejectInitWith;
    }
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  /** 模拟用户在画布中编辑后触发 onGraphChange（含 init 失败后的残留回调）。 */
  emitChange(code: string): void {
    this.onChange?.(code);
  }
}

const FENCED_FLOWCHART = "```mermaid\nflowchart TD;\n  A-->B\n```";

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

describe("T13 backend init 拒绝（REQ-ERROR-001）", () => {
  it("Visimer 懒加载失败（backend.init 拒绝 VisimerLoadError）：错误提示渲染进容器、updateBlock 零调用、destroy 可调用", async () => {
    const adapter = new FakeFullAdapter();
    adapter.rejectInitWith = new VisimerLoadError("@visimer/dom", new Error("404 not found"));
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    // initEditorSession 正常 resolve（不抛未捕获异常），错误 message 渲染进画布容器
    const session = await initEditorSession(baseOpts({ registry, container, updateBlock }));

    expect(container.querySelector(".mermaid-wysiwyg-error")).not.toBeNull();
    expect(container.textContent).toContain("可视化编辑器加载失败");
    expect(container.textContent).toContain("无法加载 Visimer 渲染模块");
    // 保留原文本：不写回
    expect(updateBlock).not.toHaveBeenCalled();

    // 会话仍可安全销毁
    session.destroy();
    expect(adapter.destroyCalls).toBe(1);
  });

  it("通用 backend.init 拒绝（任意 Error）：同上语义（提示渲染 + 零 updateBlock + destroy 可调用）", async () => {
    const adapter = new FakeFullAdapter();
    adapter.rejectInitWith = new Error("backend crashed");
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(baseOpts({ registry, container, updateBlock }));

    expect(container.querySelector(".mermaid-wysiwyg-error")).not.toBeNull();
    expect(container.textContent).toContain("可视化编辑器加载失败");
    expect(container.textContent).toContain("backend crashed");
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(adapter.destroyCalls).toBe(1);
  });

  it("init 失败后不建立写回通道：适配器残留 onGraphChange / flushWrite 均不触发 updateBlock", async () => {
    const adapter = new FakeFullAdapter();
    adapter.rejectInitWith = new Error("boom");
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(baseOpts({ registry, container, updateBlock }));

    // 即使适配器在 init 失败后仍残留 onGraphChange 回调：也不写回
    adapter.emitChange("flowchart TD;\n  A --> B");
    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();
  });

  it("错误后 destroy 幂等：重复调用不抛，适配器只销毁一次", async () => {
    const adapter = new FakeFullAdapter();
    adapter.rejectInitWith = new Error("boom");
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const updateBlock = vi.fn();
    const container = makeContainer();

    const session = await initEditorSession(baseOpts({ registry, container, updateBlock }));
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(adapter.destroyCalls).toBe(1);
    // destroy 幂等：重复调用不再触发
    session.destroy();
    expect(adapter.destroyCalls).toBe(1);
  });
});

describe("T13 ReadOnlyAdapter onError 路径（REQ-ERROR-001 只读渲染失败）", () => {
  it("只读渲染失败 → 错误提示渲染进容器、零 updateBlock（sync 经 readonly 路由注入 onError）", async () => {
    const registry = new AdapterRegistry(); // 空注册表：known-readonly 类型走兜底 ReadOnlyAdapter
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

    // sync 已把 onError 注入兜底 ReadOnlyAdapter：渲染失败触发 → 提示渲染进容器
    expect(readonlyMock.MockReadOnlyAdapter.instances).toHaveLength(1);
    readonlyMock.MockReadOnlyAdapter.instances[0]!.failWith(new Error("parse failed: unknown diagram"));

    expect(container.querySelector(".mermaid-wysiwyg-error")).not.toBeNull();
    expect(container.textContent).toContain("只读预览渲染失败");
    expect(container.textContent).toContain("parse failed: unknown diagram");
    // 不写回坏数据：updateBlock 零调用（含 flush）
    expect(updateBlock).not.toHaveBeenCalled();
    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();

    session.destroy();
    expect(readonlyMock.MockReadOnlyAdapter.instances[0]!.destroy).toHaveBeenCalledTimes(1);
  });
});
