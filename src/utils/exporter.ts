/**
 * exporter.ts — Mermaid 高清图片导出模块
 *
 * 纯浏览器 API，零新依赖。支持：
 *   - SVG 原始矢量导出（mermaid.render 的 svgString）
 *   - PNG 高清栅格化（SVG → Image → Canvas → toBlob, scale 2x/3x）
 *   - 文件下载（downloadBlob: createObjectURL + a[download]）
 *   - 剪贴板复制（Clipboard API + execCommand 降级）
 *
 * 设计决策：每次导出走独立 mermaid.render（不依赖 Visimer canvasView DOM）。
 * 详见 change docs/export-highres/design.md Decision 1。
 */

export interface ExporterOptions {
  /** 获取当前 Mermaid 代码（可来自 Visimer editor 或 textarea） */
  getCode: () => string;
  /** mermaid 实例（带 render 方法） */
  mermaid: { render: (id: string, code: string) => Promise<{ svg: string }> };
}

const EXPORTER_ID_PREFIX = "__exporter_" + Math.random().toString(36).slice(2, 8);

/** 工具：自动生成唯一 id（避免多次 render 冲突） */
const nextRenderId = () => EXPORTER_ID_PREFIX + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);

export class Exporter {
  private readonly opts: ExporterOptions;

  constructor(opts: ExporterOptions) {
    this.opts = opts;
  }

  // ---------- 核心导出 ----------

  /**
   * 导出 SVG 原始矢量。
   *
   * @returns Blob type=image/svg+xml
   */
  async exportSVG(): Promise<Blob> {
    const { svg } = await this.opts.mermaid.render(nextRenderId(), this.opts.getCode());
    return new Blob([svg], { type: "image/svg+xml" });
  }

  /**
   * 导出 PNG 高清栅格化。
   *
   * @param scale DPI 倍率，默认 2（Retina 友好），可选 3
   * @returns Blob type=image/png
   */
  async exportPNG(scale: 1 | 2 | 3 = 2): Promise<Blob> {
    const { svg } = await this.opts.mermaid.render(nextRenderId(), this.opts.getCode());
    return Exporter.svgToPngBlob(svg, scale);
  }

  // ---------- 下载 + 复制 ----------

  /**
   * 触发浏览器下载 Blob 到本地。
   *
   * 纯前端 createObjectURL + a[download]，不依赖内核 API。
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 异步释放 object URL（给浏览器时间读文件）
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * 将 PNG 复制到剪贴板。
   *
   * 优先 Clipboard API（navigator.clipboard.write），降级尝试 execCommand('copy')。
   * 非 HTTPS 环境 Clipboard API 可能不可用 → 抛出让调用方友好提示。
   */
  async copyPNG(): Promise<void> {
    const blob = await this.exportPNG(2);
    return Exporter.copyBlob(blob);
  }

  /**
   * 将 SVG 同时以 XML 文本 + image/svg+xml 两种形式复制到剪贴板。
   *
   * 粘贴到 Preview/Word → 可能解析出矢量图；粘贴到文本编辑器 → 得到 XML 代码。
   */
  async copySVG(): Promise<void> {
    const blob = await this.exportSVG();
    const text = await blob.text();
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob,
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        return;
      }
    } catch {
      // Clipboard API 失败（非 HTTPS / 权限拒绝）→ 降级到 textarea
    }
    // 降级：execCommand('copy')
    Exporter.fallbackCopyText(text);
  }

  // ---------- 工具 ----------

  /**
   * 文件名生成：`{diagramType}_{YYYYMMDD_HHmmss}.{ext}`
   * diagramType 来自 header line（flowchart / sequenceDiagram / classDiagram ...）。
   */
  static buildFileName(diagramType: string, ext: "png" | "svg"): string {
    // 规范化 diagramType（去掉 -v2 后缀、小写）
    const type = diagramType
      .replace(/-v\d+$/, "")
      .toLowerCase()
      .replace(/[^\w-]/g, "");
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${type || "diagram"}_${ts}.${ext}`;
  }

  // ---------- 私有静态 ----------

  /**
   * SVG 字符串 → PNG Blob（Canvas 栅格化）。
   *
   * @param svg mermaid.render 返回的 svgString
   * @param scale DPI 倍率（1/2/3）
   */
  static async svgToPngBlob(svg: string, scale: 1 | 2 | 3): Promise<Blob> {
    // 1. 解析 SVG 拿 width/height
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const root = doc.documentElement;

    // 确保有 xmlns（缺了 Image 加载会失败）
    if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    let w = parseFloat(root.getAttribute("width") || "400");
    let h = parseFloat(root.getAttribute("height") || "300");
    // mermaid 可能给 "400px" → strip
    if (root.getAttribute("width")?.includes("px")) w = parseFloat(root.getAttribute("width")!.replace("px", ""));
    if (root.getAttribute("height")?.includes("px")) h = parseFloat(root.getAttribute("height")!.replace("px", ""));

    // 2. base64 编码为 data URI（避免 URL 长度限制）
    const svgWithNs = root.outerHTML;
    const b64 = btoa(unescape(encodeURIComponent(svgWithNs)));
    const dataUri = `data:image/svg+xml;base64,${b64}`;

    // 3. Image → Canvas(scale 倍) → toBlob
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("SVG 加载失败（可能有 external 资源）"));
    });
    img.src = dataUri;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d")!;
    // 白色背景（SVG 可能透明）
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob 返回 null"))),
        "image/png",
      );
    });
  }

  /** 复制 Blob 到剪贴板（优先 Clipboard API，降级 execCommand） */
  static async copyBlob(blob: Blob): Promise<void> {
    try {
      if (navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        return;
      }
    } catch {
      // Clipboard API 不可用或权限拒绝
    }
    const text = await blob.text();
    Exporter.fallbackCopyText(text);
  }

  /** execCommand('copy') 降级方案 */
  private static fallbackCopyText(text: string): void {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
