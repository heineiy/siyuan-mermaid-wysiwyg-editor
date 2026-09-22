/**
 * Visimer 渲染后端（极简版，官方包优先）。
 *
 * 组装链路：
 *   1. MermaidWysiwygEditor({ code }) → headless 双向编辑引擎
 *   2. MermaidCodeMirror(host, editor) → 官方代码面板（语法高亮 + entity 高亮 + 共享 undo）
 *   3. MermaidCanvasView({ editor, container, mermaid, panZoom: true }) → 交互式画布
 *   4. 原生 DOM 工具栏 → Select/Connect 工具切换 + Delete/Undo/Redo + 类型专属按钮
 *
 * 关键：不自己实现 textarea + bindTextPane + toolbar 逻辑——全用官方包。
 * MermaidCodeMirror 是 @visimer/codemirror 提供的非 React 类，三行代码搞定代码面板。
 */
import mermaid from "mermaid";
import type { BackendFactory, RenderBackend, RenderBackendOptions } from "./backend";
import { buildExportDropdown } from "../utils/exporter-ui";
import {
  MermaidWysiwygEditor,
  DIAGRAM_TYPES,
  type ShapeId,
  type ParticipantType,
} from "@visimer/core";
import { MermaidCanvasView, type Tool } from "@visimer/dom";
import { MermaidCodeMirror } from "@visimer/codemirror";
import { EditorView } from "@codemirror/view";

const SHAPES: Array<{ id: ShapeId; label: string }> = [
  { id: "rect", label: "矩形" },
  { id: "round", label: "圆角" },
  { id: "diamond", label: "菱形" },
  { id: "cylinder", label: "数据库" },
  { id: "hexagon", label: "六边形" },
  { id: "circle", label: "圆形" },
];

const PARTICIPANTS: Array<{ id: ParticipantType; label: string }> = [
  { id: "actor", label: "Actor" },
  { id: "participant", label: "Participant" },
  { id: "boundary", label: "Boundary" },
  { id: "control", label: "Control" },
  { id: "entity", label: "Entity" },
  { id: "database", label: "Database" },
  { id: "collections", label: "Collections" },
  { id: "queue", label: "Queue" },
];

export interface VisimerBackendOptions {
  mermaidInstance?: typeof mermaid;
  /** 是否显示代码面板（默认 true，工具栏按钮可隐藏）。 */
  showCodePanelByDefault?: boolean;
}

/** Visimer 渲染后端：极简组装 + 官方包。 */
export class VisimerBackend implements RenderBackend {
  private readonly mermaidInstance: typeof mermaid;
  private readonly showCodePanelByDefault: boolean;
  private view: MermaidCanvasView | null = null;
  private editor: MermaidWysiwygEditor | null = null;
  private codeMirror: MermaidCodeMirror | null = null;
  private offChange: (() => void) | null = null;
  /** 代码面板容器（用于 toggle 显隐）。 */
  private codePane: HTMLElement | null = null;
  /** Canvas 工具栏（原生 DOM）。 */
  private toolbar: HTMLElement | null = null;
  /** 状态指示器。 */
  private statusLabel: HTMLElement | null = null;

  constructor(options: VisimerBackendOptions = {}) {
    this.mermaidInstance = options.mermaidInstance ?? mermaid;
    this.showCodePanelByDefault = options.showCodePanelByDefault ?? true;
  }

