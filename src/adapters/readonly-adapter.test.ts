// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import mermaid from "mermaid";
import type { RenderBackend } from "../render/backend";
import type { AdapterOptions } from "./registry";
import { ReadOnlyAdapter, type ReadonlyRenderer } from "./readonly-adapter";

/**
 * T7：兜底只读降级适配器测试（REQ-DEGRADE-001 / design.md §8.1）。
 *
 * 只读语义（严格验证）：
 * - type="*" 兜底通配、supportLevel="readonly"；
 * - init 经注入 renderer 渲染并把 SVG 挂载进 container；
 * - renderer 失败 → 构造注入的 onError 收到错误；
 * - init 全程绝不回调 opts.onGraphChange（禁编辑、无写回）；
 * - destroy 幂等并清理 container 内渲染产物。
 *
 * mermaid 以 vi.mock 整体替换（真实 mermaid 在 node/happy-dom 下渲染依赖
 * DOMPurify/canvas 等浏览器能力，留待思源宿主内人工验证）：
 * - 缺省 renderer 走 mermaid.initialize({ startOnLoad:false }) + mermaid.render；
 * - 其余用例注入 fake renderer 验证契约行为，不触达真实 mermaid。
 */

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (_id: string, _code: string) => ({ svg: "<svg>mermaid-default</svg>" })),
    parse: vi.fn(),
  },
}));

/** 最小渲染后端替身：只读适配器不触达它，仅满足 AdapterOptions 契约。 */
function makeBackend(): RenderBackend {
  return { init: vi.fn(), destroy: vi.fn() };
}

/** 构造标准 AdapterOptions（backend 为契约必填，本适配器不使用）。 */
function makeOpts(container: HTMLElement, onGraphChange = vi.fn()): AdapterOptions {
  return { container, backend: makeBackend(), onGraphChange };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ReadOnlyAdapter：元数据（REQ-DEGRADE-001）", () => {
  it("type = '*'（兜底通配），supportLevel = 'readonly'", () => {
    const adapter = new ReadOnlyAdapter();

    expect(adapter.type).toBe("*");
    expect(adapter.supportLevel).toBe("readonly");
    expect(typeof adapter.init).toBe("function");
    expect(typeof adapter.destroy).toBe("function");
  });

  it("构造器可无参实例化（缺省 renderer 不触发真实 mermaid 调用）", () => {
    expect(() => new ReadOnlyAdapter()).not.toThrow();
    expect(mermaid.initialize).not.toHaveBeenCalled();
  });
});

describe("ReadOnlyAdapter：init 只读渲染（REQ-DEGRADE-001）", () => {
  it("init 调用注入的 renderer 并把 SVG 挂载进 container", async () => {
    const renderer = vi.fn(async (_id: string, _code: string) => ({ svg: "<svg>hi</svg>" }));
    const adapter = new ReadOnlyAdapter({ renderer });
    const container = document.createElement("div");
    const code = "sequenceDiagram\n  A->>B: hi";

    await adapter.init(code, makeOpts(container));

    expect(renderer).toHaveBeenCalledTimes(1);
    expect(renderer.mock.calls[0]![0]).toEqual(expect.any(String)); // 唯一渲染 id
    expect(renderer.mock.calls[0]![1]).toBe(code);
    expect(container.innerHTML).toContain("<svg>hi</svg>");
  });

  it("render 成功时自动回调 onGraphChange（合法代码写回思源）", async () => {
    const adapter = new ReadOnlyAdapter({
      renderer: vi.fn(async () => ({ svg: "<svg>x</svg>" })),
    });
    const onGraphChange = vi.fn();

    await adapter.init("erDiagram\n  A ||--o| B", makeOpts(document.createElement("div"), onGraphChange));

    // 首次 render 成功 → 代码合法 → 写回思源
    expect(onGraphChange).toHaveBeenCalledTimes(1);
    expect(onGraphChange).toHaveBeenCalledWith("erDiagram\n  A ||--o| B");
  });

  it("重复 init：先清理旧渲染产物再挂载新结果", async () => {
    const renderer = vi
      .fn()
      .mockResolvedValueOnce({ svg: "<svg>first</svg>" })
      .mockResolvedValueOnce({ svg: "<svg>second</svg>" });
    const adapter = new ReadOnlyAdapter({ renderer });
    const container = document.createElement("div");

    await adapter.init("pie\n  title A", makeOpts(container));
    expect(container.innerHTML).toContain("<svg>first</svg>");

    await adapter.init("pie\n  title B", makeOpts(container));
    expect(container.innerHTML).toContain("<svg>second</svg>");
    expect(container.innerHTML).not.toContain("first");
  });
});

