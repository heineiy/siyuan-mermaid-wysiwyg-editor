import { describe, expect, it, vi } from "vitest";
import type { BackendFactory, RenderBackend, RenderBackendOptions } from "../render/backend";
import type { AdapterOptions } from "./registry";
import { FlowChartAdapter } from "./flowchart-adapter";

/**
 * T6 flowchart 全编辑适配器测试（REQ-RENDER-001 / design.md D5）。
 *
 * 适配器只做「装配」：init 幂等（重复 init 先 destroy 旧后端再重建）、
 * backend 缺省时由工厂创建、onGraphChange 原样透传；不含防抖/同步逻辑
 * （那是 T11 协调器职责）。测试环境为 node：用 fake 后端注入，真实
 * @visimer/dom 未发布（2026-09-16），不得依赖真实加载。
 */

/** 最小 DOM 容器替身：仅实现适配器/后端 seam 测试需要的形状。 */
function makeContainer(): HTMLElement {
  const container = { children: [] as unknown[] };
  return container as unknown as HTMLElement;
}

/** fake 后端：记录 init 收到的 code/container/onGraphChange，可模拟画布编辑回调。 */
class FakeBackend implements RenderBackend {
  initCalls: Array<{
    code: string;
    container: HTMLElement;
    onGraphChange: (code: string) => void;
  }> = [];
  destroyCalls = 0;
  private onChange: ((code: string) => void) | null = null;

  async init(code: string, opts: RenderBackendOptions): Promise<void> {
    this.initCalls.push({ code, container: opts.container, onGraphChange: opts.onGraphChange });
    this.onChange = opts.onGraphChange;
  }

  destroy(): void {
    this.destroyCalls += 1;
  }

  /** 模拟用户在画布中编辑后触发 onGraphChange。 */
  emitChange(code: string): void {
    this.onChange?.(code);
  }
}

/** fake 后端工厂：计数 create 调用，产出指定 fake 后端。 */
function makeFactory(backend: RenderBackend): BackendFactory & { createCalls: number } {
  const factory: BackendFactory & { createCalls: number } = {
    id: "fake",
    createCalls: 0,
    create() {
      factory.createCalls += 1;
      return backend;
    },
  };
  return factory;
}

describe("FlowChartAdapter：元数据（REQ-ADAPTER-001）", () => {
  it("type = flowchart，supportLevel = full（全编辑）", () => {
    const adapter = new FlowChartAdapter();
    expect(adapter.type).toBe("flowchart");
    expect(adapter.supportLevel).toBe("full");
  });

  it("构造器可无参实例化（缺省后端工厂不触发真实加载）", () => {
    expect(() => new FlowChartAdapter()).not.toThrow();
  });
});

describe("FlowChartAdapter：init 装配（REQ-RENDER-001）", () => {
  it("init 调用后端 init，透传 code / container / onGraphChange", () => {
    const container = makeContainer();
    const onGraphChange = vi.fn();
    const backend = new FakeBackend();
    const adapter = new FlowChartAdapter();

    adapter.init("graph TD; A-->B", { container, backend, onGraphChange });

    expect(backend.initCalls).toHaveLength(1);
    expect(backend.initCalls[0]).toMatchObject({
      code: "graph TD; A-->B",
      container,
      onGraphChange,
    });
  });

  it("传入 backend 时复用实例：不再经工厂 create", () => {
    const backend = new FakeBackend();
    const factory = makeFactory(backend);
    const adapter = new FlowChartAdapter({ backendFactory: factory });

    adapter.init("graph TD; A-->B", {
      container: makeContainer(),
      backend,
      onGraphChange: vi.fn(),
    });

    expect(backend.initCalls).toHaveLength(1);
    expect(factory.createCalls).toBe(0);
  });

  it("onGraphChange 透传：后端触发编辑 → 上层收到 newCode", () => {
    const onGraphChange = vi.fn();
    const backend = new FakeBackend();
    const adapter = new FlowChartAdapter();

    adapter.init("graph TD; A-->B", { container: makeContainer(), backend, onGraphChange });
    backend.emitChange("graph TD; A-->B --> C");

    expect(onGraphChange).toHaveBeenCalledExactlyOnceWith("graph TD; A-->B --> C");
  });
});

describe("FlowChartAdapter：幂等语义", () => {
  it("重复 init 先 destroy 旧后端再 init 新后端", () => {
    const container = makeContainer();
    const first = new FakeBackend();
    const second = new FakeBackend();
    const adapter = new FlowChartAdapter();

    adapter.init("A", { container, backend: first, onGraphChange: vi.fn() });
    adapter.init("B", { container, backend: second, onGraphChange: vi.fn() });

    expect(first.destroyCalls).toBe(1);
    expect(first.initCalls).toHaveLength(1);
    expect(second.initCalls).toEqual([{ code: "B", container, onGraphChange: expect.any(Function) }]);
  });

  it("destroy 幂等：未 init / 重复调用均不抛，且后端只销毁一次", () => {
    const backend = new FakeBackend();
    const adapter = new FlowChartAdapter();

    expect(() => adapter.destroy()).not.toThrow();

    adapter.init("graph TD; A-->B", { container: makeContainer(), backend, onGraphChange: vi.fn() });
    adapter.destroy();
    adapter.destroy();

    expect(backend.destroyCalls).toBe(1);
  });
});

describe("FlowChartAdapter：缺省后端工厂", () => {
  it("不传 backend 时由注入工厂 create 后端并 init（不依赖真实 Visimer 加载）", () => {
    const backend = new FakeBackend();
    const factory = makeFactory(backend);
    const adapter = new FlowChartAdapter({ backendFactory: factory });
    const container = makeContainer();
    const onGraphChange = vi.fn();

    // AdapterOptions.backend 当前为必填类型（T5 契约）；「缺省」路径经
    // 工厂注入覆盖，运行时 opts.backend 为 undefined（见适配器实现 ?? 语义）。
    adapter.init("graph TD; A-->B", { container, onGraphChange } as unknown as AdapterOptions);

    expect(factory.createCalls).toBe(1);
    expect(backend.initCalls).toHaveLength(1);
    expect(backend.initCalls[0]).toMatchObject({
      code: "graph TD; A-->B",
      container,
      onGraphChange,
    });
  });
});
