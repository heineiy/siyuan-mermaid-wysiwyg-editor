/**
 * Dialog 生命周期与画布挂载（REQ-TRIGGER-001 / D2 §5.2）。
 *
 * 画布挂载选型（设计文档 D2）：思源标准 Dialog 组件承载画布——交互清晰、
 * 实现复杂度最低，规避 Shadow DOM 内嵌的样式继承/事件冒泡/块布局重排副作用。
 * `import { Dialog } from "siyuan"`（npm 事实核实 2026-09-16：siyuan@1.2.7
 * 类型定义中 Dialog 构造 options 含 title/width/height/content/destroyCallback，
 * 提供 destroy() 方法；官方实现 `destroy()` 先移除 DOM 再回调 destroyCallback，
 * 关闭按钮/遮罩内部即调用 destroy()）。
 *
 * 生命周期职责（T8，仅容器管理，不接 block-icon/快捷键（T9/T10）与后端组装
 * （T11），后端由上层在 onDestroy 中注入销毁）：
 * - openEditorDialog(options)：每次调用创建独立 Dialog 实例，经 content HTML
 *   注入带唯一 id 的画布容器 div；返回句柄（close / getContainer）。
 * - 关闭（用户点关闭 / destroyCallback / handle.close()）时调用注入的 onDestroy
 *   （后端 destroy 钩子），调用后置空引用，防止闭包泄漏。
 * - 幂等：同一句柄多次 close（含重复 destroy）只触发一次 onDestroy。
 * - 重复打开可复用：每次 open 生成新容器 id、创建新 Dialog，无模块级残留
 *   状态；旧句柄在关闭后 getContainer 返回 null（容器已随 Dialog 移除）。
 *
 * 浏览器环境外不可用：siyuan Dialog 依赖真实 DOM/思源环境，单测以
 * vi.mock("siyuan") + happy-dom 验证生命周期逻辑（见 ./dialog.test.ts）。
 */
import { Dialog } from "siyuan";

/** openEditorDialog 选项。 */
export interface EditorDialogOptions {
  /** Dialog 标题栏文案。 */
  title?: string;
  /** Dialog 宽度（CSS 值，如 "90%"）。 */
  width?: string;
  /** Dialog 高度（CSS 值，如 "90%"）。 */
  height?: string;
  /**
   * 画布销毁钩子：Dialog 关闭（用户点关闭 / destroyCallback / handle.close()）
   * 时调用，供上层销毁后端实例（T11 组装）。幂等由本实现保证。
   */
  onDestroy?: () => void;
}

/** 受控 Dialog 生命周期句柄。 */
export interface EditorDialogHandle {
  /** 底层 siyuan Dialog 实例（只读访问，供进阶操作如 resize）。 */
  readonly dialog: Dialog;
  /**
   * 关闭 Dialog：经 Dialog.destroy() 触发 destroyCallback → onDestroy，
   * 并从 DOM 移除容器。幂等：重复调用只执行一次销毁清理。
   */
  close(): void;
  /**
   * 画布挂载容器（Dialog 内容区内的 div 节点）。
   * Dialog 存活期间返回节点；关闭（DOM 已移除）后返回 null。
   */
  getContainer(): HTMLElement | null;
}

/** 容器 id 自增计数：保证每次 open 的容器 id 唯一，杜绝旧节点复用。 */
let containerSeq = 0;

/**
 * 打开一个受控的思源标准 Dialog 并注入画布容器。
 * 每次调用创建独立 Dialog 实例；重复打开即新建，旧实例由各自句柄独立管理。
 */
export function openEditorDialog(options: EditorDialogOptions = {}): EditorDialogHandle {
  // 每次 open 生成唯一容器 id：关闭后再次打开必然是全新 id，无残留复用。
  const containerId = `mermaid-wysiwyg-canvas-${++containerSeq}`;

  let destroyHook: (() => void) | undefined = options.onDestroy;
  let destroyed = false;

  // 统一销毁出口：onDestroy 只执行一次，执行后置空引用防泄漏。
  const teardown = (): void => {
    if (destroyed) {
      return;
    }
    destroyed = true;
    const hook = destroyHook;
    destroyHook = undefined;
    hook?.();
  };

  const dialog = new Dialog({
    title: options.title,
    width: options.width,
    height: options.height,
    // 容器注入：content 为 HTML 字符串，放置带唯一 id 的 div；
    // getContainer 以 document.getElementById 取回该节点。
    content: `<div id="${containerId}"></div>`,
    destroyCallback: () => teardown(),
  });

  return {
    dialog,
    close(): void {
      // 思源 Dialog.destroy() 会回调 destroyCallback → teardown；
      // 已销毁后重复调用由 teardown 的 destroyed 标志兜底（幂等）。
      dialog.destroy();
    },
    getContainer(): HTMLElement | null {
      return document.getElementById(containerId);
    },
  };
}
