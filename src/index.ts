import { Plugin } from "siyuan";

/**
 * Mermaid 双向可视化编辑插件入口。
 *
 * 本期（T1）仅提供最小可加载骨架：onload / onunload 生命周期日志，
 * 保证产物可被思源加载器实例化。真实触发逻辑（block-icon、快捷键、
 * Dialog 画布、双向同步）在后续任务（T8–T13）中实现。
 */
export default class MermaidWysiwygEditorPlugin extends Plugin {
  async onload() {
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin loaded");
  }

  onunload() {
    console.log("[siyuan-mermaid-wysiwyg-editor] plugin unloaded");
  }
}
