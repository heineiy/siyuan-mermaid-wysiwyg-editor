// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { AdapterRegistry } from "../adapters/registry";
import type { AdapterOptions, DiagramAdapter } from "../adapters/registry";
import { FlowChartAdapter } from "../adapters/flowchart-adapter";
import { ReadOnlyAdapter } from "../adapters/readonly-adapter";
import { route } from "../adapters/router";
import type { BackendFactory, RenderBackend, RenderBackendOptions } from "../render/backend";
import { initEditorSession } from "../controller/sync";
import type { EditorSession } from "../controller/sync";
import { stripFence, wrapFence } from "../utils/fence";

/**
 * T14 验收用例套件（§11 四项验收，w6-acceptance / REQ-STORAGE-001 / tasks.md T14）。
 *
 * 真实思源宿主不可用（2026-09-16），本套件以「模拟宿主 + 全链路组装」验证闭环语义：
 * - **真实实现**：AdapterRegistry / FlowChartAdapter / ReadOnlyAdapter / route /
 *   initEditorSession / stripFence / wrapFence / createDebounce 全部为真实代码
 *   （不 mock 被测核心）；
 * - **仅 mock 注入项**：宿主 getBlockMarkdown / updateBlock（vi.fn 注入）；
 *   渲染后端经 REQ-BACKEND-001 可替换 seam 注入 fake（真实 @visimer/dom 未发布到
 *   npm，见 render/visimer-backend.ts 事实核实），实现 RenderBackend 接口、
 *   可编程触发 onGraphChange（模拟拖拽/改字）、可断言 init 收到的 code、可触发 init 拒绝；
 * - **防抖控制**：vi.useFakeTimers + advanceTimersByTimeAsync（写回完成经微任务链
 *   观察，async 推进保证 complete 在断言前落地）。
 *
 * 四项验收（tasks.md T14 / design.md Risks 证据列）：
 * ① 拖拽/改字无损更新、卸载零损坏 ② 拖拽无落盘风暴 ③ 改文本重开画布正确反映
 * ④ 模拟新增 full 图类型适配器零改动接入。
 */

/** 目标代码块 id（与 T11/T12 夹具一致）。 */
const BLOCK_ID = "20230101000000";

const FENCED_FLOWCHART = "```mermaid\nflowchart TD;\n  A-->B\n```";
const STRIPPED_FLOWCHART = "flowchart TD;\n  A-->B";

/** 宿主返回的代码块源码（模拟思源内核存储；真实 stripFence 消费）。 */
let blockMarkdown = FENCED_FLOWCHART;

beforeEach(() => {
  // 宿主源码复位：测试顺序无关（验收③会改写 blockMarkdown）
  blockMarkdown = FENCED_FLOWCHART;
});

/**
 * fake RenderBackend：实现 RenderBackend 接口（REQ-BACKEND-001 可替换 seam）。
 * - initCalls：断言画布 init 收到的 code / container / onGraphChange；
 * - emitChange(code)：模拟画布拖拽/改字后触发 onGraphChange（反向流入口）；
 * - rejectInitWith：置位后 init 以该错误拒绝（可编程触发 init 拒绝，验证错误保护链路）。
 */
class FakeRenderBackend implements RenderBackend {
  initCalls: Array<{
    code: string;
    container: HTMLElement;
    onGraphChange: (code: string) => void;
  }> = [];
  destroyCalls = 0;
  rejectInitWith: Error | null = null;

  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: RenderBackendOptions): Promise<void> {
    this.initCalls.push({ code, container: opts.container, onGraphChange: opts.onGraphChange });
    this.onChange = opts.onGraphChange;
    if (this.rejectInitWith) {
      throw this.rejectInitWith;
    }
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  /** 模拟用户在画布中编辑（拖拽节点 / 双击改字）后触发 onGraphChange。 */
  emitChange(code: string): void {
    this.onChange?.(code);
  }

  /** 最近一次 init 收到的 code（断言画布渲染内容 = 剥离后的新纯文本）。 */
  lastInitCode(): string {
    expect(this.initCalls).toHaveLength(1);
    return this.initCalls[0]!.code;
  }
}

