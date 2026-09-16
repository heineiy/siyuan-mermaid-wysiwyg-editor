/**
 * 兜底只读降级适配器（REQ-DEGRADE-001 / design.md §8.1）。
 *
 * 未支持图类型（sequence / class / gantt 及其它未知类型）的只读预览降级：
 * - type = "*"：兜底通配关键字。注册进 AdapterRegistry 后，路由层
 *   （router.ts）对 readonly / unknown 分支（adapter 为 null 时）由上层
 *   用本适配器填充（本任务只交付适配器本身，注册接线属后续任务）。
 * - supportLevel = "readonly"：只读预览，禁止任何编辑交互。
 *
 * 只读语义（严格）：
 * - init 仅把 Mermaid 文本渲染为只读 SVG 注入 opts.container；
 * - 不订阅任何编辑事件，绝不回调 opts.onGraphChange（禁编辑、无写回）；
 * - destroy() 清理容器内渲染产物，幂等，可重复调用。
 *
 * 渲染依赖 mermaid 运行时（dependencies）。mermaid v12 API 核实
 * （node_modules/mermaid/dist/mermaidAPI.d.ts）：
 *   render(id: string, text: string, svgContainingElement?: Element)
 *     → Promise<RenderResult{ svg, diagramType, bindFunctions? }>
 * 语法错误/未知类型时 render 以 reject 上报。缺省 renderer 先
 * mermaid.initialize({ startOnLoad: false })（显式关闭自动加载，防御宿主页
 * 全局配置污染），再 mermaid.render(id, code)，由调用方把返回的 svg 挂载进
 * 容器。jsdom/happy-dom 下真实渲染依赖 DOMPurify/canvas 等浏览器能力，单测
 * 经构造器注入 fake renderer 验证契约行为；真实渲染留待思源宿主内人工验证。
 *
 * 错误处理：渲染/解析失败（含语法错误）回调构造注入的 onError
 * （T13 语法错误保护接线点；本期不写回坏数据），不向调用方抛未捕获异常。
 * onError 经构造器注入（而非扩展 AdapterOptions），保持 registry.ts 的
 * AdapterOptions 契约不变（设计文档 §8.1 兜底语义 + 任务约束）。
 */

import type { AdapterOptions, DiagramAdapter } from "./registry";
import mermaid from "mermaid";

/** 渲染结果：只读 SVG 字符串。 */
export interface ReadonlyRenderResult {
  svg: string;
}

/** 渲染器注入点：测试注入 fake 验证契约；缺省走真实 mermaid.render。 */
export type ReadonlyRenderer = (id: string, code: string) => Promise<ReadonlyRenderResult>;

/** 兜底只读适配器构造选项。 */
export interface ReadOnlyAdapterOptions {
  /** 渲染器（缺省：真实 mermaid.render）。 */
  renderer?: ReadonlyRenderer;
  /** 渲染/解析失败回调（T13 语法错误保护接线点）。 */
  onError?: (err: unknown) => void;
}

let renderSeq = 0;
/** 每次渲染的唯一 id：避免 mermaid 生成的 SVG id 在容器间冲突。 */
const nextRenderId = (): string => `mermaid-readonly-${++renderSeq}`;

/** 缺省渲染器：真实 mermaid；startOnLoad 显式关闭，防御宿主页全局配置污染。 */
const defaultRenderer: ReadonlyRenderer = async (id, code) => {
  mermaid.initialize({ startOnLoad: false });
  const { svg } = await mermaid.render(id, code);
  return { svg };
};

/** 兜底只读降级适配器（REQ-DEGRADE-001 / design.md §8.1）。 */
export class ReadOnlyAdapter implements DiagramAdapter {
  /** 兜底通配：注册进 registry 后匹配任意未支持类型（设计文档 §8.1）。 */
  readonly type = "*" as const;
  readonly supportLevel = "readonly" as const;

  private readonly renderer: ReadonlyRenderer;
  private readonly onError?: (err: unknown) => void;
  private container: HTMLElement | null = null;

  constructor(options: ReadOnlyAdapterOptions = {}) {
    this.renderer = options.renderer ?? defaultRenderer;
    this.onError = options.onError;
  }

  /**
   * 只读渲染：把 code 渲染为 SVG 挂载进 opts.container。
   * 失败（渲染/解析异常）回调 onError，不写回、不抛未捕获异常。
   * 返回 Promise<void>（契约声明为 void；TS 允许 Promise<void> 赋值给
   * void 返回签名），使调用方可 await 渲染完成。
   */
  async init(code: string, opts: AdapterOptions): Promise<void> {
    // 重复 init：先清理旧容器内残留渲染产物。
    this.clearContainer();
    const container = opts.container;
    this.container = container;

    try {
      const { svg } = await this.renderer(nextRenderId(), code);
      // destroy / 新一轮 init 竞态守卫：渲染完成时本实例已不再持有该容器则不写 DOM。
      if (this.container !== container) {
        return;
      }
      container.innerHTML = svg;
    } catch (err) {
      this.onError?.(err);
    }
  }

  /** 清理容器内渲染产物；幂等，可重复调用（含从未 init 的情况）。 */
  destroy(): void {
    this.clearContainer();
    this.container = null;
  }

  private clearContainer(): void {
    if (this.container !== null) {
      this.container.innerHTML = "";
    }
  }
}
