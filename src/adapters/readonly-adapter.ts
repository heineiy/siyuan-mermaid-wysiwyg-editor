/**
 * 兜底只读降级适配器。
 *
 * 未支持图类型 + Mermaid 语法错误场景的**可编辑降级**：
 * - 以前：纯只读预览 + mermaid.render 失败时容器空/错误提示 → 用户无法修
 * - 现在：分屏布局（左 textarea + 右 SVG 预览），textarea 改了 debounce 500ms 重新渲染，
 *   成功则调 opts.onGraphChange 写回思源（readonly 适配器也能写回合法代码）。
 *
 * 为什么支持写回？readonly 适配器路由到的场景：
 *   a) 未知图类型（如 foobarDiagram）—— mermaid 不识别 → 永远 render 失败 → 纯 textarea 改
 *   b) 语法错误的已知类型 —— 修对了 render 成功 → 自动写回
 *   c) Visimer render-only 类型（zenuml）—— render 成功但 Visimer 不能交互 → textarea 改也行
 * 三种场景都需要 textarea + 写回通道，所以 "readonly" 语义这里收窄为 "无图形编辑交互"，
 * 不是 "绝对不可改"。这是为了用户体验做的契约放宽。
 *
 * 渲染依赖 mermaid 运行时。mermaid v12 API：
 *   render(id: string, text: string, svgContainingElement?: Element)
 *     → Promise<RenderResult{ svg, diagramType, bindFunctions? }>
 * 语法错误/未知类型时 render 以 reject 上报。
 *
 * DOM 结构（与 VisimerBackend 分屏布局一致，便于后续抽公共 builder）：
 *   container (flex column, height:100%)
 *   ├── .mw-toolbar
 *   │   ├── [显示/隐藏代码] 按钮
 *   │   └── [当前状态：✓ 语法正确 / ✗ 语法错误 / ⚠ 未知类型] 状态指示器
 *   └── .mw-body (flex row, flex:1)
 *       ├── .mw-text-pane (默认显示！readonly 场景用户需要修代码)
 *       │   └── <textarea>
 *       └── .mw-preview-slot (flex:1)
 *           └── SVG 或错误提示
 */

import type { AdapterOptions, DiagramAdapter } from "./registry";
import mermaid from "mermaid";
import { buildExportDropdown } from "../utils/exporter-ui";

/** 渲染结果：只读 SVG 字符串。 */
export interface ReadonlyRenderResult {
  svg: string;
}

/**
 * 渲染器注入点：测试注入 fake 验证契约；缺省走真实 mermaid.render。
 *
 * 第 3 参数 container 是 bugfix（2026-09-17）：mermaid v12 render() 失败时
 * 会把临时 SVG DOM 残留在 document.body 里。传 container 后 mermaid 把临时
 * DOM 渲染到我们自己的容器里，即使失败也留在 container 内，destroy → innerHTML=""
 * 能彻底清干净。旧 mock renderer 不传 container 仍可工作（向后兼容）。
 */
export type ReadonlyRenderer = (
  id: string,
  code: string,
  container?: Element,
) => Promise<ReadonlyRenderResult>;

/** 兜底只读适配器构造选项。 */
export interface ReadOnlyAdapterOptions {
  /** 渲染器（缺省：真实 mermaid.render）。 */
  renderer?: ReadonlyRenderer;
  /** 渲染/解析失败回调（渲染错误保护接线点）。 */
  onError?: (err: unknown) => void;
  /** debounce 时长（缺省 500ms，与 sync.ts 防抖对齐）。 */
  debounceMs?: number;
}

let renderSeq = 0;
/** 每次渲染的唯一 id：避免 mermaid 生成的 SVG id 在容器间冲突。 */
const nextRenderId = (): string => `mermaid-readonly-${++renderSeq}`;

/**
 * 缺省渲染器：真实 mermaid。
 * - startOnLoad 显式关闭，防御宿主页全局配置污染。
 * - 第 3 参数 container 传给 mermaid.render → 临时 DOM 锁死在容器内。
 */
const defaultRenderer: ReadonlyRenderer = async (id, code, container) => {
  mermaid.initialize({ startOnLoad: false });
  const { svg } = await mermaid.render(id, code, container);
  return { svg };
};

/** 状态指示器：render 成功时显示 ✓，失败时显示 ✗ + 错误摘要。 */
type RenderStatus = "rendering" | "ok" | "error";

/** 兜底只读降级适配器。 */
export class ReadOnlyAdapter implements DiagramAdapter {
  /** 兜底通配：匹配任意未支持类型。 */
  readonly type = "*" as const;
  /**
   * 语义收窄："无图形交互编辑" 而非 "绝对不可改"。
   * textarea 改代码 → debounce → render 成功 → onGraphChange 写回。
   */
  readonly supportLevel = "readonly" as const;

