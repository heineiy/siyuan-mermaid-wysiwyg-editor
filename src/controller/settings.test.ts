// 默认 node 环境（vite.config.mts test.environment = "node"）：settings 为纯逻辑，
// 不依赖 DOM。
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SHORTCUT,
  SETTINGS_FILE,
  loadShortcutSetting,
  resolveShortcut,
  saveShortcutSetting,
} from "./settings";

/**
 * T10：快捷键设置读写（REQ-TRIGGER-003 / D6）。
 *
 * 事实核实（2026-09-16，siyuan@1.2.7 类型定义 siyuan.d.ts:698-700）：
 * - `Plugin.loadData(storageName: string): Promise<any>` /
 *   `Plugin.saveData(storageName: string, content: any): Promise<any | IWebSocketData>`，
 *   官方文档约定以 `config.json` 之类的相对文件名作为 storageName。
 * - 存储形态：`{ mode: "default" }`（未自定义）| `{ mode: "custom", value }`
 *   （用户自定义快捷键字符串），即任务要求的 "default | custom string" 两种形态。
 *
 * storage 抽象注入：本测试用内存假 storage（对齐 siyuan Plugin.loadData/saveData
 * 签名）验证读写与回落逻辑，不依赖真实思源宿主。
 */

/** 内存版 storage 假实现：对齐 siyuan Plugin.loadData/saveData 签名。 */
function createMemoryStorage(initial?: unknown) {
  let data: unknown = initial;
  const saved: unknown[] = [];
  return {
    loadData: vi.fn(async (_name: string) => data),
    saveData: vi.fn(async (_name: string, content: unknown) => {
      data = content;
      saved.push(content);
      return content;
    }),
    saved,
    current: () => data,
  };
}

describe("loadShortcutSetting", () => {
  it("从未保存（loadData 无数据）→ 回落 default", async () => {
    const storage = createMemoryStorage(undefined);
    const setting = await loadShortcutSetting(storage);
    expect(setting).toEqual({ mode: "default" });
    expect(storage.loadData).toHaveBeenCalledWith(SETTINGS_FILE);
  });

  it("已保存 custom → 原样读回", async () => {
    const storage = createMemoryStorage({ mode: "custom", value: "Shift+Alt+V" });
    expect(await loadShortcutSetting(storage)).toEqual({ mode: "custom", value: "Shift+Alt+V" });
  });

  it("已保存 default → 读回 default", async () => {
    const storage = createMemoryStorage({ mode: "default" });
    expect(await loadShortcutSetting(storage)).toEqual({ mode: "default" });
  });

  it("存储内容非法（null / 字符串 / 缺 mode / 未知 mode / 空 value）→ 回落 default", async () => {
    expect(await loadShortcutSetting(createMemoryStorage(null))).toEqual({ mode: "default" });
    expect(await loadShortcutSetting(createMemoryStorage("garbage"))).toEqual({ mode: "default" });
    expect(await loadShortcutSetting(createMemoryStorage({ value: "Shift+Alt+V" }))).toEqual({ mode: "default" });
    expect(await loadShortcutSetting(createMemoryStorage({ mode: "unknown" }))).toEqual({ mode: "default" });
    expect(await loadShortcutSetting(createMemoryStorage({ mode: "custom", value: "  " }))).toEqual({ mode: "default" });
  });
});

describe("saveShortcutSetting", () => {
  it("custom → saveData 持久化为 custom 形态", async () => {
    const storage = createMemoryStorage();
    await saveShortcutSetting(storage, { mode: "custom", value: "Shift+Alt+V" });
    expect(storage.saveData).toHaveBeenCalledWith(SETTINGS_FILE, { mode: "custom", value: "Shift+Alt+V" });
    expect(storage.saved).toEqual([{ mode: "custom", value: "Shift+Alt+V" }]);
    // 保存后可读回（持久化闭环）
    expect(storage.current()).toEqual({ mode: "custom", value: "Shift+Alt+V" });
  });

  it("default → saveData 持久化为 default 形态", async () => {
    const storage = createMemoryStorage();
    await saveShortcutSetting(storage, { mode: "default" });
    expect(storage.saved).toEqual([{ mode: "default" }]);
  });
});

describe("resolveShortcut", () => {
  it("default → DEFAULT_SHORTCUT（Shift+Alt+M）", () => {
    expect(DEFAULT_SHORTCUT).toBe("Shift+Alt+M");
    expect(resolveShortcut({ mode: "default" })).toBe(DEFAULT_SHORTCUT);
  });

  it("custom 合法 → 返回自定义值", () => {
    expect(resolveShortcut({ mode: "custom", value: "Shift+Alt+V" })).toBe("Shift+Alt+V");
  });

  it("custom 非法（空 / 只有修饰键无键位）→ 回落默认", () => {
    expect(resolveShortcut({ mode: "custom", value: "" })).toBe(DEFAULT_SHORTCUT);
    expect(resolveShortcut({ mode: "custom", value: "Shift+Alt" })).toBe(DEFAULT_SHORTCUT);
  });
});
