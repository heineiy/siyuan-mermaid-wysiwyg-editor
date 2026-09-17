/**
 * 能力探测与降级路由。
 *
 * 打开编辑前解析 Mermaid 代码判定图类型，并按注册表能力路由三路：
 * 1. 注册表有该类型 supportLevel='full' 的适配器 → 可视化编辑（kind: "full"）。
 * 2. 已知类型但无 full 适配器（含仅注册 readonly 适配器）→ 只读预览（kind: "readonly"）。
 * 3. 未知 / 无法识别类型 → 兜底只读 + 提示（kind: "unknown"）。
 *
 * 类型检测健壮性：
 * - 用 @visimer/core 的 scanLines + classifyLines 正确提取 header line——自动跳过
 *   %%{init/config/directive: ...}%% frontmatter、空行、注释行等前导噪声行；
 * - 再用 Visimer 的 detectDiagramType 做类型归一化（"flowchart LR" → "flowchart"，
 *   "sequenceDiagram" → "sequence"，"classDiagram-v2" → "class"）；
 * - 未知类型 fallback 到 header line 的第一个 token（供上层展示原始类型名）；
 * - 全空 / 无 header 代码返回 null。
 *
 * 已知类型清单来自 Visimer DIAGRAM_TYPES（2026-09-17：覆盖 flowchart/sequence/class/
 * state/er/gantt/pie/quadrant/requirement/gitgraph/c4/mindmap/timeline/sankey/
 * xychart/block/packet/kanban/architecture/radar/treemap 等 23 种）。
 */

import type { AdapterRegistry, DiagramAdapter } from "./registry";
import {
  DIAGRAM_TYPES,
  classifyLines,
  detectDiagramType as visimerDetect,
  scanLines,
} from "@visimer/core";

/**
 * 从 Mermaid 文本判定图类型关键字（归一化）。
 * - 先用 Visimer 的 scanLines + classifyLines 找到真正的 header line（跳过 frontmatter /
 *   空行 / 注释），再用 detectDiagramType 归一化类型名；
 * - 未知类型 fallback 到 header line 的第一个 token（保留原始类型名供展示）；
 * - 全空 / 无 header 输入返回 null。
 *
 * 示例：
 *   "%%{init: {...}}%%\nflowchart LR\n..."  → "flowchart"  （frontmatter 跳过）
 *   "\n  sequenceDiagram\n..."             → "sequence"   （Visimer 归一化）
 *   "classDiagram-v2\n..."                 → "class"      （归一化，含 v2）
 *   "someNewDiagram foo\n..."              → "someNewDiagram"（未知类型 fallback）
 *   "" / "\n\n"                            → null
 */
export function detectDiagramType(code: string): string | null {
  const lines = scanLines(code);
  const { headerIndex } = classifyLines(lines);
  if (headerIndex < 0 || headerIndex >= lines.length) {
    return null; // 全空 / 无 header
  }
  const headerLine = lines[headerIndex]!.text.trim();
  // 尝试 Visimer 归一化
  const info = visimerDetect(headerLine);
  if (info) {
    return info.id;
  }
  // 未知类型：fallback 到 header 首个 token（保留原始类型名供展示）
  return headerLine.split(/\s+/, 1)[0] ?? null;
}

/**
 * 从 Mermaid 文本提取 header line 原始首个 token（供 route 的 unknown 分支展示）。
 * 同样跳过 frontmatter / 空行 / 注释。
 */
function detectHeaderToken(code: string): string | null {
  const lines = scanLines(code);
  const { headerIndex } = classifyLines(lines);
  if (headerIndex < 0 || headerIndex >= lines.length) {
    return null;
  }
  const headerLine = lines[headerIndex]!.text.trim();
  return headerLine.split(/\s+/, 1)[0] ?? null;
}

/**
 * 已知 Mermaid 图类型（来自 @visimer/core DIAGRAM_TYPES）。
 * 2026-09-17：23 种类型（22 edit + 1 render-only zenuml）。
 * Visimer 归一化名（与 Mermaid header 名不同）：
 *   sequenceDiagram → "sequence", classDiagram → "class", stateDiagram(-v2) → "state",
 *   erDiagram → "er", flowchart/graph → "flowchart"
 */
export const KNOWN_DIAGRAM_TYPES: readonly string[] = DIAGRAM_TYPES.map((t) => t.id);

const KNOWN_TYPES = new Set<string>(KNOWN_DIAGRAM_TYPES);

/** 已知图类型判定：true → 至少可走只读预览（known-readonly）。 */
export function isKnownDiagramType(type: string): boolean {
  return KNOWN_TYPES.has(type);
}

/** 未知类型兜底提示文案。 */
export const UNKNOWN_TYPE_MESSAGE = "该图类型暂不支持可视化编辑";

/** 已知类型仅只读的提示文案。 */
export const READONLY_TYPE_MESSAGE = "该图类型当前仅支持只读预览";

/** 路由结果：三路可区分，携带提示文案与适配器。 */
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
      /** 已注册的 readonly 适配器；可为 null（由上层用兜底只读适配器）。 */
      adapter: DiagramAdapter | null;
      message: string;
    }
  | {
      kind: "unknown";
      /** 原始 header 首个 token（未知类型无归一化）。 */
      type: string;
      adapter: null;
      message: string;
    };

/**
 * 按类型路由。
 * @param code 纯 Mermaid 文本（围栏剥离后，即 stripFence 输出）。
 * @param registry 适配器注册表。
 */
export function route(code: string, registry: AdapterRegistry): RouteResult {
  const normalizedType = detectDiagramType(code);
  if (normalizedType === null) {
    // 空代码：无可判定类型 → 兜底只读提示。
    return { kind: "unknown", type: "", adapter: null, message: UNKNOWN_TYPE_MESSAGE };
  }

  const adapter = registry.get(normalizedType);
  if (adapter !== undefined && adapter.supportLevel === "full") {
    return { kind: "full", type: normalizedType, adapter, message: null };
  }
  if (isKnownDiagramType(normalizedType)) {
    // 已知类型但无 full 适配器 → 只读预览（有已注册 readonly 适配器则携带，否则上层兜底）。
    return { kind: "readonly", type: normalizedType, adapter: adapter ?? null, message: READONLY_TYPE_MESSAGE };
  }
  // 未知类型：用原始 header token 展示给用户
  const rawType = detectHeaderToken(code) ?? normalizedType;
  return { kind: "unknown", type: rawType, adapter: null, message: UNKNOWN_TYPE_MESSAGE };
}
