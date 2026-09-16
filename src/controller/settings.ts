/**
 * 快捷键设置读写（REQ-TRIGGER-003 / D6）。
 *
 * 事实核实（2026-09-16，siyuan@1.2.7 类型定义 siyuan.d.ts:698-700 + 官方
 * 插件开发文档）：
 * - `Plugin.loadData(storageName: string): Promise<any>` /
 *   `Plugin.saveData(storageName: string, content: any): Promise<any | IWebSocketData>`，
 *   官方约定以相对文件名（如 "config.json"）作为 storageName，数据落在插件
 *   数据目录，跨端同步随思源数据目录走。
 * - 插件设置 UI 标准做法：`this.setting = new Setting({ confirmCallback })` +
 *   `setting.addItem({ title, description, actionElement })`（siyuan.d.ts:796-813，
 *   官方 plugin-sample 模式）；setting.html 为旧式静态页方案，本期不采用。
 *
 * 存储形态（"default | custom string"）：`{ mode: "default" }`（未自定义，
 * 使用默认键）| `{ mode: "custom", value: "Shift+Alt+V" }`（用户自定义）。
 * storage 抽象注入（对齐 siyuan Plugin.loadData/saveData 签名）便于单测；
 * 生产缺省直接传 Plugin 实例（结构兼容）。
 */
import { parseShortcut } from "./shortcut";

/** 默认快捷键（思源官方默认未占用，D6 核实；Alt+M / Ctrl+M / Ctrl+Alt+M / Ctrl+Shift+M 均被占用）。 */
export const DEFAULT_SHORTCUT = "Shift+Alt+M";

/** 快捷键配置存储文件名（plugin.saveData/loadData 的相对路径）。 */
export const SETTINGS_FILE = "config.json";

/** 快捷键设置存储形态：default（未自定义）| custom（用户自定义字符串）。 */
export type ShortcutSetting = { mode: "default" } | { mode: "custom"; value: string };

/** storage 抽象：对齐 siyuan Plugin.loadData/saveData 签名（siyuan.d.ts:698-700）。 */
export interface ShortcutStorage {
  loadData(storageName: string): Promise<unknown>;
  saveData(storageName: string, content: unknown): Promise<unknown>;
}

/**
 * 读取快捷键设置。无持久化数据或存储内容非法（非对象 / 缺 mode /
 * 未知 mode / custom 值为空）时回落 default。
 */
export async function loadShortcutSetting(storage: ShortcutStorage): Promise<ShortcutSetting> {
  const data = await storage.loadData(SETTINGS_FILE);
  if (data && typeof data === "object" && (data as { mode?: unknown }).mode === "custom") {
    const value = (data as { value?: unknown }).value;
    if (typeof value === "string" && value.trim() !== "") {
      return { mode: "custom", value };
    }
    return { mode: "default" };
  }
  if (data && typeof data === "object" && (data as { mode?: unknown }).mode === "default") {
    return { mode: "default" };
  }
  return { mode: "default" };
}

/** 保存快捷键设置（持久化到 plugin.saveData）。 */
export async function saveShortcutSetting(storage: ShortcutStorage, setting: ShortcutSetting): Promise<void> {
  await storage.saveData(SETTINGS_FILE, setting);
}

/**
 * 解析设置为当前生效快捷键字符串：
 * - default → DEFAULT_SHORTCUT；
 * - custom → 原值返回；值非法（空 / 无键位部分）时回落默认。
 */
export function resolveShortcut(setting: ShortcutSetting): string {
  if (setting.mode === "custom") {
    const spec = parseShortcut(setting.value);
    if (spec.key !== "") {
      return setting.value;
    }
  }
  return DEFAULT_SHORTCUT;
}