  private readonly renderer: ReadonlyRenderer;
  private readonly onError?: (err: unknown) => void;
  private readonly debounceMs: number;
  private container: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private previewSlot: HTMLElement | null = null;
  private textPane: HTMLElement | null = null;
  private statusLabel: HTMLElement | null = null;
  private toolbar: HTMLElement | null = null;
  /** debounce timer：textarea input → 重新 render → onGraphChange。 */
  private debounceTimer: number | null = null;
  /** 最新一次 render 请求编号（竞态守卫：连续输入时只采纳最后一次结果）。 */
  private renderRequestId = 0;
  /** 防止 applyEdits 回声（程序化改 textarea.value 时跳过 input 事件）。 */
  private applying = false;
  /** opts.onGraphChange 引用（init 时保存，debounce 回调里用）。 */
  private onGraphChangeRef: ((newCode: string) => void) | null = null;

  constructor(options: ReadOnlyAdapterOptions = {}) {
    this.renderer = options.renderer ?? defaultRenderer;
    this.onError = options.onError;
    this.debounceMs = options.debounceMs ?? 500;
  }

  /**
   * 分屏布局创建：和 VisimerBackend 的 buildSplitLayout 结构一致
   * （toolbar + textarea 左 + preview 右），但 canvasSlot 换成 previewSlot
   * （只读适配器不用 Visimer，只是 mermaid.render 的 SVG 注入点）。
   */
  private buildLayout(container: HTMLElement): {
    toolbar: HTMLElement;
    textPane: HTMLElement;
    textarea: HTMLTextAreaElement;
    previewSlot: HTMLElement;
    statusLabel: HTMLElement;
  } {
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.minHeight = "0";

    // 顶部工具栏：toggle 按钮 + 状态指示器
    const toolbar = document.createElement("div");
    toolbar.className = "mw-toolbar";
    Object.assign(toolbar.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "4px 8px",
      borderBottom: "1px solid #e2e8f0",
      background: "#ffffff",
      flex: "0 0 auto",
    });

    // toggle 按钮
    const toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    Object.assign(toggleBtn.style, {
      fontSize: "12px",
      padding: "4px 10px",
      border: "1px solid #cbd5e1",
      borderRadius: "6px",
      background: "#eef2ff", // 默认显示代码 → 按钮高亮
      borderColor: "#2b6cb0",
      color: "#2b6cb0",
      cursor: "pointer",
      fontFamily: "inherit",
    });
    toggleBtn.textContent = "◀ 隐藏代码";

    // 状态指示器
    const statusLabel = document.createElement("span");
    Object.assign(statusLabel.style, {
      fontSize: "12px",
      color: "#64748b",
      marginLeft: "auto", // 推到工具栏最右
    });
    statusLabel.textContent = "● 渲染中...";

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(statusLabel);

    // body 行
    const body = document.createElement("div");
    body.style.display = "flex";
    body.style.flex = "1 1 auto";
    body.style.minHeight = "0";
    body.style.overflow = "hidden";

    // text-pane
    const textPane = document.createElement("div");
    textPane.className = "mw-text-pane";
    Object.assign(textPane.style, {
      flex: "0 0 35%",
      display: "flex",
      flexDirection: "column",
      borderRight: "1px solid #e2e8f0",
      minWidth: "0",
    });

    const textarea = document.createElement("textarea");
    textarea.className = "mw-code-editor";
    Object.assign(textarea.style, {
      width: "100%",
      height: "100%",
      border: "none",
      outline: "none",
      resize: "none",
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
      fontSize: "13px",
      lineHeight: "1.5",
      padding: "12px",
      background: "#f8fafc",
      color: "#1e293b",
      tabSize: 2,
      flex: "1 1 auto",
      minHeight: "0",
    });
    textarea.setAttribute("spellcheck", "false");
    textPane.appendChild(textarea);

    // preview-slot（mermaid SVG 或错误提示注入点）
    const previewSlot = document.createElement("div");
    previewSlot.className = "mw-preview-slot";
    Object.assign(previewSlot.style, {
      flex: "1 1 auto",
      minHeight: "0",
      overflow: "auto",
      background: "#fafafa",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    });

    body.appendChild(textPane);
    body.appendChild(previewSlot);
    container.appendChild(toolbar);
    container.appendChild(body);

    // toggle 逻辑
    let textPaneVisible = true;
    toggleBtn.addEventListener("click", () => {
      textPaneVisible = !textPaneVisible;
      if (textPaneVisible) {
        textPane.style.display = "flex";
        toggleBtn.textContent = "◀ 隐藏代码";
        toggleBtn.style.background = "#eef2ff";
        toggleBtn.style.borderColor = "#2b6cb0";
        toggleBtn.style.color = "#2b6cb0";
      } else {
        textPane.style.display = "none";
        toggleBtn.textContent = "▶ 显示代码";
        toggleBtn.style.background = "#ffffff";
        toggleBtn.style.borderColor = "#cbd5e1";
        toggleBtn.style.color = "#475569";
      }
    });

