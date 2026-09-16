import { Plugin, Setting } from "siyuan";
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

/**
 * Mermaid 双向可视化编辑插件入口。
 *
 * 已落地：
 * - T1：最小可加载骨架（onload / onunload 生命周期日志）。
 * - T9：block-icon 触发入口 —— 监听思源 `click-blockicon`，命中 Mermaid 代码块
 *   时弹出含"可视化编辑"的块菜单，点击后打开受控 Dialog（容器就绪）；
 *   非 Mermaid 块零副作用；onunload 卸载监听。
 * - T10：快捷键触发 + 可配置设置 —— 默认 `Shift+Alt+M`，光标位于 Mermaid
 *   代码块内触发（与 T9 走同一 Dialog 打开路径）；设置项（思源官方 Setting
 *   类）可改键，saveData 持久化、保存后立即生效（旧键失效、新键生效）。
 *
 * 后续任务：
 * - T11：在 onOpenMermaidEditor 中注入真实双向同步初始化（读取块源码 → 剥离
 *   围栏 → 组装对应图类型后端 → 挂载画布到 Dialog 容器）。
 */
export default class MermaidWysiwygEditorPlugin extends Plugin {
  private unregisterBlockIconTrigger: (() => void) | undefined;
  private unregisterShortcutTrigger: (() => void) | undefined;
  /** 当前快捷键设置（default | custom），save 后立即更新以即时生效。 */
  private shortcutSetting: ShortcutSetting = { mode: "default" };
  // 设置对话框实例由基类 Plugin.setting 承载（siyuan.d.ts:598）：
  // this.setting 赋值后思源插件列表即显示"设置"按钮（官方 plugin-sample 模式）。

  async onload() {
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin loaded");

    // ---- 快捷键设置（REQ-TRIGGER-003）：读取持久化配置 + 设置界面 ----
    // this 结构兼容 ShortcutStorage（Plugin 基类自带 loadData/saveData）。
    this.shortcutSetting = await loadShortcutSetting(this);
    this.setupSettingUI();

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
   * 打开编辑 Dialog（T9/T10 共享的打开路径，快捷键与 block-icon 共用）。
   * T11 TODO：在此注入真实双向同步初始化 —— 读取块 Markdown、剥离 ```mermaid
   * 围栏、按图类型组装 Adapter/RenderBackend、将画布挂载到 Dialog 容器，
   * 并在 onDestroy 中销毁后端实例。
   */
  private openMermaidEditor(_blockId?: string): void {
    // T9/T10 临时实现：仅打开 Dialog，画布容器即就绪（openEditorDialog 返回
    // 句柄的 getContainer() 可取得容器节点）。
    openEditorDialog({
      title: "Mermaid 可视化编辑",
      width: "90%",
      height: "90%",
      onDestroy: () => {
        // T11：销毁后端实例（当前无后端，空 stub）。
      },
    });
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
