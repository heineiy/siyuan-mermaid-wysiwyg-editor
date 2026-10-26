// @vitest-environment happy-dom
/**
 * i18n.test.ts — 国际化切换与官方 i18n 词典兜底。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { t, setPluginI18n } from "./i18n";
import en from "../../i18n/en.json";
import zhCN from "../../i18n/zh_CN.json";

function setLang(lang: string) {
  document.documentElement.setAttribute("lang", lang);
}

describe("i18n", () => {
  beforeEach(() => {
    setLang("en_US");
    setPluginI18n(null);
  });

  it("英文环境返回英文案", () => {
    setLang("en_US");
    expect(t("tool.select")).toBe("Select");
    expect(t("export.label")).toBe("Export");
  });

  it("中文环境返回中文案", () => {
    setLang("zh-CN");
    expect(t("tool.select")).toBe("选择");
    expect(t("export.label")).toBe("导出");
  });

  it("未命中 key 返回 key 本身", () => {
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("形状/参与方 label 可切换", () => {
    setLang("zh-CN");
    expect(t("shape.rect")).toBe("矩形");
    expect(t("shape.cylinder")).toBe("数据库");
    setLang("en_US");
    expect(t("shape.rect")).toBe("Rectangle");
  });

  it("思源宿主提供文案时优先使用 plugin.i18n", () => {
    setLang("en_US");
    setPluginI18n({ "tool.select": "宿主选择" });
    expect(t("tool.select")).toBe("宿主选择");
    // 宿主未提供的 key 仍走内置词典
    expect(t("export.label")).toBe("Export");
  });

  it("清除宿主文案后回到内置词典", () => {
    setPluginI18n({ "tool.select": "宿主选择" });
    setPluginI18n(null);
    expect(t("tool.select")).toBe("Select");
  });

  it("中英词典 key 集合完全一致（防漂移）", () => {
    expect(Object.keys(zhCN).sort()).toEqual(Object.keys(en).sort());
  });
});