/** 后端工厂：使 FlowChartAdapter（真实实现）经 seam 装配 fake 后端。 */
function makeBackendFactory(backend: RenderBackend): BackendFactory {
  return { id: "fake-acceptance", create: () => backend };
}

/**
 * 假想的 full 适配器（验收④）：复用 FlowChartAdapter 构造（后端装配/init/destroy
 * 全委托），仅更换图类型标签 type="xmind"——模拟「新增 full 图类型适配器零改动接入」。
 */
class XmindAdapter implements DiagramAdapter {
  readonly type = "xmind" as const;
  readonly supportLevel = "full" as const;

  private readonly inner: FlowChartAdapter;

  constructor(options: { backendFactory?: BackendFactory } = {}) {
    this.inner = new FlowChartAdapter(options);
  }

  init(code: string, opts: AdapterOptions): Promise<void> {
    return this.inner.init(code, opts);
  }

  destroy(): void {
    this.inner.destroy();
  }
}

/** 全链路组装会话（对齐 src/index.ts onload 接线）：真实 registry + FlowChartAdapter + ReadOnlyAdapter。 */
interface OpenSessionOverrides {
  getBlockMarkdown?: () => string;
  updateBlock?: Mock<(_id: string, data: string) => Promise<void> | void>;
  debounceMs?: number;
  backend?: FakeRenderBackend;
  registry?: AdapterRegistry;
}

