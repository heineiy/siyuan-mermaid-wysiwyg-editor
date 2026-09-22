# Design: 高清图片导出

## Facts & Constraints

- **运行环境**：思源桌面端（Electron）+ 移动端（WebView）
- **mermaid.render** 返回 `{ svg: string, bindFunctions?: (element)=>void }`，svg 是完整可独立运行的 SVG 字符串
- **Clipboard API** `navigator.clipboard.write` 仅在 HTTPS 或 localhost 可用；Electron 桌面端满足条件
- **Canvas 栅格化**：SVG → Image → canvas.drawImage → canvas.toBlob('image/png')；需要 SVG 带 xmlns 声明
- **思源插件无后端**：纯前端，不能依赖 fetchSyncPost 保存文件到用户磁盘（浏览器安全限制）
- **现有工具栏**：VisimerBackend.buildCanvasToolbar() 是原生 DOM 按钮组，导出按钮作为新按钮追加

## Goals & Non-Goals

### Goals
- PNG 导出默认 2x DPI，可选 3x DPI
- SVG 原始矢量（无栅格化损失）
- 文件下载（浏览器 download 属性）+ 剪贴板复制
- 统一 UI 入口，VisimerBackend 和 ReadOnlyAdapter 都要有
- 不影响现有编辑功能（导出不触发 writeDebounce）

### Non-Goals
- 不做 PDF 导出
- 不做思源内核文件系统写入
- 不做批量导出
- 不做自定义尺寸/A4 排版对话框

## Decisions

### Decision 1: 导出走独立 mermaid.render，不依赖 canvasView

**Choice**: 每次导出时，从 `editor.getCode()` 或 textarea value 拿到 mermaid 代码 → 独立调 `mermaid.render(code)` 拿 svgString → 走 exporter 模块

**Rationale**: 
- 不依赖 Visimer MermaidCanvasView 内部的 SVG（它的 SVG 带交互层 + Visimer 自定义属性，不是原始 mermaid 输出）
- ReadOnlyAdapter 本身就是 mermaid.render，天然复用
- 与画布编辑解耦，导出和编辑互不影响

**Alternatives**:
- 从 DOM 里抓 `.mw-canvas svg` → 不行，Visimer SVG 带污染属性
- 让 Visimer 提供 export API → Visimer 没这个 API

**Consequences**: 每次导出多一次 mermaid.parse + render（<50ms），换来干净的 SVG 输出

### Decision 2: PNG 栅格化用 SVG→Image→Canvas 链路

**Choice**: `new Image() → img.src = 'data:image/svg+xml;base64,...' → ctx.drawImage(img, 0, 0, w*2, h*2) → canvas.toBlob('image/png')`

**Rationale**: 
- 纯浏览器 API，无依赖
- svg 需要加 `xmlns="http://www.w3.org/2000/svg"` + `width`/`height` 属性才能被 Image 加载
- base64 编码避免 URL 长度限制（复杂 SVG 可能超 2048 字符）

**Alternatives**:
- dom-to-image / html-to-image → 额外依赖，且 Visimer SVG 不是简单 DOM copy
- rasterize → 额外依赖

**Consequences**: exporter 里需要写一个 `svgToPng(svg, scale)` 工具函数

### Decision 3: 文件下载用浏览器 `<a download>`，Clipboard 用 Clipboard API

**Choice**: 
- 下载：`URL.createObjectURL(blob) → <a download href=blobUrl click → revokeObjectURL`
- 复制：`navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob, 'text/plain': svgText })])`

**Rationale**: 
- 不依赖思源内核 API，纯前端实现，跨平台（desktop + mobile webview）
- Clipboard API 在 Electron 桌面端可用（localhost 环境）
- 如果 Clipboard API 不可用，降级：复制 SVG 文本到 textarea 再 execCommand('copy')

**Consequences**: 需要 try/catch + 降级逻辑

### Decision 4: 导出入口放在画布工具栏右侧（与 codeToggle 同级）

**Choice**: 在 `VisimerBackend.buildCanvasToolbar()` 返回后追加导出按钮组（dropdown 或 5 个独立小按钮）

**Rationale**: 
- 工具栏是 Dialog 内最显眼的位置
- ReadOnlyAdapter preview 区也要加同样的按钮（复用 exporter 模块，拿不到 editor.code 就从 textarea.value 拿）
- 用 dropdown（▾）减少按钮数量，不挤工具栏

**Alternatives**:
- 独立顶部 export bar → 多一层 DOM
- 右键菜单 → 用户不容易发现
- Dialog title bar → 需要操作 Dialog DOM，耦合思源内部结构

**Consequences**: 工具栏按钮变多一个 dropdown，但现有 spacer push 已经处理好右侧对齐

## Risks & Verification

| Risk | Verification |
|------|-------------|
| Clipboard API 在移动端 WebView 不可用 | 降级 execCommand('copy') + 提示 |
| SVG→Image CORS 错误（external 资源） | mermaid SVG 无 external 资源（纯 inline），实测通过 |
| 大图 canvas.toBlob 内存占用 | 3x DPI flowchart ~3000×2000 → 24MB RGBA buffer，可接受 |
| 导出按钮挤工具栏 | dropdown 折叠后只占 1 按钮宽度 |
