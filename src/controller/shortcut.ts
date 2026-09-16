/**
 * 快捷键触发入口（REQ-TRIGGER-002 / REQ-TRIGGER-003 / D6）。
 *
 * 事实核实（2026-09-16，D6 + 思源官方默认快捷键表 cross-check）：
 * - 默认键 `Shift+Alt+M`：思源官方默认快捷键未占用；`Alt+M`（Electron 全局
 *   快捷键"隐藏/显示窗口"，不可查询不可修改）、`Ctrl+M`（内联公式）、
 *   `Ctrl+Alt+M`（备注）、`Ctrl+Shift+M`（跳转父块上一个）均被思源默认占用，
 *   因此匹配器须严格要求 `shiftKey && altKey && !ctrlKey && !metaKey`。
 * - 键盘布局兼容：按住 Shift 按物理 M 键，`event.key` 在部分布局下为 'M'、
 *   在部分布局下为 'm'，故键位比较大小写不敏感。
 *
 * 触发契约（REQ-TRIGGER-002）：
 * - 仅当光标位于 Mermaid 代码块内时触发（场景 1）；光标不在 Mermaid 块内
 *   零副作用——不触发、不阻止默认行为（场景 2）。
 * - 光标判定：DOM selection 取 anchorNode，沿祖先向上找 `.protyle-wysiwyg`
 *   内的 code-block，复用 T9 `isMermaidCodeBlock` 判定（data-subtype="mermaid"
 *   或内含 `code.language-mermaid`）。
 * - 配置即时生效：每次 keydown 从 settings.getEffectiveShortcut() 重新解析，
 *   save 后旧键立即失效、新键立即生效（REQ-TRIGGER-003），无需重挂监听。
 */
import { isMermaidCodeBlock } from "./trigger";

/** 解析后的快捷键形态（与 KeyboardEvent 修饰键字段一一对应）。 */
export interface ShortcutSpec {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  /** 触发键位（如 "M" / "m" / "V"），不含修饰键。 */
  key: string;
}

/** matchesShortcut 所需的事件载荷（KeyboardEvent 结构兼容，便于单测）。 */
export interface ShortcutKeyEvent {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  key: string;
}

/** 快捷键设置读取抽象：registerShortcutTrigger 只依赖"当前生效快捷键"。 */
export interface ShortcutSettings {
  /** 当前生效的快捷键字符串（如 "Shift+Alt+M"）；配置变更后立即返回新值。 */
  getEffectiveShortcut(): string;
}

/** registerShortcutTrigger 选项。 */
export interface ShortcutTriggerOptions {
  settings: ShortcutSettings;
  /** 快捷键命中且光标位于 Mermaid 块内时调用。 */
  onTrigger: () => void;
}

/**
 * 解析 "Shift+Alt+M" 形快捷键字符串为 ShortcutSpec。
 * 修饰键大小写不敏感（Shift/shift/SHIFT 均可）；键位保留原大小写
 * （"Shift+Alt+m" → key "m"）；只有修饰键无键位时 key 为空串。
 */
export function parseShortcut(raw: string): ShortcutSpec {
  const spec: ShortcutSpec = {
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    key: "",
  };
  for (const part of raw.split("+")) {
    const token = part.trim();
    if (token === "") {
      continue;
    }
    switch (token.toLowerCase()) {
      case "shift":
        spec.shiftKey = true;
        break;
      case "alt":
        spec.altKey = true;
        break;
      case "ctrl":
      case "control":
        spec.ctrlKey = true;
        break;
      case "meta":
      case "cmd":
      case "command":
        spec.metaKey = true;
        break;
      default:
        spec.key = token;
        break;
    }
  }
  return spec;
}

/**
 * 序列化 ShortcutSpec 为规范快捷键字符串（修饰键按 Ctrl+Shift+Alt+Meta
 * 固定顺序，便于设置项展示与回显）。
 */
export function serializeShortcut(spec: ShortcutSpec): string {
  const parts: string[] = [];
  if (spec.ctrlKey) {
    parts.push("Ctrl");
  }
  if (spec.shiftKey) {
    parts.push("Shift");
  }
  if (spec.altKey) {
    parts.push("Alt");
  }
  if (spec.metaKey) {
    parts.push("Meta");
  }
  parts.push(spec.key);
  return parts.join("+");
}

/**
 * 判定事件是否命中快捷键配置（纯函数）。
 * 键位大小写不敏感（键盘布局兼容）；修饰键必须与配置完全一致——
 * 多带/少带任一修饰键均不命中（冲突规避：Alt+M / Ctrl+M / Ctrl+Alt+M /
 * Ctrl+Shift+M 等被占用组合天然不匹配默认键 Shift+Alt+M）。
 */
export function matchesShortcut(event: ShortcutKeyEvent, spec: ShortcutSpec): boolean {
  return (
    event.shiftKey === spec.shiftKey &&
    event.altKey === spec.altKey &&
    event.ctrlKey === spec.ctrlKey &&
    event.metaKey === spec.metaKey &&
    event.key.toLowerCase() === spec.key.toLowerCase()
  );
}

/**
 * 从 selection anchorNode 出发，沿祖先向上找 `.protyle-wysiwyg` 内的 Mermaid
 * code-block（纯 DOM 判定，可单测）。
 *
 * 行走规则：从 anchorNode（元素节点自身或文本节点父链）开始逐级上溯，
 * 遇到 `.protyle-wysiwyg` 边界即停止（不越过编辑器容器向外误判）；沿途遇到
 * `data-type="code-block"` 则立即用 T9 `isMermaidCodeBlock` 判定并返回
 * （光标在代码块内，代码块是叶子容器，无需继续上溯）。
 */
export function mermaidBlockFromNode(anchorNode: Node | null | undefined): HTMLElement | null {
  if (!anchorNode) {
    return null;
  }
  let el: HTMLElement | null =
    anchorNode.nodeType === Node.ELEMENT_NODE ? (anchorNode as HTMLElement) : anchorNode.parentElement;
  while (el && !el.classList.contains("protyle-wysiwyg")) {
    if (el.dataset.type === "code-block") {
      return isMermaidCodeBlock(el) ? el : null;
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * 注册快捷键触发：监听 window keydown，当前配置的快捷键命中且光标位于
 * Mermaid 代码块内时调 onTrigger；否则零副作用（不阻止默认行为）。
 *
 * 配置即时生效：每次 keydown 从 settings.getEffectiveShortcut() 重新解析
 * （save 后旧键失效、新键生效，REQ-TRIGGER-003）。
 * 返回卸载函数（移除监听，幂等）。
 */
export function registerShortcutTrigger(options: ShortcutTriggerOptions): () => void {
  const { settings, onTrigger } = options;

  const onKeyDown = (event: KeyboardEvent) => {
    // 每次 keydown 从 settings 解析当前生效键：设置保存后下一次按键即按新键匹配。
    const spec = parseShortcut(settings.getEffectiveShortcut());
    if (!matchesShortcut(event, spec)) {
      return;
    }
    // 光标判定（REQ-TRIGGER-002 场景 1/2）：不在 Mermaid 块内不触发、
    // 不阻止默认行为，零副作用。
    const selection = document.getSelection();
    if (!mermaidBlockFromNode(selection?.anchorNode ?? null)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onTrigger();
  };

  window.addEventListener("keydown", onKeyDown);

  let unregistered = false;
  return () => {
    if (unregistered) {
      return;
    }
    unregistered = true;
    window.removeEventListener("keydown", onKeyDown);
  };
}
