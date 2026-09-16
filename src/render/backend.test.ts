import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackendFactory, RenderBackend, RenderBackendOptions } from "./backend";
import {
  VISIMER_MODULE,
  VisimerBackend,
  VisimerLoadError,
  createVisimerBackend,
  visimerBackendFactory,
} from "./visimer-backend";

/**
 * T4 接口契约测试（REQ-BACKEND-001 / REQ-RENDER-001）。
 *
 * 测试环境为 node（无 jsdom），用最小 fake container 代替真实 DOM 容器；
 * 真实 Visimer 包（@visimer/dom）未发布到 npm（2026-09-16 核实），
 * 因此懒加载失败路径是生产真实路径；成功路径用 vi.doMock 的假模块验证 seam 全链路。
 */

/** 最小 DOM 容器替身：仅实现 seam 测试需要的两个方法。 */
function makeContainer(): HTMLElement {
  const container = {
    children: [] as unknown[],
    appendChild(el: unknown): void {
      container.children.push(el);
    },
    replaceChildren(): void {
      container.children.length = 0;
    },
  };
  return container as unknown as HTMLElement;
}

/** REQ-BACKEND-001 场景用的 fake 后端：实现 RenderBackend 接口即可被注入。 */
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

  /** 模拟用户在画布中编辑后触发回调。 */
  emitChange(code: string): void {
    this.onChange?.(code);
  }
}

/** 与适配层/同步核心等价的通用消费方：只依赖 RenderBackend 接口。 */
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
    const container = makeContainer();
    const onGraphChange = vi.fn();
    const fake = new FakeBackend();

    await runBackendSession(fake, "graph TD; A-->B", { container, onGraphChange });

    expect(fake.initCalls).toEqual(["graph TD; A-->B"]);
    expect(fake.destroyCalls).toBe(1);
    expect(onGraphChange).not.toHaveBeenCalled();
  });

  it("fake 后端编辑后触发 onGraphChange(newCode)（REQ-RENDER-001 回调契约）", async () => {
    const onGraphChange = vi.fn();
    const fake = new FakeBackend();
    await fake.init("graph TD; A-->B", { container: makeContainer(), onGraphChange });

    fake.emitChange("graph TD; A-->B --> C");

    expect(onGraphChange).toHaveBeenCalledExactlyOnceWith("graph TD; A-->B --> C");
  });

  it("BackendFactory 使后端可按 id 注入（VueFlow 等新后端走同一入口）", () => {
    const factory: BackendFactory = { id: "fake", create: () => new FakeBackend() };
    const backend = factory.create();
    expect(backend).toBeInstanceOf(FakeBackend);
    // 结构上满足 RenderBackend：编译期已证明，运行时验证接口形状。
    expect(typeof backend.init).toBe("function");
    expect(typeof backend.destroy).toBe("function");
  });

  it("visimer 工厂产出可注入的 RenderBackend", () => {
    expect(visimerBackendFactory.id).toBe("visimer");
    const backend = visimerBackendFactory.create();
    expect(backend).toBeInstanceOf(VisimerBackend);
    expect(typeof backend.init).toBe("function");
    expect(typeof backend.destroy).toBe("function");
  });
});

describe("VisimerBackend 懒加载 seam", () => {
  afterEach(() => {
    vi.doUnmock(VISIMER_MODULE);
    vi.resetModules();
  });

  it("懒加载失败路径：init 以明确错误拒绝而非抛出未捕获异常", async () => {
    const backend = new VisimerBackend();
    const onGraphChange = vi.fn();
    let captured: unknown;

    try {
      await backend.init("graph TD; A-->B", { container: makeContainer(), onGraphChange });
    } catch (err) {
      captured = err;
    }

    expect(captured).toBeInstanceOf(VisimerLoadError);
    expect((captured as VisimerLoadError).code).toBe("VISIMER_LOAD_FAILED");
    expect((captured as VisimerLoadError).message).toContain(VISIMER_MODULE);
    // 失败不产生任何编辑回调
    expect(onGraphChange).not.toHaveBeenCalled();
    // 失败后 destroy 仍可安全调用（不抛）
    expect(() => backend.destroy()).not.toThrow();
  });

  it("destroy 幂等：未 init 时重复调用不抛", () => {
    const backend = new VisimerBackend();
    expect(() => {
      backend.destroy();
      backend.destroy();
      backend.destroy();
    }).not.toThrow();
  });

  it("destroy 幂等：init 失败后重复调用不抛", async () => {
    const backend = new VisimerBackend();
    await expect(
      backend.init("graph TD; A-->B", { container: makeContainer(), onGraphChange: vi.fn() }),
    ).rejects.toBeInstanceOf(VisimerLoadError);

    expect(() => {
      backend.destroy();
      backend.destroy();
    }).not.toThrow();
  });

  it("成功路径（mock @visimer/dom）：mount → onChange → destroy 清理全链路", async () => {
    const container = makeContainer();
    const unmount = vi.fn(() => {
      container.replaceChildren();
    });
    const mount = vi.fn(
      (o: { container: HTMLElement; code: string; onChange: (code: string) => void }) => {
        o.container.appendChild({ tag: "canvas" } as unknown as Node);
        return { unmount };
      },
    );
    vi.doMock(VISIMER_MODULE, () => ({ mount }));

    const { VisimerBackend: FreshBackend } = await import("./visimer-backend");
    const backend = new FreshBackend();
    const onGraphChange = vi.fn();

    await backend.init("graph TD; A-->B", { container, onGraphChange });

    expect(mount).toHaveBeenCalledExactlyOnceWith({
      container,
      code: "graph TD; A-->B",
      onChange: expect.any(Function),
    });
    expect(container.children).toHaveLength(1);

    // 模拟画布编辑（seam 把 mount 收到的 onChange 接到 onGraphChange）
    const mountedOnChange = mount.mock.calls[0]?.[0].onChange;
    expect(mountedOnChange).toBeTypeOf("function");
    mountedOnChange?.("graph TD; A-->B --> C");
    expect(onGraphChange).toHaveBeenCalledExactlyOnceWith("graph TD; A-->B --> C");

    // destroy：卸载画布 + DOM 清理 + 幂等
    backend.destroy();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
    expect(() => backend.destroy()).not.toThrow();
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it("createVisimerBackend 产出接口合规后端（懒加载失败也以拒绝上报）", async () => {
    const backend = createVisimerBackend();
    await expect(
      backend.init("graph TD; A-->B", { container: makeContainer(), onGraphChange: vi.fn() }),
    ).rejects.toMatchObject({ code: "VISIMER_LOAD_FAILED" });
    expect(() => backend.destroy()).not.toThrow();
  });
});
