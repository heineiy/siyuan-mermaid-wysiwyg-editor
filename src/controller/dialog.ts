/**
 * Dialog 生命周期与画布挂载。
 *
 * 画布挂载选型：思源标准 Dialog 组件承载画布——交互清晰、
 * 实现复杂度最低，规避 Shadow DOM 内嵌的样式继承/事件冒泡/块布局重排副作用。
 * `import { Dialog } from "siyuan"`（npm 事实核实 2026-09-16：siyuan@1.2.7
 * 类型定义中 Dialog 构造 options 含 title/width/height/content/destroyCallback，
 * 提供 destroy() 方法；官方实现 `destroy()` 先移除 DOM 再回调 destroyCallback，
 * 关闭按钮/遮罩内部即调用 destroy()）。
 *
 * 布局与样式（2026-09-17 修复）：
 * - 原版本容器 div 无任何 CSS → 高度塌陷、Visimer .mw-canvas 默认 overflow:auto
 *   裁剪 popover（position:absolute + z-index:20）。
 * - 修复：
 *   1. Dialog body 强制 flex 布局 + height 100%（思源 Dialog 默认 body 没撑满）。
 *   2. 画布容器 div 设 height/width:100% + overflow:visible（让 Visimer popover
 *      不被裁剪）。大图滚动由 Visimer .mw-panzoom 内部 absolute-svg-host 承担。
 *   3. 背景色与思源编辑器视觉融合。
 *
 * 生命周期职责（仅容器管理，不接 block-icon/快捷键与后端组装，后端由上层
 * 在 onDestroy 中注入销毁）：
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
   * 时调用，供上层销毁后端实例。幂等由本实现保证。
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
 * Visimer 样式覆盖：修正 SVG 内部标签字体太小 + chrome（popover/zoom control）
 * 与思源主题不协调的问题。
 *
 * 注入时机：openEditorDialog 创建 Dialog 时一次性注入到 document.head；
 * 用 data 属性标记避免重复注入（同一 session 多个 Dialog 只加一次）。
 *
 * 覆盖内容：
 * 1. SVG 内部 text 字体 +2px（Visimer 默认 mermaid 渲染的标签往往偏小，思源
 *    等宽屏幕下尤其明显）。
 * 2. edge label 背景不透明 + 边框（默认 SVG 的 edgeLabel 背景半透明，叠到
 *    深色路径上看不清 "是"/"否" 这类短标签）。
 * 3. popover font-size +1px、按钮更大更容易点、hover 态更明显。
 * 4. Visimer 默认 --mw-accent 蓝色过暗，改成思源主题蓝 #2b6cb0。
 * 5. background 与思源 #fafafa 融合。
 */
const VISIMER_PATCH_CSS = `
/* ---- SVG 内部文字 ---- */
.mw-canvas svg text { font-size: 14px !important; }
.mw-canvas svg .nodeLabel,
.mw-canvas svg .nodeLabel text { font-size: 14px !important; }
.mw-canvas svg .edgeLabels,
.mw-canvas svg .edgeLabel,
.mw-canvas svg .edgeLabel text,
.mw-canvas svg textPath { font-size: 13px !important; font-weight: 500; }

/* edge label 背景实色 + 边框，避免叠在路径上看不清 */
.mw-canvas svg .edgeLabel > div {
  background: #ffffff !important;
  border: 1px solid #cbd5e1 !important;
  border-radius: 4px !important;
  padding: 2px 6px !important;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important;
}
.mw-canvas svg .edgeLabel text,
.mw-canvas svg textPath {
  fill: #1e293b !important;
}

/* ---- popover / toolbar（Visimer DOM，非 SVG）---- */
.mw-canvas {
  --mw-accent: #2b6cb0;
  --mw-chrome-bg: #ffffff;
  --mw-chrome-border: #e2e8f0;
  --mw-chrome-fg: #1e293b;
  --mw-chrome-dim: #64748b;
  --mw-chrome-hover: #f1f5f9;
}
.mw-popover {
  box-shadow: 0 4px 14px rgba(0,0,0,0.12), 0 0 0 1px #e2e8f0 !important;
  border-radius: 10px !important;
  padding: 6px !important;
  gap: 4px !important;
}
.mw-popover-btn {
  width: 32px !important;
  height: 32px !important;
  border-radius: 7px !important;
}
.mw-popover-btn svg { width: 17px !important; height: 17px !important; }
.mw-popover-btn:hover { background: #eef2ff !important; color: #2b6cb0 !important; }
.mw-popover-btn.active { background: #2b6cb0 !important; color: #fff !important; }

/* popover panel（从按钮再点开的二级选择面板）——放大所有 cell / grid / title，
   避免 icon + 文字堆叠挤在一起看不清。 */
.mw-popover-panel {
  padding: 8px !important;
  min-width: 220px !important;
  gap: 6px !important;
}
.mw-popover-panel-title {
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.06em !important;
  padding: 4px 6px 8px !important;
  color: #64748b !important;
  text-transform: none !important;
}
.mw-popover-section-title {
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.04em !important;
  padding: 8px 6px 4px !important;
  color: #94a3b8 !important;
  text-transform: none !important;
}
.mw-popover-grid {
  display: grid !important;
  gap: 4px !important;
  padding: 4px 2px !important;
}
.mw-popover-cell {
  padding: 12px 10px !important;
  font-size: 14px !important;
  font-weight: 500 !important;
  line-height: 1.4 !important;
  border-radius: 8px !important;
  border: 1px solid #e2e8f0 !important;
  background: #ffffff !important;
  color: #475569 !important;
  min-width: 56px !important;
  min-height: 56px !important;
  transition: background 0.12s, border-color 0.12s, transform 0.1s !important;
}
.mw-popover-cell:hover {
  background: #eef2ff !important;
  border-color: #2b6cb0 !important;
  color: #2b6cb0 !important;
  transform: translateY(-1px) !important;
}
.mw-popover-cell.selected {
  border-color: #2b6cb0 !important;
  background: #dbeafe !important;
  color: #1e40af !important;
  box-shadow: 0 0 0 2px rgba(43,108,176,0.18) !important;
}
/* 带 icon + label 的 cell（形状/箭头类型选择面板） */
.mw-popover-cell.labeled {
  padding: 10px 8px 8px !important;
  gap: 6px !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
}
.mw-popover-cell.labeled svg {
  width: 22px !important;
  height: 22px !important;
}
.mw-popover-cell .mw-cell-label {
  font-size: 12px !important;
  font-weight: 500 !important;
  color: inherit !important;
  opacity: 0.95 !important;
  margin-top: 2px !important;
  line-height: 1.2 !important;
  white-space: normal !important;
  word-break: keep-all !important;
}
/* 纯 SVG cell（形状选择、连线样式） */
.mw-popover-cell.svg {
  padding: 10px 8px !important;
}
.mw-popover-cell.svg svg {
  width: 30px !important;
  height: 16px !important;
}
/* 颜色样本 */
.mw-popover-cell.swatch {
  padding: 8px !important;
  min-width: 48px !important;
  min-height: 48px !important;
}
.mw-swatch-dot {
  width: 28px !important;
  height: 28px !important;
  border-radius: 99px !important;
  border: 2px solid rgba(0,0,0,0.12) !important;
}
.mw-swatch-dot.none {
  width: 28px !important;
  height: 28px !important;
}

/* zoom control */
.mw-zoom-controls { right: 16px !important; bottom: 16px !important; gap: 6px !important; }
.mw-zoom-btn { width: 32px !important; height: 32px !important; border-radius: 8px !important; }

/* error badge */
.mw-error-badge {
  background: #fef2f2 !important;
  border: 1px solid #fca5a5 !important;
  color: #991b1b !important;
  border-radius: 8px !important;
}
`;

