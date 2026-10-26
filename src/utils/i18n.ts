/**
 * i18n.ts — 国际化。遵循思源插件官方 `i18n/` 目录约定。
 *
 * 文案维护在仓库根目录 `i18n/en.json`、`i18n/zh_CN.json`，构建时由 vite 复制到
 * `dist/i18n/`，思源加载插件时会按界面语言自动填充 `plugin.i18n`。
 *
 * 取词优先级：
 *   1) `plugin.i18n[key]`（思源官方加载的当前语言文案）
 *   2) 静态 import 的内置词典（模块初始化 / 插件热重载等宿主文案尚未就绪时兜底）
 *   3) 英文内置词典
 *   4) key 本身
 *
 * 内置词典必须用**静态 import**：思源插件产物是 CJS，动态 import 会失败；
 * 静态 import 由 rollup 内联到单文件入口。
 */
import enBundled from "../../i18n/en.json";
import zhBundled from "../../i18n/zh_CN.json";

type Dict = Record<string, string>;

const en: Dict = enBundled as Dict;
const zh: Dict = zhBundled as Dict;

/** 思源宿主注入的当前语言词典（来自 plugin.i18n）。 */
let pluginDict: Dict | null = null;

/**
 * 注入思源宿主文案表；传 null 清除（测试/热重载场景）。
 */
export function setPluginI18n(dict: Record<string, string> | null | undefined): void {
  pluginDict = dict ?? null;
}

/** 当前界面语言：思源 `<html lang="zh-CN">` / `"en_US"`；无 DOM 环境（Node 测试/构建）返回空串。 */
export function currentLang(): string {
  if (typeof document === "undefined") return "";
  return (document.documentElement.getAttribute("lang") || "").toLowerCase();
}

function dict(): Dict {
  return currentLang().startsWith("zh") ? zh : en;
}

/** 取国际化学文案；未命中返回 key 本身。 */
export function t(key: string): string {
  const host = pluginDict?.[key];
  if (typeof host === "string" && host) return host;
  const d = dict();
  return d[key] ?? en[key] ?? key;
}
