import { Plugin, Setting, fetchSyncPost } from "siyuan";
import { DIAGRAM_TYPES } from "@visimer/core";
import { AdapterRegistry } from "./adapters/registry";
import { VisimerFullAdapter } from "./adapters/visimer-full-adapter";
import { ReadOnlyAdapter } from "./adapters/readonly-adapter";
import { initEditorSession, type EditorSession } from "./controller/sync";
import { openEditorDialog } from "./controller/dialog";
import { registerShortcutTrigger } from "./controller/shortcut";
import {
  DEFAULT_SHORTCUT,
  loadShortcutSetting,
  resolveShortcut,
  saveShortcutSetting,
  type ShortcutSetting,
} from "./controller/settings";
import { registerBlockIconTrigger } from "./controller/trigger";
import { stripKramdownIal } from "./utils/fence";

/**
 * 思源内核 API 最小封装（fetchSyncPost 由 siyuan 包运行时导出，siyuan.d.ts:401；
 * 生产验证模式来自参考插件 siyuan-plugin-task-note-management v7.1.1）。
 * 注意：window.siyuan 上没有 api 通道，内核 API 统一走
 * fetchSyncPost('/api/...')，返回 { code, msg, data }，code===0 为成功。
 */

/**
 * 读取代码块的 Markdown 源码。
 * 内核没有 /api/block/getBlockMarkdown 端点（3.8.3 实测 404）；
 * 正确端点是 POST /api/block/getBlockKramdown → data.kramdown，
 * 其尾部携带块级 IAL（{: id=... updated=...}），剥离后得到纯 markdown。
 */
async function fetchBlockMarkdown(id: string): Promise<string> {
  const res = await fetchSyncPost("/api/block/getBlockKramdown", { id });
  if (res.code !== 0) {
    throw new Error(`getBlockKramdown 失败: ${res.msg}`);
  }
  return stripKramdownIal((res.data as { kramdown: string }).kramdown);
}

/** 写回代码块源码（POST /api/block/updateBlock，dataType=markdown）。 */
async function fetchUpdateBlock(id: string, data: string): Promise<void> {
  const res = await fetchSyncPost("/api/block/updateBlock", { id, data, dataType: "markdown" });
  if (res.code !== 0) {
    throw new Error(`updateBlock 失败: ${res.msg}`);
  }
}

/**
 * Mermaid 双向可视化编辑插件入口。
 *
 * 已落地：
 * - 最小可加载骨架（onload / onunload 生命周期日志）。
 * - block-icon 触发入口 —— 监听思源 `click-blockicon`，命中 Mermaid 代码块
 *   时弹出含"可视化编辑"的块菜单，点击后打开受控 Dialog（容器就绪）；
 *   非 Mermaid 块零副作用；onunload 卸载监听。
 * - 快捷键触发 + 可配置设置 —— 默认 `Shift+Alt+M`，光标位于 Mermaid
 *   代码块内触发（与 block-icon 走同一 Dialog 打开路径）；设置项（思源官方 Setting
 *   类）可改键，saveData 持久化、保存后立即生效（旧键失效、新键生效）。
 * - 双向同步协调器接线 —— onload 组装适配器注册表（VisimerFullAdapter × 22 +
 *   ReadOnlyAdapter 通配兜底）；打开 Dialog 后经 initEditorSession 建立正向
 *   （读块源码 → 剥离围栏 → 适配器渲染）与反向（onGraphChange → 防抖 → wrapFence
 *   → updateBlock）闭环，Dialog 关闭（onDestroy）时 flush 未决写回并销毁会话。
 */
export default class MermaidWysiwygEditorPlugin extends Plugin {
  private unregisterBlockIconTrigger: (() => void) | undefined;
  private unregisterShortcutTrigger: (() => void) | undefined;
  /** 当前快捷键设置（default | custom），save 后立即更新以即时生效。 */
  private shortcutSetting: ShortcutSetting = { mode: "default" };
  /** 适配器注册表（onload 组装；能力路由 route() 依此分派 full/readonly/unknown）。 */
  private readonly registry = new AdapterRegistry();
  // 设置对话框实例由基类 Plugin.setting 承载（siyuan.d.ts:598）：
  // this.setting 赋值后思源插件列表即显示"设置"按钮（官方 plugin-sample 模式）。

