/**
 * 能力探测与降级路由（REQ-DEGRADE-001 / design.md D5）。
 *
 * 打开编辑前解析 Mermaid 首行判定图类型，并按注册表能力路由三路：
 * 1. 注册表有该类型 supportLevel='full' 的适配器 → 可视化编辑（kind: "full"）。
 * 2. 已知类型但无 full 适配器（含仅注册 readonly 适配器）→ 只读预览（kind: "readonly"）。
 * 3. 未知 / 无法识别类型 → 兜底只读 + 提示（kind: "unknown"）。
 *
 * 首行判定健壮性：
 * - 跳过前导空行与首行空白（"  flowchart LR" / 前导空行均可识别）。
 * - "flowchart LR" 等方向变体（TD/TB/BT/LR/RL）只取首个 token → "flowchart"。
 * - 已知类型清单见 KNOWN_DIAGRAM_TYPES；清单外首行返回原始首个 token 供上层展示，
 *   由路由判为 unknown 兜底只读（REQ-DEGRADE-001：提示「该图类型暂不支持可视化编辑」）。
 *
 * 返回值（RouteResult）为可区分三路的判别联合：上层（T11）据 kind 分支，
 * 并携带提示文案（message）与已解析适配器（adapter）。
 */

import type { AdapterRegistry, DiagramAdapter } from "./registry";

/** 已知 Mermaid 图类型：本期除 flowchart 外均为 known-readonly（仅只读预览）。 */
export const KNOWN_DIAGRAM_TYPES: readonly string[] = [
  "flowchart",
  "sequenceDiagram",
  "classDiagram",
  "gantt",
  "stateDiagram",
  "stateDiagram-v2",
  "erDiagram",
  "pie",
  "journey",
  "mindmap",
];

const KNOWN_TYPES = new Set<string>(KNOWN_DIAGRAM_TYPES);

/** 已知图类型判定：true → 至少可走只读预览（known-readonly）。 */
export function isKnownDiagramType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}

/**
 * 从 Mermaid 文本首行判定图类型关键字。
 * - 跳过前导空行与首行空白，取首个非空 token（"flowchart LR" → "flowchart"）。
 * - 未知类型返回原始首个 token（供上层展示类型名）；空 / 全空白输入返回 null。
 */
export function detectDiagramType(code: string): string | null {
  for (const line of code.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") {
      continue;
    }
    return trimmed.split(/\s+/, 1)[0] ?? null;
  }
  return null;
}

/** 未知类型兜底提示文案（REQ-DEGRADE-001：兜底只读 + 提示）。 */
export const UNKNOWN_TYPE_MESSAGE = "该图类型暂不支持可视化编辑";

/** 已知类型仅只读的提示文案。 */
export const READONLY_TYPE_MESSAGE = "该图类型当前仅支持只读预览";

/** 路由结果：三路可区分，携带提示文案与适配器（供 T11 组装）。 */
export type RouteResult =
  | {
      kind: "full";
      /** 归一化图类型关键字（如 "flowchart"）。 */
      type: string;
      /** full 适配器实例。 */
      adapter: DiagramAdapter;
      /** full 路径无需提示。 */
      message: null;
    }
  | {
      kind: "readonly";
      type: string;
      /** 已注册的 readonly 适配器；T7 落地前可为 null（由上层用兜底只读适配器）。 */
      adapter: DiagramAdapter | null;
      message: string;
    }
  | {
      kind: "unknown";
      type: string;
      adapter: null;
      message: string;
    };

/**
 * 按首行判定的类型路由（REQ-DEGRADE-001）。
 * @param code 纯 Mermaid 文本（围栏剥离后，即 T2 stripFence 输出）。
 * @param registry 适配器注册表。
 */
export function route(code: string, registry: AdapterRegistry): RouteResult {
  const type = detectDiagramType(code);
  if (type === null) {
    // 空代码：无可判定类型 → 兜底只读提示。
    return { kind: "unknown", type: "", adapter: null, message: UNKNOWN_TYPE_MESSAGE };
  }

  const adapter = registry.get(type);
  if (adapter !== undefined && adapter.supportLevel === "full") {
    return { kind: "full", type, adapter, message: null };
  }
  if (isKnownDiagramType(type)) {
    // 已知类型但无 full 适配器 → 只读预览（有已注册 readonly 适配器则携带，否则上层兜底）。
    return { kind: "readonly", type, adapter: adapter ?? null, message: READONLY_TYPE_MESSAGE };
  }
  return { kind: "unknown", type, adapter: null, message: UNKNOWN_TYPE_MESSAGE };
}