describe("ReadOnlyAdapter：渲染失败降级（T13 接线点）", () => {
  it("renderer 失败 → 构造注入的 onError 收到错误，绝不回调 onGraphChange，但仍建分屏布局让用户可修代码", async () => {
    const boom = new Error("parse failed: unknown diagram");
    const renderer = vi.fn(async () => {
      throw boom;
    });
    const onError = vi.fn();
    const onGraphChange = vi.fn();
    const adapter = new ReadOnlyAdapter({ renderer, onError });
    const container = document.createElement("div");

    await adapter.init("gantt\n  section x", makeOpts(container, onGraphChange));

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
    expect(onGraphChange).not.toHaveBeenCalled();
    // 失败仍建分屏布局（toolbar + textarea + preview-slot）——用户需要 textarea 修代码
    expect(container.innerHTML).toContain("mw-toolbar");
    expect(container.innerHTML).toContain("mw-code-editor"); // textarea
    expect(container.innerHTML).toContain("mw-preview-slot");
    // preview-slot 里有错误提示（红框）
    expect(container.innerHTML).toContain("⚠ Mermaid syntax error");
    expect(container.innerHTML).toContain("parse failed: unknown diagram");
  });

  it("未注入 onError 时失败不抛未捕获异常（静默降级）", async () => {
    const adapter = new ReadOnlyAdapter({
      renderer: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await expect(adapter.init("foo\n  x", makeOpts(document.createElement("div")))).resolves.toBeUndefined();
  });
});

describe("ReadOnlyAdapter：destroy 清理（幂等）", () => {
  it("destroy 清理 container 内渲染产物，且可重复调用", async () => {
    const adapter = new ReadOnlyAdapter({
      renderer: vi.fn(async () => ({ svg: "<svg>x</svg>" })),
    });
    const container = document.createElement("div");
    await adapter.init("classDiagram\n  A <|-- B", makeOpts(container));
    expect(container.innerHTML).not.toBe("");

    adapter.destroy();
    expect(container.innerHTML).toBe("");
    adapter.destroy(); // 幂等：再次调用不抛错、结果不变
    expect(container.innerHTML).toBe("");
  });

  it("从未 init 时 destroy 安全（无容器不抛错）", () => {
    const adapter = new ReadOnlyAdapter();
    expect(() => adapter.destroy()).not.toThrow();
  });

  it("destroy 后完成渲染不写回已销毁容器（竞态守卫）", async () => {
    let resolveRender!: (r: { svg: string }) => void;
    const renderer = vi.fn(
      () =>
        new Promise<{ svg: string }>((resolve) => {
          resolveRender = resolve;
        }),
    );
    const adapter = new ReadOnlyAdapter({ renderer });
    const container = document.createElement("div");

    const pending = adapter.init("journey\n  title J", makeOpts(container));
    adapter.destroy(); // 渲染尚未完成即销毁
    resolveRender({ svg: "<svg>late</svg>" });
    await pending;

    expect(container.innerHTML).toBe("");
  });
});

describe("ReadOnlyAdapter：缺省 renderer（真实 mermaid）", () => {
  it("走 mermaid.initialize({ startOnLoad:false }) + mermaid.render，结果挂载", async () => {
    const adapter = new ReadOnlyAdapter();
    const container = document.createElement("div");

    await adapter.init("flowchart LR\n  A-->B", makeOpts(container));

    expect(mermaid.initialize).toHaveBeenCalledTimes(1);
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ startOnLoad: false }));
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mermaid.render).mock.calls[0]![1]).toBe("flowchart LR\n  A-->B");
    expect(container.innerHTML).toContain("<svg>mermaid-default</svg>");
  });
});
