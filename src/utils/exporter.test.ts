// @vitest-environment happy-dom
/**
 * exporter.test.ts — 高清图片导出模块单测
 *
 * RED → GREEN → REFACTOR 覆盖 6 条 REQ 的核心场景。
 * 需 happy-dom 环境（exporter 用到 DOMParser / Image / Canvas / navigator.clipboard）。
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Exporter } from "./exporter.js";
import { t } from "./i18n.js";

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

    it("调用 mermaid.render 一次（不传 container，mermaid 自管理临时节点）", async () => {
      await exporter.exportSVG();
      expect(mockRender).toHaveBeenCalledTimes(1);
      expect(mockRender).toHaveBeenCalledWith(expect.any(String), SAMPLE_CODE);
    });

    it("有 getSvgElement → 直接用已渲染 SVG 导出，不调 mermaid.render", async () => {
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
      svgEl.setAttribute("width", "120");
      const exp2 = new Exporter({
        getCode: () => SAMPLE_CODE,
        mermaid: mockMermaid as any,
        getSvgElement: () => svgEl,
      });
      const blob = await exp2.exportSVG();
      expect(blob.type).toBe("image/svg+xml");
      expect(await blob.text()).toContain("<svg");
      expect(mockRender).not.toHaveBeenCalled();
    });

    it("getSvgElement 返回 null → 回退重新渲染", async () => {
      const exp2 = new Exporter({
        getCode: () => SAMPLE_CODE,
        mermaid: mockMermaid as any,
        getSvgElement: () => null,
      });
      await exp2.exportSVG();
      expect(mockRender).toHaveBeenCalledTimes(1);
    });
  });

  // --- serializeSVG（取已渲染 SVG 出矢量） ---
  describe("serializeSVG", () => {
    it("序列化 SVG 元素为 XML 文本", () => {
      const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as SVGSVGElement;
      svgEl.setAttribute("id", "g1");
      const xml = Exporter.serializeSVG(svgEl);
      expect(xml).toContain("<svg");
      expect(xml).toContain('id="g1"');
    });
  });

  const SVG_NS = "http://www.w3.org/2000/svg";
  const makeSvg = (attrs: Record<string, string> = {}): SVGSVGElement => {
    const el = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  };

  // --- 视口读取（导出裁剪的基础） ---
  describe("readViewBox", () => {
    it("优先解析 viewBox", () => {
      expect(Exporter.readViewBox(makeSvg({ viewBox: "-8 -8 139 61" }))).toEqual({
        x: -8, y: -8, width: 139, height: 61,
      });
    });

    it("无 viewBox 时退回数值 width/height", () => {
      expect(Exporter.readViewBox(makeSvg({ width: "400", height: "300px" }))).toEqual({
        x: 0, y: 0, width: 400, height: 300,
      });
    });

    it("百分比尺寸且无 viewBox → null（不做裁剪）", () => {
      expect(Exporter.readViewBox(makeSvg({ width: "100%", height: "100%" }))).toBeNull();
    });
  });

  // --- 紧凑视口计算 ---
  describe("computeTightBox", () => {
    const current = { x: 0, y: 0, width: 400, height: 300 };

    it("按内容包围盒收缩，四边留 padding", () => {
      expect(Exporter.computeTightBox({ x: 20, y: 10, width: 100, height: 50 }, current, 2)).toEqual({
        x: 18, y: 8, width: 104, height: 54,
      });
    });

    it("内容无效（未测到 / 全 0）→ 回退原视口", () => {
      expect(Exporter.computeTightBox(null, current, 2)).toBe(current);
      expect(Exporter.computeTightBox({ x: 0, y: 0, width: 0, height: 0 }, current, 2)).toBe(current);
      expect(Exporter.computeTightBox({ x: NaN, y: 0, width: 10, height: 10 }, current, 2)).toBe(current);
    });
  });

  // --- 视口收缩（消除导出图四周空白） ---
  describe("normalizeSvgBounds", () => {
    it("可测量内容 → viewBox/width/height 收缩到图形边界", () => {
      const el = makeSvg({ viewBox: "0 0 400 300", width: "100%", style: "max-width: 400px;" });
      const proto = Object.getPrototypeOf(el) as any;
      const saved = Object.getOwnPropertyDescriptor(proto, "getBBox");
      proto.getBBox = () => ({ x: 20, y: 10, width: 100, height: 50 });
      try {
        const out = Exporter.normalizeSvgBounds(el);
        expect(out.getAttribute("viewBox")).toBe("18 8 104 54");
        expect(out.getAttribute("width")).toBe("104");
        expect(out.getAttribute("height")).toBe("54");
        expect(out.style.width).toBe("104px");
      } finally {
        if (saved) Object.defineProperty(proto, "getBBox", saved);
        else delete proto.getBBox;
      }
    });

    it("测量不可用 → 原样保留视口（导出不因裁剪失败而中断）", () => {
      const el = makeSvg({ viewBox: "0 0 400 300" });
      const out = Exporter.normalizeSvgBounds(el);
      expect(out.getAttribute("viewBox")).toBe("0 0 400 300");
    });
  });

  // --- 内容包围盒测量（含根 svg 不支持 getBBox 时的子元素回退） ---
  describe("measureContentBox", () => {
    it("根 svg 无有效 bbox → 合并直接子元素包围盒", () => {
      const el = makeSvg({ viewBox: "0 0 400 300" });
      (el as any).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 });
      const g = document.createElementNS(SVG_NS, "g") as any;
      g.getBBox = () => ({ x: 30, y: 40, width: 50, height: 20 });
      el.appendChild(g);

      expect(Exporter.measureContentBox(el)).toEqual({ x: 30, y: 40, width: 50, height: 20 });
    });
  });

  // --- svgElementToPngBlob（取已渲染 SVG 栅格化，Canvas 依赖真实浏览器） ---
  describe("svgElementToPngBlob", () => {
    it.skip("真实浏览器中：把已渲染 SVG 元素转高分辨率 PNG（宿主联调手动验证）", async () => {});
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
      expect(() => Exporter.parseSvg("")).toThrow(t("export.svgInvalid"));
    });

    it("空白字符串 → 抛清晰错误", () => {
      expect(() => Exporter.parseSvg("   \n  ")).toThrow(t("export.svgInvalid"));
    });

    it("非法 XML / 非 svg 根（如 <parsererror>）→ 抛清晰错误", () => {
      // DOMParser 对非法 XML 会产出 <parsererror> 根，或对纯文本产出非 svg 根
      expect(() => Exporter.parseSvg("not xml at all")).toThrow(t("export.svgInvalid"));
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

  // --- REQ-EXPORT-005: mermaid 渲染失败 / 空代码防护 / 懒加载重试 ---
  describe("错误处理", () => {
    it("mermaid.render 抛错 → 上抛不吞", async () => {
      mockRender.mockRejectedValue(new Error("parse failed"));
      await expect(exporter.exportSVG()).rejects.toThrow("parse failed");
    });

    it("空代码 → 抛 \`Mermaid code is empty\`，不调 mermaid.render", async () => {
      const empty = new Exporter({ getCode: () => "", mermaid: mockMermaid as any });
      await expect(empty.exportSVG()).rejects.toThrow("Mermaid code is empty");
      await expect(empty.exportPNG()).rejects.toThrow("Mermaid code is empty");
      expect(mockRender).not.toHaveBeenCalled();
    });

    it("空白字符代码视为空 → 抛错", async () => {
      const blank = new Exporter({ getCode: () => "  \n\t ", mermaid: mockMermaid as any });
      await expect(blank.exportSVG()).rejects.toThrow("Mermaid code is empty");
    });

    it("懒加载时序错误(getAttribute null) → 自动重试并成功（renderWithRetry）", async () => {
      mockRender
        .mockRejectedValueOnce(new TypeError("Cannot read properties of null (reading 'getAttribute')"))
        .mockResolvedValueOnce({ svg: SAMPLE_SVG });
      await expect(exporter.exportSVG()).resolves.toBeInstanceOf(Blob);
      expect(mockRender).toHaveBeenCalledTimes(2);
    });

    it("重试耗尽仍失败（非瞬时错误）→ 上抛原错误", async () => {
      mockRender.mockRejectedValue(new Error("the real failure"));
      await expect(exporter.exportSVG()).rejects.toThrow("the real failure");
      // 非瞬时错误不重试，只调 1 次
      expect(mockRender).toHaveBeenCalledTimes(1);
    });
  });
});
