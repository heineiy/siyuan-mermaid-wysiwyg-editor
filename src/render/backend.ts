/**
 * 渲染后端层：可替换后端契约（REQ-BACKEND-001 / 设计文档 D5）。
 *
 * RenderBackend 将「画布渲染 + 双向文本同步」抽象为统一接口，任何实现
 * （Visimer、未来的 VueFlow 桥接等）只需满足本接口即可被适配层与双向同步
 * 核心注入使用，无需改动核心代码：
 *
 * - init(code, opts)：加载并初始化画布；返回 Promise，失败（如后端模块
 *   未就绪/渲染异常）时以拒绝上报明确错误，不抛出未捕获异常。
 * - destroy()：销毁画布与实例并清理 DOM；必须幂等，可重复调用。
 * - opts.onGraphChange(newCode)：用户在画布上拖拽节点/调整连线/双击改字后，
 *   以变更后的新 Mermaid 文本回调（REQ-RENDER-001 反向流）。
 *
 * 默认实现为 Visimer（@visimer/dom，CST 直改原文本），见 ./visimer-backend.ts。
 * VueFlow 桥接仅以本接口 + 文档预留插槽（设计文档 D5 §8）：后续按需实现
 * 同一接口并注入即可，适配层与双向同步核心无需改动。能力探测（supportLevel）
 * 属适配器层职责（T5），不进入本接口。
 */

/** 渲染后端初始化/运行期选项。 */
export interface RenderBackendOptions {
  /** 画布挂载容器（由 Dialog 或宿主提供）。 */
  container: HTMLElement;
  /** 用户在画布中编辑完成后回调新代码（REQ-RENDER-001）。 */
  onGraphChange: (newCode: string) => void;
}

/** 渲染后端可替换契约。 */
export interface RenderBackend {
  /**
   * 加载并初始化画布。
   * 失败时以 Promise 拒绝上报明确错误（可捕获，不产生未捕获异常）。
   */
  init(code: string, opts: RenderBackendOptions): Promise<void> | void;
  /** 销毁画布与实例，清理 DOM；幂等，可重复调用。 */
  destroy(): void;
}

/** 后端工厂：使后端可按 id 注入（REQ-BACKEND-001 可替换场景的组装入口）。 */
export interface BackendFactory {
  /** 后端标识，如 "visimer"、"vueflow"。 */
  readonly id: string;
  create(): RenderBackend;
}