/** 保证 Visimer 样式补丁只注入一次（多 Dialog 共享同一份）。 */
let styleInjected = false;
function injectVisimerStyles(): void {
  if (styleInjected || typeof document === "undefined") {
    return;
  }
  const style = document.createElement("style");
  style.setAttribute("data-mw-patch", "");
  style.textContent = VISIMER_PATCH_CSS;
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * Dialog body 初始化：思源 Dialog 默认 body 没设 flex 布局，导致内部
 * 容器 height:100% 失效。找到 `.b3-dialog__body` 并强制设 flex + 撑满。
 */
function setupDialogBody(dialog: Dialog): void {
  // dialog.element 是 Dialog 根节点；思源 Dialog 结构：.b3-dialog > .b3-dialog__container
  // > .b3-dialog__header + .b3-dialog__body。
  const root = (dialog as unknown as { element?: HTMLElement }).element;
  if (!root) {
    return;
  }
  // 等一帧让 Dialog DOM 渲染完成（siyuan Dialog 可能异步注入 content）。
  requestAnimationFrame(() => {
    const body = root.querySelector<HTMLElement>(".b3-dialog__body");
    if (body) {
      body.style.height = "100%";
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.boxSizing = "border-box";
    }
    const container = root.querySelector<HTMLElement>(".b3-dialog__container");
    if (container) {
      container.style.display = "flex";
      container.style.flexDirection = "column";
      container.style.height = "100%";
    }
  });
}

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

  // 一次性注入 Visimer 样式补丁（SVG 标签字体 + popover chrome + 颜色主题）。
  injectVisimerStyles();

  // 容器内联样式：撑满 Dialog body + 背景色 + overflow:visible 避免 Visimer
  // popover（position:absolute + z-index:20）被 Visimer 默认 .mw-canvas
  // overflow:auto 裁剪。
  const containerStyle = [
    "height:100%",
    "width:100%",
    "position:relative",
    "overflow:auto",
    "box-sizing:border-box",
    "padding:12px",
    "background:#fafafa",
    "flex:1 1 auto",
    "min-height:0",
  ].join(";");

  const dialog = new Dialog({
    title: options.title,
    width: options.width ?? "90%",
    height: options.height ?? "90%",
    // 容器注入：content 为 HTML 字符串，放置带唯一 id 的 div；
    // getContainer 以 document.getElementById 取回该节点。
    content: `<div id="${containerId}" style="${containerStyle}"></div>`,
    destroyCallback: () => teardown(),
  });

  // 初始化 Dialog body flex 布局（思源 Dialog 默认 body 没设 height 导致
  // 内部容器 height:100% 塌陷）。
  setupDialogBody(dialog);

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
