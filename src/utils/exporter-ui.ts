/**
 * exporter-ui.ts — 导出下拉按钮组工厂（供 VisimerBackend + ReadOnlyAdapter 共用）
 *
 * 把导出入口的 UI 构建逻辑从两个 adapter 中抽出来，避免重复代码。
 * 纯 DOM API + 动态 import Exporter/mermaid，零新依赖。
 */

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

  const host = document.createElement("div");
  Object.assign(host.style, { position: "relative", display: "inline-block" });

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "📤 导出 ▾";
  Object.assign(btn.style, {
    padding: "4px 10px", fontSize: "13px", border: "1px solid #e2e8f0",
    borderRadius: "4px", background: "#fff", cursor: "pointer",
    color: "#475569",
  });

  const menu = document.createElement("div");
  Object.assign(menu.style, {
    position: "absolute", top: "100%", right: "0", marginTop: "4px",
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: "6px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: "160px",
    zIndex: "1000", display: "none", flexDirection: "column",
  });

  const showError = (msg: string) => {
    if (!statusLabel) return;
    statusLabel.classList.remove("mw-status-ok");
    statusLabel.classList.add("mw-status-error");
    statusLabel.textContent = `导出失败：${msg}`;
  };

  const mkItem = (label: string, action: () => Promise<void>) => {
    const item = document.createElement("button");
    item.type = "button";
    item.textContent = label;
    Object.assign(item.style, {
      padding: "8px 14px", border: "none", background: "transparent",
      cursor: "pointer", fontSize: "13px", textAlign: "left",
      color: "#334155", width: "100%",
    });
    item.addEventListener("mouseenter", () => (item.style.background = "#f1f5f9"));
    item.addEventListener("mouseleave", () => (item.style.background = "transparent"));
    item.addEventListener("click", async () => {
      menu.style.display = "none";
      try {
        await action();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showError(msg);
      }
    });
    menu.appendChild(item);
  };

  const runExport = async (format: "png" | "svg", scale?: 2 | 3) => {
    const { Exporter } = await import("./exporter.js");
    const mermaidMod = await import("mermaid").catch(() => null);
    const mermaid = mermaidMod as any;
    if (!mermaid?.render) throw new Error("mermaid 未加载");
    const exp = new Exporter({ getCode, mermaid });
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
    const { Exporter } = await import("./exporter.js");
    const mermaidMod = await import("mermaid").catch(() => null);
    const mermaid = mermaidMod as any;
    if (!mermaid?.render) throw new Error("mermaid 未加载");
    const exp = new Exporter({ getCode, mermaid });
    if (format === "svg") await exp.copySVG();
    else await exp.copyPNG();
  };

  mkItem("📥 下载 PNG", () => runExport("png", 2));
  mkItem("📥 下载 PNG (3x)", () => runExport("png", 3));
  mkItem("📥 下载 SVG", () => runExport("svg"));
  mkItem("📋 复制 PNG 到剪贴板", () => runCopy("png"));
  mkItem("📋 复制 SVG 到剪贴板", () => runCopy("svg"));

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.style.display = menu.style.display === "none" ? "flex" : "none";
  });
  const closeOnOutside = (e: MouseEvent) => {
    if (!host.contains(e.target as Node)) menu.style.display = "none";
  };
  document.addEventListener("click", closeOnOutside);

  host.appendChild(btn);
  host.appendChild(menu);
  return host;
}