    return { toolbar, textPane, textarea, previewSlot, statusLabel };
  }

  /** 更新顶部状态指示器。 */
  private setStatus(status: RenderStatus, detail?: string): void {
    if (!this.statusLabel) {
      return;
    }
    switch (status) {
      case "rendering":
        this.statusLabel.textContent = "● 渲染中...";
        this.statusLabel.style.color = "#64748b";
        break;
      case "ok":
        this.statusLabel.textContent = "✓ 语法正确";
        this.statusLabel.style.color = "#16a34a";
        break;
      case "error": {
        const short = (detail ?? "").replace(/\n/g, " ").slice(0, 60);
        this.statusLabel.textContent = `✗ ${short}`;
        this.statusLabel.style.color = "#dc2626";
        this.statusLabel.title = detail ?? ""; // hover 看完整错误
        break;
      }
    }
  }

  /**
   * 尝试 render；成功注入 SVG + 调 onGraphChange；失败显示错误提示。
   * 竞态守卫：用 requestId 确保只采纳最后一次 render 的结果。
   */
  private async tryRender(code: string): Promise<void> {
    if (!this.previewSlot || !this.container) {
      return;
    }
    const myRequest = ++this.renderRequestId;
    this.setStatus("rendering");

    try {
      const { svg } = await this.renderer(nextRenderId(), code, this.previewSlot);
      // 竞态丢弃：如果中间又发起了新的 render，这次结果作废
      if (myRequest !== this.renderRequestId || this.container === null) {
        return;
      }
      this.previewSlot.innerHTML = svg;
      this.setStatus("ok");
      // render 成功 → 说明代码合法 → 写回思源
      this.onGraphChangeRef?.(code);
    } catch (err) {
      if (myRequest !== this.renderRequestId || this.container === null) {
        return;
      }
      this.onError?.(err);
      const msg = err instanceof Error ? err.message : String(err);
      this.showError(msg);
      this.setStatus("error", msg);
    }
  }

  /** 在 preview-slot 里显示错误提示（红框 + 错误信息 + "修好了会自动保存"）。 */
  private showError(message: string): void {
    if (!this.previewSlot) {
      return;
    }
    this.previewSlot.innerHTML = "";
    const box = document.createElement("div");
    Object.assign(box.style, {
      maxWidth: "480px",
      padding: "20px 24px",
      background: "#fef2f2",
      border: "1px solid #fecaca",
      borderRadius: "12px",
      color: "#991b1b",
      fontFamily: "inherit",
      fontSize: "14px",
      lineHeight: "1.6",
      textAlign: "left",
    });
    const title = document.createElement("div");
    title.style.fontWeight = "600";
    title.style.marginBottom = "8px";
    title.textContent = "⚠ Mermaid 语法错误";
    const body = document.createElement("div");
    body.style.fontFamily = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
    body.style.fontSize = "12px";
    body.style.background = "#fee2e2";
    body.style.padding = "8px 12px";
    body.style.borderRadius = "6px";
    body.style.overflow = "auto";
    body.textContent = message;
    const hint = document.createElement("div");
    hint.style.marginTop = "12px";
    hint.style.fontSize = "12px";
    hint.style.color = "#64748b";
    hint.textContent = "← 在左侧 textarea 里修正代码，语法正确后自动保存回思源";
    box.appendChild(title);
    box.appendChild(body);
    box.appendChild(hint);
    this.previewSlot.appendChild(box);
  }

  /** textarea input → debounce → tryRender → 成功则 onGraphChange。 */
  private scheduleRenderFromTextarea(): void {
    if (this.applying || !this.textarea) {
      return;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      if (this.textarea) {
        this.tryRender(this.textarea.value);
      }
    }, this.debounceMs);
  }

  /**
   * 初始化：分屏布局 → textarea 灌初始 code → 首次 render → 绑定 input。
   */
  async init(code: string, opts: AdapterOptions): Promise<void> {
    // 清旧容器
    this.clearContainer();
    const container = opts.container;
    this.container = container;
    this.onGraphChangeRef = opts.onGraphChange;

    // 构建分屏布局
    const layout = this.buildLayout(container);
    this.textarea = layout.textarea;
    this.previewSlot = layout.previewSlot;
    this.textPane = layout.textPane;
    this.statusLabel = layout.statusLabel;
    this.toolbar = layout.toolbar;

    // 导出 dropdown（共用 exporter-ui 工厂函数）
    this.toolbar.appendChild(buildExportDropdown({
      getCode: () => this.textarea?.value ?? "",
      statusLabel: this.statusLabel,
    }));

    // textarea 初始灌 code
    this.applying = true;
    this.textarea.value = code;
    this.applying = false;

    // 绑定 input 事件 → debounce render
    this.textarea.addEventListener("input", () => this.scheduleRenderFromTextarea());

    // 首次 render
    await this.tryRender(code);
  }

  /** 清理：cancel debounce → 解绑事件 → clearContainer。 */
  destroy(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.textarea) {
      // textarea 会随 container.innerHTML="" 一起被 GC，无需显式 removeEventListener
      this.textarea = null;
    }
    this.clearContainer();
    this.container = null;
    this.previewSlot = null;
    this.textPane = null;
    this.statusLabel = null;
    this.toolbar = null;
    this.onGraphChangeRef = null;
  }

  private clearContainer(): void {
    if (this.container !== null) {
      this.container.innerHTML = "";
    }
  }
}
