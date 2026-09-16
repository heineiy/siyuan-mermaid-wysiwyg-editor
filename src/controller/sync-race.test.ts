// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { AdapterRegistry } from "../adapters/registry";
import type { AdapterOptions, DiagramAdapter } from "../adapters/registry";
import { initEditorSession } from "./sync";

/**
 * T12 写回竞态防护测试（REQ-RACE-001 / design.md D4）。
 *
 * 竞态场景：一次写回（updateBlock）尚未完成时用户又产生新编辑 →
 * 旧编辑的回调必须被丢弃，最终代码块内容 = 最后一次编辑结果；
 * 且绝不能"读回旧文本覆盖新编辑"。
 *
 * 被测机制（sync.ts full 分支）：
 * - `isSyncing` 写回锁：updateBlock 进行中不并发执行第二个 updateBlock，
 *   锁内到达的写回记 pendingCode，由当前写回完成后补写；
 * - 编辑版本号 `editVersion`：每次 onGraphChange 递增；写回携带触发时版本
 *   快照 v，完成后若 `editVersion > v` 说明期间有新编辑——旧结果不得"收尾"。
 *
 * mock 策略（任务约束「mock 一切注入项」）：
 * - updateBlock 为**可控异步 Promise**（deferred：手动 resolve/reject），
 *   精确模拟"写回进行中"；
 * - 防抖窗口注入 debounceMs: 1（竞态语义与窗口时长无关，真实定时器 + async/await
 *   驱动，避免 fake timers 与微任务交错问题）；
 * - 适配器：真实 AdapterRegistry 注册 fake full 适配器，控制 init 收到的
 *   onGraphChange；兜底 ReadOnlyAdapter 经模块级 vi.mock 替换（沿用 T11 夹具）。
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

/** fake full 适配器：记录 init 收到的 code/opts，可模拟画布编辑回调。 */
class FakeFullAdapter implements DiagramAdapter {
  readonly type = "flowchart" as const;
  readonly supportLevel = "full" as const;
  initCalls: Array<{ code: string; opts: AdapterOptions }> = [];
  destroyCalls = 0;

  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: AdapterOptions): Promise<void> {
    this.initCalls.push({ code, opts });
    this.onChange = opts.onGraphChange;
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

/** 可控异步 Promise：手动 resolve/reject，模拟 updateBlock「进行中」状态。 */
interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const FENCED_FLOWCHART = "```mermaid\nflowchart TD;\n  A-->B\n```";

const makeContainer = (): HTMLDivElement => document.createElement("div");

const wrap = (code: string): string => `\`\`\`mermaid\n${code}\n\`\`\``;

const baseOpts = (overrides: Partial<Parameters<typeof initEditorSession>[0]> = {}) => ({
  blockId: "20230101000000",
  container: makeContainer(),
  registry: new AdapterRegistry(),
  getBlockMarkdown: () => FENCED_FLOWCHART,
  // 竞态测试默认注入可控异步 updateBlock：每次调用返回一个新 deferred，
  // 测试手动 resolve 模拟"写回完成"；debounceMs: 1 加速防抖窗口。
  updateBlock: () => new Promise<void>(() => {}),
  debounceMs: 1,
  ...overrides,
});

/** 构造一个"每次调用返回新 deferred 并记录 data 序列"的 updateBlock。 */
const makeControllableUpdateBlock = (): {
  updateBlock: Mock<(_id: string, data: string) => Promise<void>>;
  calls: string[];
  deferreds: Deferred[];
} => {
  const calls: string[] = [];
  const deferreds: Deferred[] = [];
  const updateBlock: Mock<(_id: string, data: string) => Promise<void>> = vi.fn(
    (_id: string, data: string): Promise<void> => {
      calls.push(data);
      const d = deferred();
      deferreds.push(d);
      return d.promise;
    }
  );
  return { updateBlock, calls, deferreds };
};

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

describe("T12 写回竞态防护（REQ-RACE-001 / D4）", () => {
  it("写回进行中（updateBlock 未 resolve）收到新 onGraphChange → 锁内不并发写回，完成后补写最后一次编辑", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, calls, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 第一次编辑：防抖窗口后触发写回（isSyncing=true，写回"进行中"未完成）
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe(wrap("flowchart TD;\n  A"));

    // 写回尚未完成时用户又编辑：防抖窗口后触发第二次写回 → 锁内到达 → 记 pending
    onChange("flowchart TD;\n  A --> B");
    await wait(10);

    // isSyncing 锁生效：不并发执行第二个 updateBlock
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 完成第一次写回 → 立即补写 pending 的最新内容（绝不丢弃最后一次编辑）
    deferreds[0]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe(wrap("flowchart TD;\n  A --> B"));

    // 补写完成后无多余写回
    deferreds[1]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(2);

    session.destroy();
  });

  it("isSyncing 期间连续两次新编辑不丢：最终一次写回携带最后一次编辑结果", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, calls, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 第一次写回进行中
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 写回期间两次新编辑（B → C）：第二次防抖触发时锁内到达 → pendingCode 取最新 C
    onChange("flowchart TD;\n  A --> B");
    await wait(10);
    onChange("flowchart TD;\n  A --> B --> C");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 完成第一次写回 → 补写最后一次编辑 C
    deferreds[0]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe(wrap("flowchart TD;\n  A --> B --> C"));

    deferreds[1]!.resolve();
    await wait(10);
    session.destroy();
  });

  it("版本号比对：过期回调的旧内容绝不写入，updateBlock 收到的 data 恒为最新 wrapFence 结果", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, calls, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 写回 A 进行中
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(calls[0]).toBe(wrap("flowchart TD;\n  A"));

    // 写回期间新编辑 B → 防抖触发 → 锁内 pending
    onChange("flowchart TD;\n  A --> B");
    await wait(10);

    // 完成 A 的写回：不得以旧内容 A 收尾——补写的是最新 B
    deferreds[0]!.resolve();
    await wait(10);

    // 写回序列严格单调"新"：A → B，且最后一次是 B（旧回调从未覆盖新编辑）
    expect(calls).toEqual([wrap("flowchart TD;\n  A"), wrap("flowchart TD;\n  A --> B")]);
    expect(updateBlock).toHaveBeenLastCalledWith("20230101000000", wrap("flowchart TD;\n  A --> B"));

    deferreds[1]!.resolve();
    await wait(10);
    session.destroy();
  });

  it("flushWrite 在竞态下：flush 的是最新版本（写回进行中 flush 新编辑 → 完成后立即补写最新）", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, calls, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 第一次写回进行中
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 写回期间新编辑 + 立即 flush（onBlur 场景）：防抖定时器被 flush 消费，
    // writeFenced 锁内到达 → pendingCode 记最新版本
    onChange("flowchart TD;\n  A --> B");
    session.flushWrite();
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 完成第一次写回 → 立即补写 flush 的最新版本（不等防抖窗口）
    deferreds[0]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe(wrap("flowchart TD;\n  A --> B"));

    deferreds[1]!.resolve();
    await wait(10);
    session.destroy();
  });

  it("flushWrite 在竞态下：写回进行中 flush 无新编辑 → 不重复写回（不并发、不重复）", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 第一次写回进行中（防抖已消费该编辑，无未决定时器）
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 写回进行中 flush：无未决变更 → 零副作用，不重复写回
    session.flushWrite();
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 完成写回 → 无 pending → 不再补写
    deferreds[0]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    session.destroy();
  });

  it("destroy 在写回进行中：flush 未决写回 + 完成后补写最后一次编辑（不丢最后编辑）", async () => {
    const adapter = new FakeFullAdapter();
    const registry = new AdapterRegistry();
    registry.register(adapter);
    const { updateBlock, calls, deferreds } = makeControllableUpdateBlock();

    const session = await initEditorSession(baseOpts({ registry, updateBlock }));
    const onChange = adapter.capturedOnChange();

    // 写回 A 进行中
    onChange("flowchart TD;\n  A");
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 写回期间新编辑 B → destroy（onDestroy 场景）：flush 触发锁内 pending
    onChange("flowchart TD;\n  A --> B");
    session.destroy();
    expect(updateBlock).toHaveBeenCalledTimes(1);

    // 完成 A 的写回 → 补写最后一次编辑 B（destroy 后仍不丢最后一次编辑）
    deferreds[0]!.resolve();
    await wait(10);
    expect(updateBlock).toHaveBeenCalledTimes(2);
    expect(calls[1]).toBe(wrap("flowchart TD;\n  A --> B"));

    deferreds[1]!.resolve();
    await wait(10);
  });
});
