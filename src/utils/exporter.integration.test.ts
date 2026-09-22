// @vitest-environment happy-dom
/**
 * exporter.integration.test.ts — 真实 mermaid.render 复现 flowchart 的
 * insertLookDefs getAttribute null。已确认用户在 Chromium(思源)同样稳定复现，
 * 故 happy-dom 的复现是有效的（非环境伪象），用于定位根因与回归。
 */
import { describe, it, expect } from "vitest";
import mermaid from "mermaid";
import { Exporter } from "./exporter";

describe("Exporter × 真实 mermaid（复现 insertLookDefs getAttribute）", () => {
  it("exportSVG 真实渲染 flowchart → 返回合法 SVG Blob", async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    const exp = new Exporter({
      getCode: () => "flowchart LR\n  A[Start] --> B[End]",
      mermaid: mermaid as any,
    });
    const blob = await exp.exportSVG();
    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).toContain("<svg");
  }, 30000);

  it("对照：直接 mermaid.render 用字母前缀 id → 成功（定位 id 前缀是否为诱因）", async () => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "loose" });
    const c = document.createElement("div");
    c.style.position = "fixed";
    c.style.left = "-9999px";
    document.body.appendChild(c);
    try {
      const { svg } = await mermaid.render("id-abc-123", "flowchart LR\nA-->B", c);
      expect(svg).toContain("<svg");
    } finally {
      c.remove();
    }
  }, 30000);
});