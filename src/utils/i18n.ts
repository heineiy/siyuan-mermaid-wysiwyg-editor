/**
 * i18n.ts — 轻量国际化。按思源文档根节点 lang 返回中/英文案。
 *
 * 思源 `<html lang="zh-CN">` / `"en_US"`，据此动态切换，无需插件重启。
 * 所有工具栏/菜单/状态/提示文案统一走 `t(key)`，避免中英混杂。
 */
type Dict = Record<string, string>;

const en: Dict = {
  // 工具
  "tool.select": "Select",
  "tool.connect": "Connect",
  "tool.connectHint": "Click again to lock & connect multiple",
  "tool.connectLockedHint": "Locked: connect multiple (click to unlock)",
  // 编辑
  "edit.undo": "Undo",
  "edit.redo": "Redo",
  // 菜单/命令
  "menu.edit": "Visual Edit",
  "command.edit": "Mermaid Visual Edit",
  // 代码面板
  "code.hide": "Hide Code",
  "code.show": "Show Code",
  "code.title": "Mermaid Source",
  // 节点形状（+ Node... 下拉）
  "shape.addNode": "+ Node...",
  "shape.addParticipant": "+ Participant...",
  "shape.addClass": "+ Class",
  "shape.addEntity": "+ Entity",
  "shape.rect": "Rectangle",
  "shape.round": "Rounded",
  "shape.diamond": "Diamond",
  "shape.cylinder": "Database",
  "shape.hexagon": "Hexagon",
  "shape.circle": "Circle",
  // 参与方（sequence）
  "participant.actor": "Actor",
  "participant.participant": "Participant",
  "participant.boundary": "Boundary",
  "participant.control": "Control",
  "participant.entity": "Entity",
  "participant.database": "Database",
  "participant.collections": "Collections",
  "participant.queue": "Queue",
  // 导出
  "export.label": "Export",
  "export.downloadPng2x": "Download PNG (Retina 2x)",
  "export.downloadPng3x": "Download PNG (HD 3x)",
  "export.downloadSvg": "Download SVG",
  "export.copyPng": "Copy as PNG image",
  "export.failed": "Export failed",
  // 状态
  "status.rendering": "Rendering...",
  "status.ok": "Syntax valid",
  "status.init": "Initializing...",
  // 错误
  "error.syntax": "Mermaid syntax error",
  "error.fixHint": "Fix the code in the left textarea; it auto-saves when valid",
};

const zh: Dict = {
  "tool.select": "选择",
  "tool.connect": "连线",
  "tool.connectHint": "再次点击锁定，可连续连线",
  "tool.connectLockedHint": "已锁定连续连线（点击解锁）",
  "edit.undo": "撤销",
  "edit.redo": "重做",
  "menu.edit": "可视化编辑",
  "command.edit": "Mermaid 可视化编辑",
  "code.hide": "隐藏代码",
  "code.show": "显示代码",
  "code.title": "Mermaid 源码",
  "shape.addNode": "+ 节点...",
  "shape.addParticipant": "+ 参与者...",
  "shape.addClass": "+ 类",
  "shape.addEntity": "+ 实体",
  "shape.rect": "矩形",
  "shape.round": "圆角",
  "shape.diamond": "菱形",
  "shape.cylinder": "数据库",
  "shape.hexagon": "六边形",
  "shape.circle": "圆形",
  "participant.actor": "参与者",
  "participant.participant": "参与方",
  "participant.boundary": "边界",
  "participant.control": "控制",
  "participant.entity": "实体",
  "participant.database": "数据库",
  "participant.collections": "集合",
  "participant.queue": "队列",
  "export.label": "导出",
  "export.downloadPng2x": "下载 PNG（Retina 2x）",
  "export.downloadPng3x": "下载 PNG（高清 3x）",
  "export.downloadSvg": "下载 SVG 矢量",
  "export.copyPng": "复制为 PNG 图片",
  "export.failed": "导出失败",
  "status.rendering": "渲染中...",
  "status.ok": "语法正确",
  "status.init": "初始化...",
  "error.syntax": "Mermaid 语法错误",
  "error.fixHint": "在左侧代码区修正，语法正确后自动保存回思源",
};

/** 当前界面语言：思源 `<html lang="zh-CN">` / `"en_US"`。 */
export function currentLang(): string {
  return (document.documentElement.getAttribute("lang") || "").toLowerCase();
}

function dict(): Dict {
  return currentLang().startsWith("zh") ? zh : en;
}

/** 取国际化学文案；未命中返回 key 本身。 */
export function t(key: string): string {
  const d = dict();
  return d[key] ?? en[key] ?? key;
}