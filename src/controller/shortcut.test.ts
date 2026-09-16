// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  matchesShortcut,
  mermaidBlockFromNode,
  parseShortcut,
  registerShortcutTrigger,
  serializeShortcut,
} from "./shortcut";

/**
 * T10：快捷键触发（REQ-TRIGGER-002 / REQ-TRIGGER-003 / D6）。
 *
 * 冲突规避硬约束（D6 / spec）：`Alt+M`（思源 Electron 全局快捷键"隐藏/显示
 * 窗口"）、`Ctrl+M`（内联公式）、`Ctrl+Alt+M`（备注）、`Ctrl+Shift+M`（跳转
 * 父块上一个）均被思源占用，默认键 `Shift+Alt+M`；匹配须
 * `shiftKey && altKey && !ctrlKey && !metaKey && (key === 'M' || key === 'm')`
 * （键盘布局兼容大小写）。
 *
 * 光标判定：DOM selection 取 anchorNode，向上找 `.protyle-wysiwyg` 内的
 * code-block，复用 T9 `isMermaidCodeBlock`（data-subtype="mermaid" 或内含
 * `code.language-mermaid`）。
 */

/** 构造思源 wysiwyg 编辑器容器（`.protyle-wysiwyg`）。 */
function buildWysiwyg(): HTMLElement {
  const wysiwyg = document.createElement("div");
  wysiwyg.className = "protyle-wysiwyg";
  document.body.appendChild(wysiwyg);
  return wysiwyg;
}

/** 构造 Mermaid 代码块 DOM（data-subtype 语言标记形态）。 */
function buildMermaidBlock(wysiwyg: HTMLElement, blockId = "block-1"): HTMLElement {
  const block = document.createElement("div");
  block.dataset.type = "code-block";
  block.dataset.subtype = "mermaid";
  block.dataset.nodeId = blockId;
  const pre = document.createElement("pre");
  const code = document.createElement("code");
  code.textContent = "flowchart LR\n  A-->B";
  pre.appendChild(code);
  block.appendChild(pre);
  wysiwyg.appendChild(block);
  return block;
}

/** 构造普通段落块。 */
function buildParagraph(wysiwyg: HTMLElement, text = "hello"): HTMLElement {
  const p = document.createElement("div");
  p.dataset.type = "p";
  p.textContent = text;
  wysiwyg.appendChild(p);
  return p;
}

/** 将光标（selection anchor）放入元素首个文本节点。 */
function placeCursorAtFirstText(el: HTMLElement): void {
  const textNode = el.firstChild as Text | null;
  const selection = document.getSelection();
  selection!.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode ?? el, 0);
  range.collapse(true);
  selection!.addRange(range);
}