  async init(code: string, opts: RenderBackendOptions): Promise<void> {
    this.destroy();

    // 清空 container 内部
    opts.container.innerHTML = "";

    // 1. headless 编辑引擎
    const editor = new MermaidWysiwygEditor({ code });
    this.editor = editor;

    // 画布编辑 → 文本回推 → sync.ts 防抖写回思源
    this.offChange = editor.on("change", ({ code: newCode }) => {
      opts.onGraphChange(newCode);
    });

    // 2. 构建布局：[canvas工具栏] + [canvas 左 | code 右] + [底部状态栏]
    const layout = this.buildLayout(opts.container);
    this.toolbar = layout.toolbar;
    this.statusLabel = layout.statusLabel;

    // 3. 官方代码面板（非 React，原生 DOM 类）
    // 传入浅色主题扩展：显式指定明确定色，避免和思源浅色背景冲突
    const lightTheme = EditorView.theme({
      "&": {
        background: "#ffffff",
        color: "#1e293b",
        height: "100%",
        fontSize: "13px",
        fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
      },
      ".cm-content": {
        padding: "8px 10px",
      },
      ".cm-gutters": {
        background: "#f8fafc",
        color: "#94a3b8",
        border: "none",
      },
      ".cm-activeLine": { background: "#f1f5f9" },
      ".cm-activeLineGutter": { background: "#e2e8f0" },
      ".cm-selectionBackground": { background: "#bfdbfe !important" },
      "&.cm-focused .cm-selectionBackground": { background: "#93c5fd !important" },
    }, { dark: false });
    this.codePane = layout.codePane;
    this.codeMirror = new MermaidCodeMirror(layout.codeMirrorHost, editor, [lightTheme]);
    if (!this.showCodePanelByDefault) {
      layout.codePane.style.display = "none";
    }

    // 4. 交互式画布
    const view = new MermaidCanvasView({
      editor,
      container: layout.canvasSlot,
      mermaid: this.mermaidInstance as unknown as ConstructorParameters<typeof MermaidCanvasView>[0]["mermaid"],
      mermaidConfig: { startOnLoad: false, securityLevel: "loose" },
      panZoom: true,
      readOnly: false,
      accentColor: "#2b6cb0",
      defaultEdge: { arrowEnd: "arrow" },
      debounceMs: 200,
    });
    this.view = view;
    view.setTool("select");

    // 5. 在 toolbar 最右侧加代码面板 toggle 按钮（永远在工具栏上，不会随 codePane 隐藏）
    const toggleCodeBtn = document.createElement("button");
    toggleCodeBtn.type = "button";
    toggleCodeBtn.title = "Toggle the Mermaid source panel";
    Object.assign(toggleCodeBtn.style, {
      fontSize: "12px", padding: "4px 10px",
      border: "1px solid #cbd5e1", borderRadius: "6px",
      background: "#ffffff", color: "#475569",
      cursor: "pointer", fontFamily: "inherit", marginLeft: "4px",
    });
    const toggleCodeBtnSet = (shown: boolean) => {
      toggleCodeBtn.textContent = shown ? "Hide Code" : "Show Code";
      Object.assign(toggleCodeBtn.style, (
        shown
          ? { background: "#2b6cb0", borderColor: "#2b6cb0", color: "#ffffff" }
          : { background: "#ffffff", borderColor: "#cbd5e1", color: "#475569" }
      ));
    };
    toggleCodeBtn.addEventListener("click", () => {
      if (!this.codePane) return;
      const shown = this.codePane.style.display !== "none";
      this.codePane.style.display = shown ? "none" : "flex";
      toggleCodeBtnSet(!shown);
    });
    // 初始：代码面板显示 → 按钮为选中态（蓝色高亮），与 Select 等工具一致
    toggleCodeBtnSet(true);

    // 6. 构建 canvas 工具栏（Select/Connect/+Node/Delete/Undo/Redo）
    this.buildCanvasToolbar(layout.toolbar, editor, view, layout);
    // toggle 按钮加到最右（buildCanvasToolbar 会加 spacer push 到右）
    layout.toolbar.appendChild(toggleCodeBtn);

    // 6. 状态指示器订阅 render 事件
    view.on("render", () => {
      if (!this.statusLabel) {
        return;
      }
      if (view.renderError) {
        this.statusLabel.textContent = "✗ " + view.renderError.replace(/\n/g, " ").slice(0, 50);
        this.statusLabel.style.color = "#dc2626";
      } else {
        this.statusLabel.textContent = "✓ mermaid parse ok";
        this.statusLabel.style.color = "#16a34a";
      }
    });
  }

