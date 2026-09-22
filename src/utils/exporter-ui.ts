/**
 * exporter-ui.ts — 导出下拉按钮组工厂（供 VisimerBackend + ReadOnlyAdapter 共用）
 *
 * 把导出入口的 UI 构建逻辑从两个 adapter 中抽出来，避免重复代码。
 *
 * 注意：使用**静态 import** 加载 mermaid 和 Exporter，而非动态 import。
 * 原因：思源插件产物是 CJS 格式（vite lib.formats=["cjs"]），
 * 动态 import("mermaid") 在 CJS 插件运行环境中会失败。
 * 静态 import 由 vite/rollup 在构建时 dedupe 到同一个 mermaid 模块实例。
 */

import mermaid from "mermaid";
import { Exporter } from "./exporter";

export interface ExportDropdownOptions {
  /** 获取当前 Mermaid 源码 */
  getCode: () => string;
  /** 获取图类型（用于文件名，如 "flowchart"） */
  getType?: () => string;
  /** 错误提示挂载点（可选，没有则静默失败） */
  statusLabel?: HTMLElement | null;
}

/**
 * 构造「📤 导出 ▾」下拉按钮组，包含 5 个子操作：
 *   - 下载 PNG (2x)
 *   - 下载 PNG (3x)
 *   - 下载 SVG
 *   - 复制 PNG 到剪贴板
 *   - 复制 SVG 到剪贴板
 *
 * 返回可直接 appendChild 到 toolbar 的 HTMLElement。
 */
export function buildExportDropdown(opts: ExportDropdownOptions): HTMLElement {
  const { getCode, getType, statusLabel } = opts;

  // 与 Visimer makeBtn 样式对齐
  const btnBase: Record<string, string> = {
    fontSize: "12px",
    padding: "4px 10px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#475569",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  const host = document.createElement("div");
  Object.assign(host.style, { position: "relative", display: "inline-block" });

  let btnOpen = false;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Export ▾";
  Object.assign(btn.style, btnBase);
  // hover/active 态：浅灰底；打开时保持高亮
  btn.addEventListener("mouseenter", () => { if (!btnOpen) btn.style.background = "#f1f5f9"; });
  btn.addEventListener("mouseleave", () => { if (!btnOpen) btn.style.background = "#ffffff"; });
  btn.addEventListener("mousedown", () => (btn.style.background = "#e2e8f0"));
  btn.addEventListener("mouseup", () => (btn.style.background = btnOpen ? "#eef2ff" : "#ffffff"));

  const menu = document.createElement("div");
  Object.assign(menu.style, {
    position: "absolute", top: "100%", right: "0", marginTop: "4px",
    background: "#ffffff", border: "1px solid #cbd5e1", borderRadius: "6px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.12)", minWidth: "180px",
    zIndex: "1000", display: "none", flexDirection: "column",
    padding: "4px 0", overflow: "hidden",
  });

  const showError = (msg: string) => {
    if (!statusLabel) return;
    statusLabel.classList.remove("mw-status-ok");
    statusLabel.classList.add("mw-status-error");
    statusLabel.textContent = `Export failed: ${msg}`;
  };

  const mkItem = (label: string, action: () => Promise<void>, danger = false) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = label;
    Object.assign(item.style, {
      padding: "6px 14px", border: "none", background: "transparent",
      cursor: "pointer", fontSize: "12px", textAlign: "left",
      color: danger ? "#dc2626" : "#334155", width: "100%",
      fontFamily: "inherit", lineHeight: "1.5",
    });
    item.addEventListener("mouseenter", () => {
      item.style.background = "#f1f5f9";
      item.style.color = danger ? "#dc2626" : "#1e293b";
    });
    item.addEventListener("mouseleave", () => {
      item.style.background = "transparent";
      item.style.color = danger ? "#dc2626" : "#334155";
    });
    item.addEventListener("click", async () => {
      menu.style.display = "none";
      btn.style.background = "#ffffff";
      try {
        await action();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showError(msg);
      }
    });
    menu.appendChild(item);
  };

  // 分隔线
  const divider = document.createElement("div");
  Object.assign(divider.style, {
    height: "1px", background: "#e2e8f0", margin: "4px 0",
  });

  // mermaid 由顶部静态 import 加载，vite/rollup 会与 VisimerBackend/ReadOnlyAdapter 中的
  // 同模块静态 import dedupe 到同一个模块实例
  const mm = mermaid as any;
  if (!mm?.render) {
    showError("mermaid 模块缺失（构建异常）");
  }

  const runExport = async (format: "png" | "svg", scale?: 2 | 3) => {
    if (!mm?.render) throw new Error("mermaid 模块不可用");
    const exp = new Exporter({ getCode, mermaid: mm });
    let blob: Blob;
    if (format === "svg") {
      blob = await exp.exportSVG();
    } else {
      blob = await exp.exportPNG(scale ?? 2);
    }
    const t = getType ? getType() : "diagram";
    const fname = Exporter.buildFileName(t, format);
    Exporter.downloadBlob(blob, fname);
  };

  const runCopy = async (format: "png" | "svg") => {
    if (!mm?.render) throw new Error("mermaid 模块不可用");
    const exp = new Exporter({ getCode, mermaid: mm });
    if (format === "svg") await exp.copySVG();
    else await exp.copyPNG();
  };

  // Download group
  mkItem("Download PNG (Retina 2x)", () => runExport("png", 2));
  mkItem("Download PNG (HD 3x)", () => runExport("png", 3));
  mkItem("Download SVG", () => runExport("svg"));
  // Divider
  menu.appendChild(divider);
  // Clipboard group
  mkItem("Copy PNG to clipboard", () => runCopy("png"));
  mkItem("Copy SVG to clipboard", () => runCopy("svg"));

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    btnOpen = menu.style.display === "none";
    menu.style.display = btnOpen ? "flex" : "none";
    btn.style.background = btnOpen ? "#eef2ff" : "#ffffff";
  });
  const closeOnOutside = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) {
      menu.style.display = "none";
      btnOpen = false;
      btn.style.background = "#ffffff";
    }
  };
  document.addEventListener("click", closeOnOutside);

  host.appendChild(btn);
  host.appendChild(menu);
  return host;
}
