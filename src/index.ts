import { Plugin } from "siyuan";
import { openEditorDialog } from "./controller/dialog";
import { registerBlockIconTrigger } from "./controller/trigger";

/**
 * Mermaid 双向可视化编辑插件入口。
 *
 * 已落地：
 * - T1：最小可加载骨架（onload / onunload 生命周期日志）。
 * - T9：block-icon 触发入口 —— 监听思源 `click-blockicon`，命中 Mermaid 代码块
 *   时弹出含"可视化编辑"的块菜单，点击后打开受控 Dialog（容器就绪）；
 *   非 Mermaid 块零副作用；onunload 卸载监听。
 *
 * 后续任务：
 * - T11：在 onOpenMermaidEditor 中注入真实双向同步初始化（读取块源码 → 剥离
 *   围栏 → 组装对应图类型后端 → 挂载画布到 Dialog 容器）。
 */
export default class MermaidWysiwygEditorPlugin extends Plugin {
  private unregisterBlockIconTrigger: (() => void) | undefined;

  async onload() {
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin loaded");

    this.unregisterBlockIconTrigger = registerBlockIconTrigger({
      eventBus: this.eventBus,
      onOpenMermaidEditor: (blockId) => {
        // T9 临时实现：仅打开 Dialog，画布容器即就绪（openEditorDialog 返回句柄
        // 的 getContainer() 可取得容器节点）。
        // T11 TODO：在此注入真实双向同步初始化 —— 用 blockId 读取块 Markdown、
        // 剥离 ```mermaid 围栏、按图类型组装 Adapter/RenderBackend、将画布挂载到
        // Dialog 容器，并在 onDestroy 中销毁后端实例。
        openEditorDialog({
          title: "Mermaid 可视化编辑",
          width: "90%",
          height: "90%",
          onDestroy: () => {
            // T11：销毁后端实例（当前无后端，空 stub）。
          },
        });
      },
    });
  }

  onunload() {
    this.unregisterBlockIconTrigger?.();
    this.unregisterBlockIconTrigger = undefined;
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin unloaded");
  }
}
