/**
 * flowchart 全编辑适配器（REQ-RENDER-001 / design.md D5）。
 *
 * 本期唯一 full（可视化编辑）适配器：内部装配可替换渲染后端（缺省
 * VisimerBackend，REQ-BACKEND-001）渲染可编辑画布——节点拖拽、连线调整、
 * 双击改字由后端（CST 直改原文本）完成，适配器只做「装配」，不含
 * 双向同步 / 防抖逻辑（那是 T11 协调器职责）：
 *
 * - init(code, opts)：幂等。重复 init 先 destroy 旧后端实例再重建；
 *   backend 由 opts.backend 复用，缺省时经后端工厂 create（缺省
 *   visimerBackendFactory）；onGraphChange 原样透传给后端，后端编辑
 *   回调原路返回上层（REQ-RENDER-001 反向流）。
 * - destroy()：销毁后端（幂等，可重复调用）。
 *
 * 构造器可注入 backendFactory（测试注入 fake；真实 @visimer/dom 未发布
 * 到 npm，测试不得依赖真实加载）。注册进 registry 的接线属后续任务，
 * 本文件不触碰注册表。
 */

import type { BackendFactory, RenderBackend } from "../render/backend";
import { visimerBackendFactory } from "../render/visimer-backend";
import type { AdapterOptions, DiagramAdapter } from "./registry";

/** FlowChartAdapter 构造选项。 */
export interface FlowChartAdapterOptions {
  /** 后端工厂（测试注入 fake；缺省 visimerBackendFactory）。 */
  backendFactory?: BackendFactory;
}

/** flowchart 全编辑适配器：组装可编辑画布后端，透传编辑回调。 */
export class FlowChartAdapter implements DiagramAdapter {
  readonly type = "flowchart" as const;
  readonly supportLevel = "full" as const;

  private readonly backendFactory: BackendFactory;
  private backend: RenderBackend | null = null;

  constructor(options: FlowChartAdapterOptions = {}) {
    this.backendFactory = options.backendFactory ?? visimerBackendFactory;
  }

  init(code: string, opts: AdapterOptions): void {
    // 幂等：重复 init 先销毁旧实例再重建。
    this.destroy();

    // 创建/复用后端：显式注入的 backend 优先，缺省经工厂创建。
    const backend = opts.backend ?? this.backendFactory.create();
    this.backend = backend;
    backend.init(code, { container: opts.container, onGraphChange: opts.onGraphChange });
  }

  destroy(): void {
    if (this.backend) {
      this.backend.destroy();
      this.backend = null;
    }
  }
}
