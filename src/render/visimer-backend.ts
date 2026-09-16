import type { BackendFactory, RenderBackend, RenderBackendOptions } from "./backend";

/**
 * Visimer 渲染后端（懒加载 seam 版）。
 *
 * npm 事实核实（2026-09-16）：`visimer` / `@inkeep/visimer` / `mermaid-wysiwyg`
 * 均未发布到 registry.npmjs.org（404）；上游仓库 https://github.com/inkeep/visimer
 * （monorepo，包名 @visimer/core / @visimer/dom v1.1.2）仍在开发中、未发布。
 * 因此本文件不依赖真实包：init 通过动态 import() 懒加载 VISIMER_MODULE，
 * 加载失败时以明确错误（VisimerLoadError）拒绝——可捕获，不产生未捕获异常。
 *
 * 接线点（T6/T11 组装时接入真实包，二选一）：
 * 1. @visimer/dom 导出 MermaidCanvasView（ViewOptions：editor/container/mermaid/
 *    debounceMs/hooks 等），编辑器（@visimer/core）经 `editor.on('change', ...)`
 *    通知代码变更；届时在 mount 实现中创建 MermaidCanvasView，并把
 *    editor 'change' 事件接到 opts.onChange（→ onGraphChange(newCode)）。
 * 2. 或将 VISIMER_MODULE 指向一个本地薄适配模块（导出本 seam 的 mount 形状），
 *    由该模块封装 @visimer/dom 的真实 API，VisimerBackend 本体无需改动。
 */

/** 懒加载目标模块标识：@visimer/dom 包名（npm 未发布，暂为 seam 目标）。 */
export const VISIMER_MODULE = "@visimer/dom";

/** seam 期望的模块 mount 挂载选项（真实包接线时由薄适配层对齐）。 */
export interface VisimerMountOptions {
  container: HTMLElement;
  code: string;
  onChange: (newCode: string) => void;
}

/** seam 期望的 mount 返回句柄：destroy 时调用 unmount 清理画布与 DOM。 */
export interface VisimerMountHandle {
  unmount(): void;
}

/** 懒加载失败错误：携带模块标识，供上层（T11/T13）提示与降级。 */
export class VisimerLoadError extends Error {
  readonly code = "VISIMER_LOAD_FAILED" as const;

  constructor(
    readonly moduleId: string,
    cause: unknown,
  ) {
    super(
      `无法加载 Visimer 渲染模块 "${moduleId}"（npm 未发布，待 T6/T11 接线真实 @visimer/dom）：` +
        (cause instanceof Error ? cause.message : String(cause)),
    );
    this.name = "VisimerLoadError";
  }
}

/** VisimerBackend 构造选项。 */
export interface VisimerBackendOptions {
  /** 覆写懒加载模块标识（测试注入 / 接线用）；默认 VISIMER_MODULE。 */
  moduleId?: string;
}

/** Visimer 渲染后端：实现 RenderBackend，可被适配层注入。 */
export class VisimerBackend implements RenderBackend {
  private readonly moduleId: string;
  private container: HTMLElement | null = null;
  private onGraphChange: ((code: string) => void) | null = null;
  private handle: VisimerMountHandle | null = null;

  constructor(options: VisimerBackendOptions = {}) {
    this.moduleId = options.moduleId ?? VISIMER_MODULE;
  }

  async init(code: string, opts: RenderBackendOptions): Promise<void> {
    this.container = opts.container;
    this.onGraphChange = opts.onGraphChange;

    let mod: unknown;
    try {
      mod = await import(/* @vite-ignore */ this.moduleId);
    } catch (cause) {
      // 懒加载失败：以明确错误拒绝（可捕获），不抛出未捕获异常。
      throw new VisimerLoadError(this.moduleId, cause);
    }

    const mount = (mod as { mount?: unknown }).mount;
    if (typeof mount !== "function") {
      throw new VisimerLoadError(
        this.moduleId,
        new Error("模块已加载但未导出 seam 契约的 mount，请按 T6/T11 接线真实 @visimer/dom"),
      );
    }
    this.handle = (mount as (o: VisimerMountOptions) => VisimerMountHandle)({
      container: opts.container,
      code,
      onChange: (newCode: string) => this.onGraphChange?.(newCode),
    });
  }

  destroy(): void {
    if (this.handle) {
      try {
        this.handle.unmount();
      } finally {
        this.handle = null;
      }
    }
    this.onGraphChange = null;
    this.container = null;
  }
}

/** 工厂：以 "visimer" 为 id 的可注入后端（REQ-BACKEND-001 组装入口）。 */
export const createVisimerBackend = (options: VisimerBackendOptions = {}): RenderBackend =>
  new VisimerBackend(options);

export const visimerBackendFactory: BackendFactory = {
  id: "visimer",
  create: () => new VisimerBackend(),
};
