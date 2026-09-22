// @vitest-environment happy-dom
/**
 * i18n.test.ts — 国际化切换。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { t } from "./i18n";

function setLang(lang: string) {
  document.documentElement.setAttribute("lang", lang);
}

describe("i18n", () => {
  beforeEach(() => setLang("en_US"));

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
});