  /**
   * container 内建完整 flex 布局（原生 DOM，不依赖 React/Vue）。
   *
   * 结构：
   *   container (flex column)
   *   ├── .mw-canvas-toolbar   ← 画布工具栏（Select/Connect/+Node/...）
   *   ├── .mw-body             ← flex row
   *   │   ├── .mw-canvas-slot  ← MermaidCanvasView 挂这里（flex:1）
   *   │   └── .mw-code-pane    ← MermaidCodeMirror 挂这里（flex:0 0 40%）
   *   └── .mw-statusbar        ← ✓/✗ 状态
   */
  private buildLayout(container: HTMLElement) {
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.minHeight = "0";

    // Canvas 工具栏
    const toolbar = document.createElement("div");
    toolbar.className = "mw-canvas-toolbar";
    Object.assign(toolbar.style, {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderBottom: "1px solid #e2e8f0",
      background: "#ffffff",
      flex: "0 0 auto",
      flexWrap: "wrap",
    });

    // 主体
    const body = document.createElement("div");
    body.className = "mw-body";
    Object.assign(body.style, {
      display: "flex",
      flex: "1 1 auto",
      minHeight: "0",
      overflow: "hidden",
    });

    // Canvas slot
    const canvasSlot = document.createElement("div");
    canvasSlot.className = "mw-canvas-slot";
    Object.assign(canvasSlot.style, {
      flex: "1 1 auto",
      minHeight: "0",
      minWidth: "0",
    });

    // Code pane（浅色主题，和思源融合）
    const codePane = document.createElement("div");
    codePane.className = "mw-code-pane";
    Object.assign(codePane.style, {
      flex: "0 0 40%",
      display: "flex",
      flexDirection: "column",
      borderLeft: "1px solid #e2e8f0",
      minWidth: "0",
      background: "#ffffff",
    });

    // Code pane 头部（只放标题，toggle 按钮移到 canvas toolbar 上）
    const codeHeader = document.createElement("div");
    Object.assign(codeHeader.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "4px 10px",
      background: "#f1f5f9",
      color: "#475569",
      fontSize: "12px",
      fontWeight: "600",
      flex: "0 0 auto",
      borderBottom: "1px solid #e2e8f0",
    });
    codeHeader.textContent = "📝 Mermaid Source";

    const codeMirrorHost = document.createElement("div");
    codeMirrorHost.className = "mw-codemirror-host";
    Object.assign(codeMirrorHost.style, {
      flex: "1 1 auto",
      minHeight: "0",
      overflow: "hidden",
    });

    codePane.appendChild(codeHeader);
    codePane.appendChild(codeMirrorHost);

    // 状态条
    const statusBar = document.createElement("div");
    Object.assign(statusBar.style, {
      display: "flex",
      alignItems: "center",
      padding: "2px 10px",
      background: "#f8fafc",
      borderTop: "1px solid #e2e8f0",
      fontSize: "11px",
      color: "#64748b",
      flex: "0 0 auto",
    });
    const statusLabel = document.createElement("span");
    statusLabel.textContent = "● 初始化...";
    statusBar.appendChild(statusLabel);

    body.appendChild(canvasSlot);
    body.appendChild(codePane);
    container.appendChild(toolbar);
    container.appendChild(body);
    container.appendChild(statusBar);