  async onload() {
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin loaded");

    // ---- 快捷键设置：读取持久化配置 + 设置界面 ----
    // this 结构兼容 ShortcutStorage（Plugin 基类自带 loadData/saveData）。
    this.shortcutSetting = await loadShortcutSetting(this);
    this.setupSettingUI();

    // ---- 适配器注册表：Visimer 全编辑 × 22 种 + 通配只读兜底 ----
    // DIAGRAM_TYPES 来自 @visimer/core，22 种 capability="edit"（含 flowchart/sequence/class/state/
    // er/gantt/pie/sankey/mindmap/architecture 等）+ 1 种 capability="render"（zenuml）。
    // 精确注册每种 edit 类型 → route() 精确匹配到 kind:"full"；
    // ReadOnlyAdapter 通配 type="*" → 未精确注册的 render-only + 未知类型走兜底。
    DIAGRAM_TYPES.filter((t) => t.capability === "edit").forEach((t) => {
      this.registry.register(new VisimerFullAdapter({ type: t.id }));
    });
    this.registry.register(new ReadOnlyAdapter());

    this.unregisterBlockIconTrigger = registerBlockIconTrigger({
      eventBus: this.eventBus,
      onOpenMermaidEditor: (blockId) => this.openMermaidEditor(blockId),
    });

    this.unregisterShortcutTrigger = registerShortcutTrigger({
      settings: {
        getEffectiveShortcut: () => resolveShortcut(this.shortcutSetting),
      },
      onTrigger: () => this.openMermaidEditor(),
    });
  }

  /**
   * 打开编辑 Dialog 并建立双向同步会话（block-icon / 快捷键共享的打开路径）。
   * 正向流：openEditorDialog 取画布容器 → initEditorSession（getBlockMarkdown 读块
   * 源码 → stripFence 剥离围栏 → 适配器渲染）；反向流：onGraphChange → 500ms 防抖
   * → wrapFence 包回 → updateBlock（真实实现 window.siyuan.api.block.*，小写 siyuan）。
   * Dialog 关闭（onDestroy）时 flush 未决写回并销毁会话。
   */
  private openMermaidEditor(blockId?: string): void {
    if (!blockId) {
      // 无目标块（如快捷键触发但块 id 缺失）：无法建立读写闭环，直接放弃。
      console.warn("[siyuan-mermaid-wysiwyg-editor] 缺少 blockId，无法初始化编辑会话");
      return;
    }

    let session: EditorSession | undefined;
    // 会话异步初始化期间用户可能已关闭 Dialog：销毁标志防泄漏（见 init 完成分支）。
    let dialogClosed = false;

    const handle = openEditorDialog({
      title: "Mermaid 可视化编辑",
      width: "90%",
      height: "90%",
      onDestroy: () => {
        // Dialog 关闭：flush 未决写回 + 销毁会话（adapter.destroy + cancel 防抖）。
        dialogClosed = true;
        session?.destroy();
        session = undefined;
      },
    });

    const container = handle.getContainer();
    if (!container) {
      // 容器未就绪（理论不可达）：关闭 Dialog 避免悬挂。
      handle.close();
      return;
    }

    void initEditorSession({
      blockId,
      container,
      registry: this.registry,
      getBlockMarkdown: (id) => fetchBlockMarkdown(id),
      updateBlock: (id, data) => fetchUpdateBlock(id, data),
    }).then(
      (s) => {
        if (dialogClosed) {
          // 初始化期间 Dialog 已关闭：立即销毁会话，避免画布/防抖残留泄漏。
          s.destroy();
          return;
        }
        session = s;
      },
      (err) => {
        // 读取/初始化失败兜底（如 getBlockMarkdown 拒绝 / stripFence fail-fast）：
        // 错误信息渲染进画布容器（简单错误 div），不抛未捕获异常。
        console.error("[siyuan-mermaid-wysiwyg-editor] 初始化编辑会话失败", err);
        const c = handle.getContainer();
        if (c) {
          const message = err instanceof Error ? err.message : String(err);
          c.innerHTML = `<div class="mermaid-wysiwyg-error">可视化编辑器加载失败：${message}</div>`;
        }
      }
    );
  }

  /**
   * 快捷键设置界面（思源官方 Setting 类模式，siyuan.d.ts:796-813）：
   * 一个输入框 + confirmCallback 保存，saveData 持久化、保存后立即生效。
   */
  private setupSettingUI(): void {
    const input = document.createElement("input");
    input.id = "mermaid-wysiwyg-shortcut";
    input.className = "b3-text-field";
    input.value = resolveShortcut(this.shortcutSetting);
    input.placeholder = DEFAULT_SHORTCUT;

    this.setting = new Setting({
      confirmCallback: async () => {
        const value = input.value.trim();
        // 空值或等于默认键 → 存 default 形态；否则存 custom 形态。
        const next: ShortcutSetting =
          value === "" || value === DEFAULT_SHORTCUT ? { mode: "default" } : { mode: "custom", value };
        this.shortcutSetting = next; // 立即生效：下一次 keydown 即按新键匹配
        await saveShortcutSetting(this, next);
      },
    });
    this.setting.addItem({
      title: "可视化编辑快捷键",
      description:
        "光标位于 Mermaid 代码块内时按下触发。请避开思源已占用的 Alt+M / Ctrl+M / Ctrl+Alt+M / Ctrl+Shift+M。",
      actionElement: input,
    });
  }

  onunload() {
    this.unregisterBlockIconTrigger?.();
    this.unregisterBlockIconTrigger = undefined;
    this.unregisterShortcutTrigger?.();
    this.unregisterShortcutTrigger = undefined;
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin unloaded");
  }
}
