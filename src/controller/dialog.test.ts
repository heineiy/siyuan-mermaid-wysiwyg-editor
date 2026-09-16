// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openEditorDialog } from "./dialog";

/**
 * T8：Dialog 生命周期与画布挂载（REQ-TRIGGER-001 / D2）。
 *
 * 浏览器环境外不可用（siyuan Dialog 依赖真实 DOM/思源环境），故以
 * vi.mock("siyuan") + happy-dom 模拟思源 Dialog，Mock 行为与思源真实实现对齐
 * （npm 事实核实 2026-09-16：SiYuan 官方 dialog 实现 `destroy()` 先移除 DOM
 * 再回调 destroyCallback；关闭按钮/遮罩内部即调用 destroy()）：
 * - 构造：解析 content HTML 注入容器 div，并挂载进 document（对应思源将
 *   dialog 元素 append 到 body，构造即打开、无需显式 open）；
 * - destroy：调用 destroyCallback 并移除自身 DOM。
 */

const dialogState = vi.hoisted(() => {
  interface MockOptions {
    title?: string;
    width?: string;
    height?: string;
    content: string;
    destroyCallback?: () => void;
  }

  const instances: MockDialog[] = [];

  class MockDialog {
    static instances = instances;

    /** 模拟思源 Dialog.destroy()：触发 destroyCallback 并从 DOM 移除。 */
    destroy = vi.fn((..._args: unknown[]) => {
      this.options.destroyCallback?.();
      this.element.remove();
    });

    constructor(public options: MockOptions) {
      this.element = document.createElement("div");
      this.element.className = "b3-dialog";
      this.element.innerHTML = options.content;
      document.body.appendChild(this.element);
      instances.push(this);
    }

    bindInput(): void {
      /* mock：无操作 */
    }

    // ---- 类型占位（对齐 siyuan.d.ts 的 public 字段） ----
    editors: Record<string, unknown> = {};
    data: unknown = null;
    element!: HTMLElement;
  }

  return { MockDialog };
});

vi.mock("siyuan", () => ({ Dialog: dialogState.MockDialog }));

beforeEach(() => {
  dialogState.MockDialog.instances.length = 0;
  document.body.innerHTML = "";
});

describe("openEditorDialog", () => {
  it("open 创建思源 Dialog 并在内容区注入画布容器", () => {
    const handle = openEditorDialog({ title: "Mermaid 可视化编辑" });

    // 创建了一个 Dialog 实例，title / content 按选项透传
    expect(dialogState.MockDialog.instances).toHaveLength(1);
    const instance = dialogState.MockDialog.instances[0]!;
    expect(instance.options.title).toBe("Mermaid 可视化编辑");
    expect(instance.options.content).toContain("mermaid-wysiwyg-canvas-");

    // 容器以带唯一 id 的 div 注入，并可通过 getContainer 取得真实 DOM 节点
    const container = handle.getContainer();
    expect(container).not.toBeNull();
    expect(container!.id).toBe("mermaid-wysiwyg-canvas-1");
    expect(document.getElementById("mermaid-wysiwyg-canvas-1")).toBe(container);
  });

  it("close 触发 onDestroy（后端销毁钩子）并清理容器 DOM", () => {
    const onDestroy = vi.fn();
    const handle = openEditorDialog({ onDestroy });
    const container = handle.getContainer()!;
    expect(document.body.contains(container)).toBe(true);

    handle.close();

    expect(onDestroy).toHaveBeenCalledTimes(1);
    // DOM 清理：容器随 Dialog 一并移除，getContainer 不再返回节点
    expect(document.body.contains(container)).toBe(false);
    expect(handle.getContainer()).toBeNull();
  });

  it("思源销毁路径（用户点关闭触发 destroy）同样执行 onDestroy，且幂等", () => {
    const onDestroy = vi.fn();
    const handle = openEditorDialog({ onDestroy });

    // 用户点关闭按钮/遮罩：思源内部调用 Dialog.destroy() → destroyCallback
    const instance = dialogState.MockDialog.instances[0]!;
    instance.destroy();
    instance.destroy();
    handle.close();

    expect(onDestroy).toHaveBeenCalledTimes(1);
    expect(handle.getContainer()).toBeNull();
  });

  it("多次 close 只触发一次 onDestroy（幂等）", () => {
    const onDestroy = vi.fn();
    const handle = openEditorDialog({ onDestroy });

    handle.close();
    handle.close();
    handle.close();

    expect(onDestroy).toHaveBeenCalledTimes(1);
  });

  it("关闭后再 open 创建全新 Dialog，旧实例/容器/钩子不残留", () => {
    const onDestroyA = vi.fn();
    const handleA = openEditorDialog({ onDestroy: onDestroyA });
    const containerA = handleA.getContainer()!;
    const dialogA = handleA.dialog;

    handleA.close();
    expect(onDestroyA).toHaveBeenCalledTimes(1);
    expect(document.body.contains(containerA)).toBe(false);

    // 再次打开：独立新实例、新容器 id，旧容器不可见
    const onDestroyB = vi.fn();
    const handleB = openEditorDialog({ onDestroy: onDestroyB });

    expect(dialogState.MockDialog.instances).toHaveLength(2);
    expect(handleB.dialog).not.toBe(dialogA);
    const containerB = handleB.getContainer()!;
    expect(containerB.id).not.toBe(containerA.id);
    expect(containerB).not.toBe(containerA);
    expect(document.getElementById(containerA.id)).toBeNull();
    expect(handleA.getContainer()).toBeNull();

    // 新旧会话互不干扰：各自关闭只触发各自的 onDestroy
    handleB.close();
    expect(onDestroyB).toHaveBeenCalledTimes(1);
    expect(onDestroyA).toHaveBeenCalledTimes(1);
    expect(document.getElementById(containerB.id)).toBeNull();
  });
});
