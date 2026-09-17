/**
 * 适配器注册表。
 *
 * 统一 DiagramAdapter 契约：每种图类型一个适配器实例，注册表按 type 索引。
 * - type：图类型关键字（"flowchart" | "sequenceDiagram" | ...），与路由层
 *   Mermaid 首行判定结果对齐。
 * - supportLevel：'full' → 可视化编辑；'readonly' → 只读预览。
 * - init(code, opts)：初始化；destroy()：销毁（幂等）。
 *
 * 注册表语义：
 * - register(adapter)：同 type 重复注册时后者覆盖前者。这是临时
 *   降级/升级入口：把某类型的 full 适配器覆盖为 readonly（或反之）即可在
 *   不触碰双向同步核心的前提下切换该类型的能力级别。
 * - get(type)：未注册返回 undefined。
 * - list()：返回全部已注册适配器（按注册顺序，快照）。
 */

import type { RenderBackend } from "../render/backend";

/** 适配器初始化选项：最小必要项。 */
export interface AdapterOptions {
  /** 画布挂载容器（由 Dialog 提供）。 */
  container: HTMLElement;
  /**
   * 渲染后端实例（接口级依赖，不绑定具体实现）。
   * 可选：缺省时由适配器自带工厂提供。
   */
  backend?: RenderBackend;
  /** 用户在画布中编辑完成后回调新代码（反向同步流）。 */
  onGraphChange: (newCode: string) => void;
}

/** 适配器支持级别：full = 可视化编辑；readonly = 只读预览。 */
export type SupportLevel = "full" | "readonly";

/** 统一图适配器契约。 */
export interface DiagramAdapter {
  /** 图类型关键字，与 Mermaid 首行判定结果对齐。 */
  readonly type: string;
  /** 能力级别：full → 可视化编辑；readonly → 只读预览。 */
  readonly supportLevel: SupportLevel;
  /** 可视化编辑 / 只读预览初始化。 */
  init(code: string, opts: AdapterOptions): void;
  /** 销毁并清理（幂等，可重复调用）。 */
  destroy(): void;
}

/** 适配器注册表。 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, DiagramAdapter>();

  /**
   * 注册适配器。
   * 同 type 重复注册时后者覆盖前者（临时降级/升级入口）。
   */
  register(adapter: DiagramAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  /** 查询指定类型的适配器；未注册返回 undefined。 */
  get(type: string): DiagramAdapter | undefined {
    return this.adapters.get(type);
  }

  /** 返回全部已注册适配器（按注册顺序，快照）。 */
  list(): DiagramAdapter[] {
    return [...this.adapters.values()];
  }
}