/** 构造与 KeyboardEvent 对齐的按键事件载荷。 */
function keyEvent(init: {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}): KeyboardEvent {
  return new KeyboardEvent("keydown", {
    key: init.key,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    bubbles: true,
    cancelable: true,
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("parseShortcut", () => {
  it("Shift+Alt+M → {shift, alt, 无 ctrl/meta, key:M}", () => {
    expect(parseShortcut("Shift+Alt+M")).toEqual({
      shiftKey: true,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      key: "M",
    });
  });

  it("修饰键大小写不敏感（shift/alt 小写同样解析），键位大小写保留", () => {
    expect(parseShortcut("shift+alt+m")).toEqual({
      shiftKey: true,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      key: "m",
    });
  });

  it("各被占用组合解析正确：Ctrl+Alt+M / Ctrl+Shift+M / Alt+M / 单键 M", () => {
    expect(parseShortcut("Ctrl+Alt+M")).toEqual({
      shiftKey: false,
      altKey: true,
      ctrlKey: true,
      metaKey: false,
      key: "M",
    });
    expect(parseShortcut("Ctrl+Shift+M")).toEqual({
      shiftKey: true,
      altKey: false,
      ctrlKey: true,
      metaKey: false,
      key: "M",
    });
    expect(parseShortcut("Alt+M")).toEqual({
      shiftKey: false,
      altKey: true,
      ctrlKey: false,
      metaKey: false,
      key: "M",
    });
    expect(parseShortcut("M")).toEqual({
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      key: "M",
    });
  });

  it("键位保留大小写（自定义 'Shift+Alt+m' → key 'm'）", () => {
    expect(parseShortcut("Shift+Alt+m").key).toBe("m");
  });
});

describe("serializeShortcut", () => {
  it("round-trip：parse → serialize 还原规范串", () => {
    expect(serializeShortcut(parseShortcut("Shift+Alt+M"))).toBe("Shift+Alt+M");
    expect(serializeShortcut(parseShortcut("Ctrl+Alt+M"))).toBe("Ctrl+Alt+M");
    expect(serializeShortcut(parseShortcut("Shift+Alt+m"))).toBe("Shift+Alt+m");
  });

  it("修饰键按 Ctrl+Shift+Alt+Meta 固定顺序输出", () => {
    expect(
      serializeShortcut({ shiftKey: true, altKey: true, ctrlKey: true, metaKey: true, key: "V" }),
    ).toBe("Ctrl+Shift+Alt+Meta+V");
  });
});

describe("matchesShortcut（冲突规避回归）", () => {
  const spec = parseShortcut("Shift+Alt+M");

  it("命中：Shift+Alt+M（key 大写 M）", () => {
    expect(matchesShortcut({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: false, key: "M" }, spec)).toBe(
      true,
    );
  });

  it("命中：key 小写 m（键盘布局兼容）", () => {
    expect(matchesShortcut({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: false, key: "m" }, spec)).toBe(
      true,
    );
  });

  it("不命中：Alt+M（思源 Electron 全局快捷键，禁止冲突）", () => {
    expect(matchesShortcut({ shiftKey: false, altKey: true, ctrlKey: false, metaKey: false, key: "M" }, spec)).toBe(
      false,
    );
  });

  it("不命中：Ctrl+M（思源内联公式）", () => {
    expect(matchesShortcut({ shiftKey: false, altKey: false, ctrlKey: true, metaKey: false, key: "M" }, spec)).toBe(
      false,
    );
  });

  it("不命中：Ctrl+Alt+M（思源备注）", () => {
    expect(matchesShortcut({ shiftKey: false, altKey: true, ctrlKey: true, metaKey: false, key: "M" }, spec)).toBe(
      false,
    );
  });

  it("不命中：Ctrl+Shift+M（思源跳转父块上一个）", () => {
    expect(matchesShortcut({ shiftKey: true, altKey: false, ctrlKey: true, metaKey: false, key: "M" }, spec)).toBe(
      false,
    );
  });

  it("不命中：Shift+Alt+Meta+M（多带 meta 也不匹配）", () => {
    expect(matchesShortcut({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: true, key: "M" }, spec)).toBe(
      false,
    );
  });

  it("不命中：Shift+Alt+N（键位不同）", () => {
    expect(matchesShortcut({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: false, key: "N" }, spec)).toBe(
      false,
    );
  });
});

describe("mermaidBlockFromNode", () => {
  it("anchor 在 Mermaid code-block 文本节点内 → 返回块元素", () => {
    const wysiwyg = buildWysiwyg();
    const block = buildMermaidBlock(wysiwyg, "block-9");
    placeCursorAtFirstText(block.querySelector("code")!);
    const selection = document.getSelection()!;
    expect(mermaidBlockFromNode(selection.anchorNode)).toBe(block);
  });

  it("anchor 在普通段落 → null", () => {
    const wysiwyg = buildWysiwyg();
    const p = buildParagraph(wysiwyg);
    placeCursorAtFirstText(p);
    expect(mermaidBlockFromNode(document.getSelection()!.anchorNode)).toBeNull();
  });

  it("anchor 在非 mermaid 代码块（javascript）→ null", () => {
    const wysiwyg = buildWysiwyg();
    const js = document.createElement("div");
    js.dataset.type = "code-block";
    js.dataset.subtype = "javascript";
    js.textContent = "const a = 1;";
    wysiwyg.appendChild(js);
    placeCursorAtFirstText(js);
    expect(mermaidBlockFromNode(document.getSelection()!.anchorNode)).toBeNull();
  });

  it("anchor 为 null / undefined → null", () => {
    expect(mermaidBlockFromNode(null)).toBeNull();
    expect(mermaidBlockFromNode(undefined)).toBeNull();
  });

  it("光标在 .protyle-wysiwyg 内普通位置，遇边界即停、不越过边界误判外层 Mermaid 块", () => {
    const wysiwyg = buildWysiwyg();
    const p = buildParagraph(wysiwyg);
    // 外层（wysiwyg 之外）放一个 Mermaid 块：向上走应先遇 protyle-wysiwyg 边界停止
    const outer = buildMermaidBlock(wysiwyg, "block-outer");
    document.body.appendChild(outer);
    placeCursorAtFirstText(p);
    expect(mermaidBlockFromNode(document.getSelection()!.anchorNode)).toBeNull();
  });
});

describe("registerShortcutTrigger", () => {
  const settingsOf = (shortcut: string) => ({ getEffectiveShortcut: () => shortcut });

  it("光标在 Mermaid 块内 + Shift+Alt+M → onTrigger 触发一次并阻止默认行为", () => {
    const wysiwyg = buildWysiwyg();
    placeCursorAtFirstText(buildMermaidBlock(wysiwyg).querySelector("code")!);
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({ settings: settingsOf("Shift+Alt+M"), onTrigger });

    const event = keyEvent({ key: "M", shiftKey: true, altKey: true });
    window.dispatchEvent(event);

    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    unregister();
  });

  it("光标不在 Mermaid 块内（普通段落）+ Shift+Alt+M → 不触发、零副作用（不阻止默认）", () => {
    const wysiwyg = buildWysiwyg();
    placeCursorAtFirstText(buildParagraph(wysiwyg));
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({ settings: settingsOf("Shift+Alt+M"), onTrigger });

    const event = keyEvent({ key: "M", shiftKey: true, altKey: true });
    window.dispatchEvent(event);

    expect(onTrigger).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    unregister();
  });

  it("光标在非 mermaid 代码块内 + Shift+Alt+M → 不触发", () => {
    const wysiwyg = buildWysiwyg();
    const js = document.createElement("div");
    js.dataset.type = "code-block";
    js.dataset.subtype = "javascript";
    js.textContent = "const a = 1;";
    wysiwyg.appendChild(js);
    placeCursorAtFirstText(js);
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({ settings: settingsOf("Shift+Alt+M"), onTrigger });

    window.dispatchEvent(keyEvent({ key: "M", shiftKey: true, altKey: true }));

    expect(onTrigger).not.toHaveBeenCalled();
    unregister();
  });

  it("光标在 Mermaid 块内但键不匹配（Alt+M / Ctrl+M / Ctrl+Alt+M / Ctrl+Shift+M）→ 不触发（防冲突回归）", () => {
    const wysiwyg = buildWysiwyg();
    placeCursorAtFirstText(buildMermaidBlock(wysiwyg).querySelector("code")!);
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({ settings: settingsOf("Shift+Alt+M"), onTrigger });

    window.dispatchEvent(keyEvent({ key: "M", altKey: true })); // Alt+M
    window.dispatchEvent(keyEvent({ key: "M", ctrlKey: true })); // Ctrl+M
    window.dispatchEvent(keyEvent({ key: "M", ctrlKey: true, altKey: true })); // Ctrl+Alt+M
    window.dispatchEvent(keyEvent({ key: "M", ctrlKey: true, shiftKey: true })); // Ctrl+Shift+M

    expect(onTrigger).not.toHaveBeenCalled();
    unregister();
  });

  it("改键后：新键命中、旧键失效（REQ-TRIGGER-003 场景）", () => {
    const wysiwyg = buildWysiwyg();
    placeCursorAtFirstText(buildMermaidBlock(wysiwyg).querySelector("code")!);
    let shortcut = "Shift+Alt+M";
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({
      settings: { getEffectiveShortcut: () => shortcut },
      onTrigger,
    });

    // 默认键触发
    window.dispatchEvent(keyEvent({ key: "M", shiftKey: true, altKey: true }));
    expect(onTrigger).toHaveBeenCalledTimes(1);

    // 用户改键为 Shift+Alt+V（设置保存后立即生效，无需重挂监听）
    shortcut = "Shift+Alt+V";
    window.dispatchEvent(keyEvent({ key: "M", shiftKey: true, altKey: true })); // 旧键失效
    expect(onTrigger).toHaveBeenCalledTimes(1);
    window.dispatchEvent(keyEvent({ key: "V", shiftKey: true, altKey: true })); // 新键生效
    expect(onTrigger).toHaveBeenCalledTimes(2);

    unregister();
  });

  it("卸载函数移除监听且幂等：卸载后再按快捷键不触发", () => {
    const wysiwyg = buildWysiwyg();
    placeCursorAtFirstText(buildMermaidBlock(wysiwyg).querySelector("code")!);
    const onTrigger = vi.fn();
    const unregister = registerShortcutTrigger({ settings: settingsOf("Shift+Alt+M"), onTrigger });

    unregister();
    unregister(); // 幂等

    window.dispatchEvent(keyEvent({ key: "M", shiftKey: true, altKey: true }));
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