    return { toolbar, canvasSlot, codePane, codeMirrorHost, statusLabel };
  }

  /**
   * 原生 DOM 画布工具栏（参考 playground React 版）。
   * Select | Connect | +Node/Direction | Delete | Undo | Redo
   */
  private buildCanvasToolbar(
    toolbar: HTMLElement,
    editor: MermaidWysiwygEditor,
    view: MermaidCanvasView,
    layout: { canvasSlot: HTMLElement }
  ): void {
    const btnStyle: Record<string, string> = {
      fontSize: "12px",
      padding: "4px 10px",
      border: "1px solid #cbd5e1",
      borderRadius: "6px",
      background: "#ffffff",
      color: "#475569",
      cursor: "pointer",
      fontFamily: "inherit",
    };

    const makeBtn = (text: string, onClick: () => void): HTMLButtonElement => {
      const btn = document.createElement("button");
      btn.type = "button";
      Object.assign(btn.style, btnStyle);
      btn.textContent = text;
      btn.addEventListener("click", onClick);
      return btn;
    };

    const setActiveBtn = (active: HTMLButtonElement) => {
      for (const child of toolbar.children) {
        // 跳过 disabled 按钮（Delete/Undo/Redo），保留其灰显态
        if (child instanceof HTMLButtonElement && !child.disabled) {
          Object.assign(child.style, btnStyle);
        }
      }
      Object.assign(active.style, btnStyle, {
        background: "#2b6cb0",
        borderColor: "#2b6cb0",
        color: "#ffffff",
      });
    };

    // Select
    const selectBtn = makeBtn("Select", () => {
      view.setTool("select");
      setActiveBtn(selectBtn);
    });
    toolbar.appendChild(selectBtn);

    // Connect
    const connectBtn = makeBtn("Connect", () => {
      view.setTool("connect");
      setActiveBtn(connectBtn);
    });
    toolbar.appendChild(connectBtn);

    // 分隔
    const sep = document.createElement("span");
    sep.textContent = "|";
    Object.assign(sep.style, { color: "#cbd5e1", margin: "0 4px" });
    toolbar.appendChild(sep);

    // 类型专属按钮（动态出现）
    const typeToolsHost = document.createElement("span");
    toolbar.appendChild(typeToolsHost);

    // Delete（需要 selection）
    const deleteBtn = makeBtn("🗑 Delete", () => {
      if (editor.selection.length > 0) {
        editor.deleteEntities(editor.selection);
      }
    });
    toolbar.appendChild(deleteBtn);

    // spacer
    const spacer = document.createElement("span");
    Object.assign(spacer.style, { flex: "1 1 auto" });
    toolbar.appendChild(spacer);

    // --- 导出 dropdown（共用 exporter-ui 工厂函数） ---
    // 取 editor 的当前 mermaid 源码。editor 无 getCode()，正确 API 是 code getter（或 getText()）。
    const codeFn = () => (editor as any).code ?? (editor as any).getText?.() ?? "";
    const typeFn = () => (editor as any).result?.typeInfo?.id ?? "diagram";
    toolbar.appendChild(buildExportDropdown({ getCode: codeFn, getType: typeFn, statusLabel: this.statusLabel }));

    // Undo
    const undoBtn = makeBtn("↶ Undo", () => editor.undo());
    toolbar.appendChild(undoBtn);

    // Redo
    const redoBtn = makeBtn("↷ Redo", () => editor.redo());
    toolbar.appendChild(redoBtn);

    // 初始激活 Select
    setActiveBtn(selectBtn);

    // 根据图类型动态更新工具栏按钮
    const updateTypeTools = () => {
      typeToolsHost.innerHTML = "";
      const typeInfo = editor.result.typeInfo;
      const typeId = typeInfo?.id;

      if (typeId === "flowchart" || typeId === "state") {
        // +Node select + 方向 select
        const nodeSelect = document.createElement("select");
        Object.assign(nodeSelect.style, btnStyle, { padding: "3px 6px" });
        const defaultOpt = document.createElement("option");
        defaultOpt.textContent = "+ Node...";
        nodeSelect.appendChild(defaultOpt);
        SHAPES.forEach((s) => {
          const opt = document.createElement("option");
          opt.value = s.id;
          opt.textContent = s.label;
          nodeSelect.appendChild(opt);
        });
        nodeSelect.addEventListener("change", () => {
          const v = nodeSelect.value as ShapeId;
          if (v) {
            view.addNode(v);
          }
          nodeSelect.value = "";
        });
        typeToolsHost.appendChild(nodeSelect);

        if (typeId === "flowchart") {
          const dirSelect = document.createElement("select");
          Object.assign(dirSelect.style, btnStyle, { padding: "3px 6px" });
          ["TD", "LR", "BT", "RL"].forEach((d) => {
            const opt = document.createElement("option");
            opt.value = d;
            opt.textContent = d;
            dirSelect.appendChild(opt);
          });
          const currentDir = (editor.result.flowchart?.direction ?? "TD").toUpperCase();
          dirSelect.value = currentDir;
          dirSelect.addEventListener("change", () => {
            editor.dispatch({ type: "setDirection", direction: dirSelect.value });
          });
          typeToolsHost.appendChild(dirSelect);
        }
      } else if (typeId === "sequence") {
        const partSelect = document.createElement("select");
        Object.assign(partSelect.style, btnStyle, { padding: "3px 6px" });
        const defaultOpt = document.createElement("option");
        defaultOpt.textContent = "+ Participant...";
        partSelect.appendChild(defaultOpt);
        PARTICIPANTS.forEach((p) => {
          const opt = document.createElement("option");
          opt.value = p.id;
          opt.textContent = p.label;
          partSelect.appendChild(opt);
        });
        partSelect.addEventListener("change", () => {
          if (partSelect.value) {
            editor.dispatch({ type: "seq.addParticipant", ptype: partSelect.value as ParticipantType });
          }
          partSelect.value = "";
        });
        typeToolsHost.appendChild(partSelect);
      } else if (typeId === "class") {
        const clsBtn = makeBtn("+ Class", () => editor.dispatch({ type: "cl.addClass" }));
        typeToolsHost.appendChild(clsBtn);
      } else if (typeId === "er") {
        const entBtn = makeBtn("+ Entity", () => editor.dispatch({ type: "er.addEntity" }));
        typeToolsHost.appendChild(entBtn);
      }
    };

    updateTypeTools();

    // 监听类型变化（如果图类型切换了）
    editor.on("change", () => updateTypeTools());

    // Update undo/redo/delete disabled state（disabled 时置灰，保持一致 UI）
    const updateUndoRedo = () => {
      undoBtn.disabled = !editor.canUndo;
      redoBtn.disabled = !editor.canRedo;
      deleteBtn.disabled = editor.selection.length === 0;
      for (const b of [undoBtn, redoBtn, deleteBtn]) {
        Object.assign(b.style, {
          color: b.disabled ? "#cbd5e1" : "#475569",
          cursor: b.disabled ? "not-allowed" : "pointer",
          borderColor: b.disabled ? "#e2e8f0" : "#cbd5e1",
        });
      }
    };
    updateUndoRedo();
    // 纯选中节点（不改代码）只触发 selectionChange，不触发 change——必须也监听，
    // 否则 Delete 一直置灰不可用
    editor.on("change", () => updateUndoRedo());
    editor.on("selectionChange", () => updateUndoRedo());
  }

  destroy(): void {
    if (this.codeMirror) {
      this.codeMirror.destroy();
      this.codeMirror = null;
    }
    if (this.offChange) {
      this.offChange();
      this.offChange = null;
    }
    if (this.view) {
      this.view.destroy();
      this.view = null;
    }
    this.editor = null;
    this.toolbar = null;
    this.codePane = null;
    this.statusLabel = null;
  }
}

export const visimerBackendFactory: BackendFactory = {
  id: "visimer",
  create: () => new VisimerBackend(),
};

// 重新导出 DIAGRAM_TYPES 给上层 index.ts 注册用
export { DIAGRAM_TYPES };
