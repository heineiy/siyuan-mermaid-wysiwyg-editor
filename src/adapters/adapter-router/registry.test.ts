import { describe, expect, it } from "vitest";
import { AdapterRegistry, type DiagramAdapter } from "../registry";

/**
 * 适配器注册表测试（REQ-ADAPTER-001 / design.md D5）。
 *
 * 覆盖：注册 / 查询 / 重复注册覆盖（文档化约定）/ list 快照。
 * 测试环境为 node：适配器替身只实现契约形状，不涉真实渲染。
 */

/** 最小适配器替身：满足 DiagramAdapter 契约。 */
function makeAdapter(type: string, supportLevel: "full" | "readonly"): DiagramAdapter {
  return {
    type,
    supportLevel,
    init(): void {},
    destroy(): void {},
  };
}

describe("AdapterRegistry：注册 / 查询（REQ-ADAPTER-001）", () => {
  it("register 后可 get 到同一适配器实例", () => {
    const registry = new AdapterRegistry();
    const adapter = makeAdapter("flowchart", "full");
    registry.register(adapter);

    expect(registry.get("flowchart")).toBe(adapter);
  });

  it("未注册类型 get 返回 undefined", () => {
    const registry = new AdapterRegistry();
    expect(registry.get("flowchart")).toBeUndefined();
    expect(registry.get("sequenceDiagram")).toBeUndefined();
  });
});

describe("AdapterRegistry：list 与快照语义", () => {
  it("list 返回全部已注册适配器（按注册顺序）", () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter("flowchart", "full"));
    registry.register(makeAdapter("sequenceDiagram", "readonly"));

    expect(registry.list().map((a) => a.type)).toEqual(["flowchart", "sequenceDiagram"]);
  });

  it("list 返回快照：注册表后续变更不影响已取出的数组", () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter("flowchart", "full"));
    const snapshot = registry.list();

    registry.register(makeAdapter("pie", "readonly"));

    expect(snapshot).toHaveLength(1);
    expect(registry.list()).toHaveLength(2);
  });
});

describe("AdapterRegistry：同 type 重复注册（文档化约定：后者覆盖）", () => {
  it("后者覆盖前者，且 registry 中只保留一份", () => {
    const registry = new AdapterRegistry();
    const full = makeAdapter("flowchart", "full");
    const readonly = makeAdapter("flowchart", "readonly");
    registry.register(full);
    registry.register(readonly);

    expect(registry.get("flowchart")).toBe(readonly);
    expect(registry.list()).toHaveLength(1);
  });

  it("覆盖是 D5 临时降级/升级入口：full → readonly 双向可切换", () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter("flowchart", "full"));
    expect(registry.get("flowchart")?.supportLevel).toBe("full");

    registry.register(makeAdapter("flowchart", "readonly"));
    expect(registry.get("flowchart")?.supportLevel).toBe("readonly");
  });
});

describe("DiagramAdapter 契约形状", () => {
  it("适配器替身满足契约：type / supportLevel / init / destroy（编译期 + 运行期形状）", () => {
    const adapter = makeAdapter("flowchart", "full");

    expect(adapter.type).toBe("flowchart");
    expect(adapter.supportLevel).toBe("full");
    expect(typeof adapter.init).toBe("function");
    expect(typeof adapter.destroy).toBe("function");
    // 合法 supportLevel 集合约束（'readonly' 同样合法）
    expect(makeAdapter("sequenceDiagram", "readonly").supportLevel).toBe("readonly");
  });
});