async function openSession(overrides: OpenSessionOverrides = {}): Promise<{
  session: EditorSession;
  backend: FakeRenderBackend;
  updateBlock: Mock;
  container: HTMLElement;
}> {
  const backend = overrides.backend ?? new FakeRenderBackend();
  const registry =
    overrides.registry ??
    (() => {
      const r = new AdapterRegistry();
      r.register(new FlowChartAdapter({ backendFactory: makeBackendFactory(backend) }));
      r.register(new ReadOnlyAdapter());
      return r;
    })();
  const container = document.createElement("div");
  const updateBlock: Mock = vi.fn();
  const session = await initEditorSession({
    blockId: BLOCK_ID,
    container,
    registry,
    getBlockMarkdown: overrides.getBlockMarkdown ?? (() => blockMarkdown),
    updateBlock: overrides.updateBlock ?? updateBlock,
    ...(overrides.debounceMs !== undefined ? { debounceMs: overrides.debounceMs } : {}),
  });
  return { session, backend, updateBlock, container };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("验收① 无损更新 / 卸载零损坏（REQ-STORAGE-001）", () => {
  it("拖拽+改字 → 写回内容 = wrapFence(最新编辑)；destroy（模拟卸载）后内容零损坏", async () => {
    vi.useFakeTimers();
    try {
      const { session, backend, updateBlock } = await openSession();

      // 模拟画布连续编辑：拖拽节点 + 双击改字（<500ms 聚合为一个防抖周期）
      backend.emitChange("flowchart TD;\n  A-->B\n  B-->C");
      backend.emitChange("flowchart TD;\n  A-->B\n  B-->C\n  C-->D");
      // 编辑期间零写回（防抖红线：拖拽绝不同步落盘）
      expect(updateBlock).not.toHaveBeenCalled();

      // 关闭 Dialog / 卸载插件：destroy flush 未决写回一次
      session.destroy();
      expect(updateBlock).toHaveBeenCalledTimes(1);
      const [, fenced] = updateBlock.mock.calls[0] as [string, string];

      // 写回内容 = wrapFence(最新编辑)，且为合法围栏：stripFence 无损 round-trip
      expect(fenced).toBe(wrapFence("flowchart TD;\n  A-->B\n  B-->C\n  C-->D"));
      expect(stripFence(fenced)).toBe("flowchart TD;\n  A-->B\n  B-->C\n  C-->D");

      // 卸载后残留画布回调不再产生任何写入（零损坏：无第二次写回）
      backend.emitChange("flowchart TD;\n  X");
      await vi.advanceTimersByTimeAsync(1000);
      expect(updateBlock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("写回进行中新编辑不被旧回调覆盖：版本号比对丢弃过期回调，最终 = 最后一次编辑", async () => {
    vi.useFakeTimers();
    try {
      // 可控异步 updateBlock：手动 resolve 模拟「写回进行中」
      const deferreds: Array<() => void> = [];
      const updateBlock: Mock = vi.fn(
        (_id: string, _data: string): Promise<void> =>
          new Promise<void>((resolve) => {
            deferreds.push(resolve);
          })
      );
      const { session, backend } = await openSession({ updateBlock });

      backend.emitChange("flowchart TD;\n  A");
      await vi.advanceTimersByTimeAsync(500); // 写回 1 进行中（isSyncing=true）
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock.mock.calls[0]![1]).toBe(wrapFence("flowchart TD;\n  A"));

      // 写回尚未完成时用户又编辑 → 锁内到达 → 记 pending，不并发写回
      backend.emitChange("flowchart TD;\n  A --> B");
      await vi.advanceTimersByTimeAsync(500);
      expect(updateBlock).toHaveBeenCalledTimes(1); // isSyncing 锁：无并发写回

      // 完成第一次写回 → 补写最后一次编辑（旧回调不覆盖新编辑）
      deferreds[0]!();
      await vi.advanceTimersByTimeAsync(0);
      expect(updateBlock).toHaveBeenCalledTimes(2);
      expect(updateBlock.mock.calls[1]![1]).toBe(wrapFence("flowchart TD;\n  A --> B"));

      // 补写完成后无多余写回（整轮有界）
      deferreds[1]!();
      await vi.advanceTimersByTimeAsync(0);
      expect(updateBlock).toHaveBeenCalledTimes(2);

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("后端 init 拒绝（fake 可编程触发）→ 不建立写回通道、updateBlock 零调用（失败零损坏）", async () => {
    const backend = new FakeRenderBackend();
    backend.rejectInitWith = new Error("VisimerLoadError: 后端模块未就绪");
    const { session, updateBlock } = await openSession({ backend });

    // init 失败不抛未捕获异常，且不产生任何写入（保留原文本）
    expect(updateBlock).not.toHaveBeenCalled();
    // 失败会话 flush 无副作用、destroy 幂等
    session.flushWrite();
    expect(updateBlock).not.toHaveBeenCalled();
    session.destroy();
    expect(updateBlock).not.toHaveBeenCalled();
    expect(backend.destroyCalls).toBe(1);
  });
});

describe("验收② 拖拽无落盘风暴（REQ-DEBOUNCE-001）", () => {
  it("onGraphChange × 100 次（<500ms 间隔）→ 拖拽期间 updateBlock 零调用；停顿 500ms 后恰好 1 次", async () => {
    vi.useFakeTimers();
    try {
      const { session, backend, updateBlock } = await openSession();

      // 连续高频拖拽：100 次编辑，每次间隔 10ms（< 500ms 防抖窗口）
      for (let i = 1; i <= 100; i += 1) {
        backend.emitChange(`flowchart TD;\n  A-->B\n  B-->C\n  C-->N${i}`);
        vi.advanceTimersByTime(10);
      }
      // 拖拽期间零落盘
      expect(updateBlock).not.toHaveBeenCalled();

      // 停顿满 500ms → 恰好 1 次写回，内容为最后一次编辑
      await vi.advanceTimersByTimeAsync(500);
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock.mock.calls[0]![1]).toBe(wrapFence("flowchart TD;\n  A-->B\n  B-->C\n  C-->N100"));

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("多轮拖拽突发（轮间停顿 >500ms）→ 整轮写回次数有界 = 突发轮数（无风暴）", async () => {
    vi.useFakeTimers();
    try {
      const { session, backend, updateBlock } = await openSession();

      for (let burst = 1; burst <= 3; burst += 1) {
        for (let i = 1; i <= 30; i += 1) {
          backend.emitChange(`flowchart TD;\n  B${burst}-${i}`);
          vi.advanceTimersByTime(10);
        }
        // 轮间停顿：防抖触发一次写回（async 推进使上一次写回 complete 落地）
        await vi.advanceTimersByTimeAsync(500);
        expect(updateBlock).toHaveBeenCalledTimes(burst);
      }

      // 整轮写回次数有界：90 次编辑事件 → 仅 3 次落盘
      expect(updateBlock).toHaveBeenCalledTimes(3);
      expect(updateBlock.mock.calls[2]![1]).toBe(wrapFence("flowchart TD;\n  B3-30"));

      session.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("验收③ 改文本重开画布正确反映（REQ-READ-001）", () => {
  it("修改代码块文本（不同 markdown 输入）→ 重开会话：init 收到剥离后的新纯文本，画布渲染新内容", async () => {
    const INPUTS: Array<{ md: string; expected: string }> = [
      { md: "```mermaid\nflowchart TD;\n  A-->B\n```", expected: "flowchart TD;\n  A-->B" },
      {
        md: "```mermaid\nflowchart LR;\n  A-->B-->C\n  C-->D\n```",
        expected: "flowchart LR;\n  A-->B-->C\n  C-->D",
      },
      {
        md: "```mermaid\nflowchart TB;\n  X\n  X-->Y\n  Y-->Z\n```",
        expected: "flowchart TB;\n  X\n  X-->Y\n  Y-->Z",
      },
    ];

    // 模拟宿主中代码块文本被用户修改：getBlockMarkdown 每次返回最新 markdown
    for (const { md, expected } of INPUTS) {
      blockMarkdown = md;
      const { session, backend, updateBlock } = await openSession();

      // 正向流：真实 stripFence 剥离 → 适配器 init 收到新纯文本 → fake 后端断言画布渲染新内容
      expect(backend.lastInitCode()).toBe(expected);
      // 只重开不产生任何写回
      expect(updateBlock).not.toHaveBeenCalled();

      session.destroy();
    }
  });
});

describe("验收④ 模拟新增 full 适配器零改动接入（REQ-ADAPTER-001 / §8 兼容扩展）", () => {
  it("注册假想 full 适配器（type=xmind）→ route 返回 full → 同一 initEditorSession 双向同步零改动", async () => {
    vi.useFakeTimers();
    try {
      // 全链路组装：真实 flowchart + 兜底 readonly + 假想 xmind full 适配器（复用 FlowChartAdapter 构造）
      const xmindBackend = new FakeRenderBackend();
      const xmindAdapter = new XmindAdapter({ backendFactory: makeBackendFactory(xmindBackend) });
      const registry = new AdapterRegistry();
      registry.register(new FlowChartAdapter({ backendFactory: makeBackendFactory(new FakeRenderBackend()) }));
      registry.register(new ReadOnlyAdapter());
      registry.register(xmindAdapter);

      const code = "xmind\n  root((主题))\n    分支A\n    分支B";
      const fenced = wrapFence(code);
      const updateBlock: Mock = vi.fn();

      // route 判定 full 并返回该适配器（xmind 不在 KNOWN_DIAGRAM_TYPES，新增类型直接可路由）
      const routed = route(code, registry);
      expect(routed.kind).toBe("full");
      if (routed.kind === "full") {
        expect(routed.adapter).toBe(xmindAdapter);
      }

      const container = document.createElement("div");
      const session = await initEditorSession({
        blockId: BLOCK_ID,
        container,
        registry,
        getBlockMarkdown: () => fenced,
        updateBlock,
      });

      // 画布收到新类型纯文本（真实 stripFence 剥离）
      expect(xmindBackend.lastInitCode()).toBe(code);

      // 双向同步零改动：编辑 → 防抖 → wrapFence 写回
      xmindBackend.emitChange("xmind\n  root((主题))\n    分支A\n    分支B\n    分支C");
      await vi.advanceTimersByTimeAsync(500);
      expect(updateBlock).toHaveBeenCalledTimes(1);
      expect(updateBlock.mock.calls[0]![1]).toBe(
        wrapFence("xmind\n  root((主题))\n    分支A\n    分支B\n    分支C")
      );

      // destroy flush 语义不变（未决写回立即写回一次）
      xmindBackend.emitChange("xmind\n  root((主题))\n    分支A\n    分支B\n    分支C\n    分支D");
      session.destroy();
      expect(updateBlock).toHaveBeenCalledTimes(2);
      expect(updateBlock.mock.calls[1]![1]).toBe(
        wrapFence("xmind\n  root((主题))\n    分支A\n    分支B\n    分支C\n    分支D")
      );

      // 卸载后残留回调不再写回
      xmindBackend.emitChange("xmind\n  X");
      await vi.advanceTimersByTimeAsync(1000);
      expect(updateBlock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
