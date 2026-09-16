import { describe, expect, it } from "vitest";
import { AdapterRegistry, type DiagramAdapter } from "../registry";
import {
  KNOWN_DIAGRAM_TYPES,
  READONLY_TYPE_MESSAGE,
  UNKNOWN_TYPE_MESSAGE,
  detectDiagramType,
  isKnownDiagramType,
  route,
} from "../router";

/**
 * 能力探测与降级路由测试（REQ-DEGRADE-001 / design.md D5）。
 *
 * 覆盖：首行类型判定（含方向变体/空白容错）、已知类型清单、
 * 三路路由（full → 可视化编辑；known-readonly → 只读预览；未知 → 兜底只读 + 提示文案）。
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

describe("detectDiagramType：Mermaid 首行类型判定", () => {
  it("flowchart 无方向", () => {
    expect(detectDiagramType("flowchart\n  A-->B")).toBe("flowchart");
  });

  it("flowchart 带方向变体（TD/TB/BT/LR/RL）只取类型关键字", () => {
    for (const dir of ["TD", "TB", "BT", "LR", "RL"]) {
      expect(detectDiagramType(`flowchart ${dir}\n  A-->B`)).toBe("flowchart");
    }
  });

  it("sequenceDiagram 判定", () => {
    expect(detectDiagramType("sequenceDiagram\n  A->>B: hi")).toBe("sequenceDiagram");
  });

  it("已知常见类型逐一判定（classDiagram/gantt/stateDiagram-v2/erDiagram/pie/journey/mindmap）", () => {
    expect(detectDiagramType("classDiagram\n  A <|-- B")).toBe("classDiagram");
    expect(detectDiagramType("gantt\ndateFormat YYYY-MM-DD")).toBe("gantt");
    expect(detectDiagramType("stateDiagram-v2\n  [*] --> S")).toBe("stateDiagram-v2");
    expect(detectDiagramType("erDiagram\n  A ||--o| B")).toBe("erDiagram");
    expect(detectDiagramType("pie\n  title Pie")).toBe("pie");
    expect(detectDiagramType("journey\n  title My day")).toBe("journey");
    expect(detectDiagramType("mindmap\n  root((x))")).toBe("mindmap");
  });

  it("首行前导空白与空行容错", () => {
    expect(detectDiagramType("  flowchart LR\n  A-->B")).toBe("flowchart");
    expect(detectDiagramType("\n\n  \t flowchart TD\n  A-->B")).toBe("flowchart");
  });

  it("未知类型返回原始首个 token（供上层展示）", () => {
    expect(detectDiagramType("foobar baz\n  x")).toBe("foobar");
    expect(detectDiagramType("unknownType")).toBe("unknownType");
  });

  it("空 / 全空白输入返回 null", () => {
    expect(detectDiagramType("")).toBeNull();
    expect(detectDiagramType("   \n \t\n")).toBeNull();
  });
});

describe("isKnownDiagramType / KNOWN_DIAGRAM_TYPES", () => {
  it("flowchart 与 sequenceDiagram 为已知类型", () => {
    expect(isKnownDiagramType("flowchart")).toBe(true);
    expect(isKnownDiagramType("sequenceDiagram")).toBe(true);
  });

  it("未知类型不为已知", () => {
    expect(isKnownDiagramType("foobar")).toBe(false);
  });

  it("KNOWN_DIAGRAM_TYPES 覆盖任务列举的常见类型（除 flowchart 外本期仅 readonly）", () => {
    for (const t of [
      "flowchart",
      "sequenceDiagram",
      "classDiagram",
      "gantt",
      "stateDiagram-v2",
      "erDiagram",
      "pie",
      "journey",
      "mindmap",
    ]) {
      expect(KNOWN_DIAGRAM_TYPES).toContain(t);
    }
  });
});

describe("route：三路路由（REQ-DEGRADE-001）", () => {
  it("full 适配器存在 → 可视化编辑（kind: full，无提示文案）", () => {
    const registry = new AdapterRegistry();
    const full = makeAdapter("flowchart", "full");
    registry.register(full);

    const result = route("flowchart LR\n  A-->B", registry);

    expect(result.kind).toBe("full");
    if (result.kind === "full") {
      expect(result.type).toBe("flowchart");
      expect(result.adapter).toBe(full);
      expect(result.message).toBeNull();
    }
  });

  it("已知类型仅注册 readonly 适配器 → 只读预览（kind: readonly，携带适配器与提示）", () => {
    const registry = new AdapterRegistry();
    const readonly = makeAdapter("sequenceDiagram", "readonly");
    registry.register(readonly);

    const result = route("sequenceDiagram\n  A->>B: hi", registry);

    expect(result.kind).toBe("readonly");
    if (result.kind === "readonly") {
      expect(result.type).toBe("sequenceDiagram");
      expect(result.adapter).toBe(readonly);
      expect(result.message).toBe(READONLY_TYPE_MESSAGE);
    }
  });

  it("已知类型但注册表无适配器 → 只读预览（adapter 为 null，由上层兜底只读）", () => {
    const registry = new AdapterRegistry();

    const result = route("sequenceDiagram\n  A->>B: hi", registry);

    expect(result.kind).toBe("readonly");
    if (result.kind === "readonly") {
      expect(result.adapter).toBeNull();
      expect(result.message).toBe(READONLY_TYPE_MESSAGE);
    }
  });

  it("未知类型 → 兜底只读 + 提示「该图类型暂不支持可视化编辑」（kind: unknown）", () => {
    const registry = new AdapterRegistry();

    const result = route("someNewDiagram foo\n  x", registry);

    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") {
      expect(result.type).toBe("someNewDiagram");
      expect(result.adapter).toBeNull();
      expect(result.message).toBe(UNKNOWN_TYPE_MESSAGE);
      expect(result.message).toContain("暂不支持可视化编辑");
    }
  });

  it("空 / 全空白代码 → 未知兜底（kind: unknown）", () => {
    const registry = new AdapterRegistry();
    expect(route("", registry).kind).toBe("unknown");
    expect(route("   \n", registry).kind).toBe("unknown");
  });

  it("同一类型 full 被 readonly 覆盖后 → 路由降级为只读（D5 临时降级入口）", () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter("flowchart", "full"));
    registry.register(makeAdapter("flowchart", "readonly"));

    const result = route("flowchart LR\n  A-->B", registry);

    expect(result.kind).toBe("readonly");
  });

  it("首行空白容错下路由仍正确（前导空行 + 前导空白）", () => {
    const registry = new AdapterRegistry();
    registry.register(makeAdapter("flowchart", "full"));

    expect(route("\n\n  flowchart TD\n  A-->B", registry).kind).toBe("full");
  });
});
