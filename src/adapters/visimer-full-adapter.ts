/**
 * Visimer 通用全编辑适配器。
 *
 * 把 FlowChartAdapter 重构为通用版本（2026-09-17）：type 由构造器参数传入，
 * 可实例化为任意图类型的 full 适配器。
 *
 * 背景：原设计只注册 flowchart 一个 full 适配器，sequence / class / state 等
 * 全部被路由到只读预览。但 VisimerBackend 内部的 MermaidWysiwygEditor 本身支持
 * 22 种图类型的可视化编辑，适配器无需为每种图类型写差异化逻辑——只需把
 * 图类型传给 Visimer，Visimer 自己按 mermaid 规范渲染和编辑。
 *
 * 注册策略（index.ts onload）：
 *   DIAGRAM_TYPES.filter(t => t.capability === "edit")
 *     .forEach(t => registry.register(new VisimerFullAdapter(t.id)))
 *   registry.register(new ReadOnlyAdapter())  // 通配兜底 render-only + 未知类型
 *
 * 注册表分层：
 * - 精确注册的 edit 类型（22 种）→ kind: "full" → VisimerFullAdapter
 * - 未精确注册的 render-only（zenuml）+ 未知类型 → kind: "readonly/unknown" → ReadOnlyAdapter
 *
 * 适配器只做「装配」，不含双向同步 / 防抖逻辑（那是 sync.ts 协调器职责）：
 *
 * - init(code, opts)：幂等。重复 init 先 destroy 旧后端实例再重建；
 *   backend 由 opts.backend 复用，缺省时经后端工厂 create（缺省
 *   visimerBackendFactory）；onGraphChange 原样透传给后端，后端编辑
 *   回调原路返回上层。
 * - destroy()：销毁后端（幂等，可重复调用）。
 *
 * 构造器可注入 backendFactory（测试注入 fake；真实 Visimer 在宿主内加载）。
 */

import type { BackendFactory, RenderBackend } from "../render/backend";
import { visimerBackendFactory } from "../render/visimer-backend";
import type { AdapterOptions, DiagramAdapter } from "./registry";

/** VisimerFullAdapter 构造选项。 */
export interface VisimerFullAdapterOptions {
  /** 图类型关键字（如 "flowchart" / "sequence" / "class" ...）。 */
  type: string;
  /** 后端工厂（测试注入 fake；缺省 visimerBackendFactory）。 */
  backendFactory?: BackendFactory;
}

/**
 * Visimer 通用全编辑适配器：组装可编辑画布后端，透传编辑回调。
 * type 由构造器参数传入——一个类实例化 22 个，覆盖所有 Visimer 支持 edit 的
 * 图类型；后端（VisimerBackend）内部的 MermaidWysiwygEditor 按 mermaid header
 * 自动识别类型并渲染，适配器无需额外 type-specific 逻辑。
 */
export class VisimerFullAdapter implements DiagramAdapter {
  readonly type: string;
  readonly supportLevel = "full" as const;

  private readonly backendFactory: BackendFactory;
  private backend: RenderBackend | null = null;

  constructor(options: VisimerFullAdapterOptions) {
    this.type = options.type;
    this.backendFactory = options.backendFactory ?? visimerBackendFactory;
  }

  /**
   * 装配后端并转发其 init 的 Promise：
   * backend.init 失败以拒绝上报，上层（sync.ts try/catch）可 await 捕获，
   * 不产生未处理拒绝。
   * 返回 Promise<void>：TS 上满足 DiagramAdapter 的 void 契约。
   */
  async init(code: string, opts: AdapterOptions): Promise<void> {
    // 幂等：重复 init 先销毁旧实例再重建。
    this.destroy();

    // 创建/复用后端：显式注入的 backend 优先，缺省经工厂创建。
    const backend = opts.backend ?? this.backendFactory.create();
    this.backend = backend;
    // 转发 backend.init 的 Promise：加载/渲染失败以拒绝上报，供上层捕获；
    // 失败后 destroy 仍可清理本实例持有的后端（幂等）。
    await backend.init(code, { container: opts.container, onGraphChange: opts.onGraphChange });
  }

  destroy(): void {
    if (this.backend) {
      this.backend.destroy();
      this.backend = null;
    }
  }
}
