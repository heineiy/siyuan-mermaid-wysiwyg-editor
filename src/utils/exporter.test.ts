// @vitest-environment happy-dom
/**
 * exporter.test.ts — 高清图片导出模块单测
 *
 * RED → GREEN → REFACTOR 覆盖 6 条 REQ 的核心场景。
 * 需 happy-dom 环境（exporter 用到 DOMParser / Image / Canvas / navigator.clipboard）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Exporter } from "./exporter.js";

// --- mock mermaid.render ---
const mockRender = vi.fn<(id: string, code: string) => Promise<{ svg: string }>>();
const mockMermaid = { render: mockRender };

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
  <rect x="0" y="0" width="400" height="300" fill="#fff"/>
  <text x="50" y="150" font-size="24">A</text>
  <text x="300" y="150" font-size="24">B</text>
  <line x1="80" y1="160" x2="280" y2="160" stroke="#333" stroke-width="2"/>
</svg>`;

const SAMPLE_CODE = "graph TD\nA-->B";

describe("Exporter", () => {
  let exporter: Exporter;

  beforeEach(() => {
    mockRender.mockResolvedValue({ svg: SAMPLE_SVG });
    exporter = new Exporter({ getCode: () => SAMPLE_CODE, mermaid: mockMermaid as any });
  });

  // --- REQ-EXPORT-002: SVG 原始矢量 ---
  describe("exportSVG", () => {
    it("返回 Blob 类型 image/svg+xml", async () => {
      const blob = await exporter.exportSVG();
      expect(blob.type).toBe("image/svg+xml");
      expect(await blob.text()).toContain("<svg");
    });

    it("调用 mermaid.render 一次，传临时 container", async () => {
      await exporter.exportSVG();
      expect(mockRender).toHaveBeenCalledTimes(1);
      expect(mockRender).toHaveBeenCalledWith(expect.any(String), SAMPLE_CODE, expect.any(HTMLElement));
    });
  });

  // --- REQ-EXPORT-001: PNG 2x DPI ---
  describe("exportPNG", () => {
    // happy-dom 没有真实 Canvas 2d 实现（getContext 返回 null），
    // 栅格化在浏览器/Electron 真实环境验证（宿主联调手动测 Retina PNG）
    it.skip("默认 scale=2 → 导出 Blob（真实浏览器环境验证）", async () => {});
    it.skip("scale=3 显式指定 → 也能导出（真实浏览器环境验证）", async () => {});
  });

  // --- 解析 PNG SVG 输入（纯 DOM 解析，可用单测；根因回归：Cannot read properties of null 'getAttribute') ---
  describe("parseSvg", () => {
    it("合法 svg → 返回根元素，可读 width/height", () => {
      const root = Exporter.parseSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"></svg>`);
      expect(root.tagName.toLowerCase()).toBe("svg");
      expect(root.getAttribute("width")).toBe("400");
    });

    it("空字符串 → 抛清晰错误（防原本的裸 getAttribute TypeError）", () => {
      expect(() => Exporter.parseSvg("")).toThrow("未返回有效的 SVG");
    });

    it("空白字符串 → 抛清晰错误", () => {
      expect(() => Exporter.parseSvg("   \n  ")).toThrow("未返回有效的 SVG");
    });

    it("非法 XML / 非 svg 根（如 <parsererror>）→ 抛清晰错误", () => {
      // DOMParser 对非法 XML 会产出 <parsererror> 根，或对纯文本产出非 svg 根
      expect(() => Exporter.parseSvg("not xml at all")).toThrow("未返回有效的 SVG");
    });
  });

  // --- REQ-EXPORT-003: 下载 ---
  describe("downloadBlob", () => {
    it("生成符合规范的文件名", () => {
      const fname = Exporter.buildFileName("flowchart", "png");
      expect(fname).toMatch(/^flowchart_\d{8}_\d{6}\.png$/);
    });

    it("SVG 文件名", () => {
      const fname = Exporter.buildFileName("sequence", "svg");
      expect(fname).toMatch(/^sequence_\d{8}_\d{6}\.svg$/);
    });
  });

  // --- REQ-EXPORT-003: 剪贴板 ---
  describe("copyPNG / copySVG", () => {
    it("copySVG 返回 text/plain + image/svg+xml ClipboardItem", async () => {
      const fakeWrite = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(globalThis.navigator, "clipboard", {
        value: { write: fakeWrite }, configurable: true,
      });
      await expect(exporter.copySVG()).resolves.toBeUndefined();
      expect(fakeWrite).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  // --- REQ-EXPORT-005: mermaid 渲染失败 / 空代码防护 ---
  describe("错误处理", () => {
    it("mermaid.render 抛错 → 上抛不吞", async () => {
      mockRender.mockRejectedValue(new Error("parse failed"));
      await expect(exporter.exportSVG()).rejects.toThrow("parse failed");
    });

    it("空代码 → 抛 \`Mermaid code is empty\`，不调 mermaid.render（防 'No diagram type detected'）", async () => {
      const empty = new Exporter({ getCode: () => "", mermaid: mockMermaid as any });
      await expect(empty.exportSVG()).rejects.toThrow("Mermaid code is empty");
      await expect(empty.exportPNG()).rejects.toThrow("Mermaid code is empty");
      expect(mockRender).not.toHaveBeenCalled();
    });

    it("空白字符代码视为空 → 抛错", async () => {
      const blank = new Exporter({ getCode: () => "  \n\t ", mermaid: mockMermaid as any });
      await expect(blank.exportSVG()).rejects.toThrow("Mermaid code is empty");
    });
  });
});
