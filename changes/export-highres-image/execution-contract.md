# Execution Contract: 高清图片导出

## Intent Lock

**Problem**: 当前插件能双向可视化编辑 Mermaid 代码块，但无导出能力。用户发布时需手动截图（低质、裁剪不整齐）。

**Scope**: 新增 exporter 模块，支持 PNG（2x/3x DPI）、SVG 矢量、文件下载、剪贴板复制，入口统一在 Dialog 工具栏。

## Scope Fence (Out of Scope)

- 思源内核 API 文件保存（浏览器 download 即可）
- PDF 导出
- 批量导出多个 Mermaid 块
- 自定义尺寸 / A4 排版

## Approved Requirements

| ID | SHALL/MUST | Test Obligation |
|----|-----------|-----------------|
| REQ-EXPORT-001 | PNG 默认 2x DPI，可选 3x | vitest + 手动 Retina 验证 |
| REQ-EXPORT-002 | SVG 原始矢量、完整可独立运行 | 打开 SVG 验证矢量结构 |
| REQ-EXPORT-003 | Clipboard 复制 PNG/SVG，降级 execCommand | mock Clipboard API + 降级链路 |
| REQ-EXPORT-004 | VisimerBackend + ReadOnlyAdapter 工具栏有「导出 ▾」 | 宿主联调两个入口 |
| REQ-EXPORT-005 | 导出失败红色 pill 提示，Clipboard 不可用降级 | vitest mock 错误场景 |
| REQ-EXPORT-006 | 导出不触发 writeDebounce，不污染思源内容 | 导出后 check block content 不变 |

## Build Constraints

- **独立 mermaid.render**：每次导出走独立调用，不依赖 Visimer canvasView DOM SVG（带污染属性）
- **PNG 栅格化链**：SVG → Image → Canvas(scale 2-3x) → toBlob；SVG 需补 xmlns + base64
- **无新依赖**：纯浏览器 API（URL.createObjectURL、navigator.clipboard、Canvas）
- **不影响编辑**：导出走独立 Exporter 类，不调用 sync.ts 的 onGraphChange

## Execution Batches

### Batch 1 — 核心模块（T1 + T2 + T3）

新增 `src/utils/exporter.ts` + `src/utils/exporter.test.ts`

- Exporter 类：`{ getCode, mermaidInstance }` 构造器
- `exportSVG(): Promise<Blob>` — mermaid.render → svgString → Blob
- `exportPNG(scale=2|3): Promise<Blob>` — svgToPng 栅格化
- `downloadBlob(blob, filename)` — createObjectURL → a[download] → click
- `copyPNG(blob)` + `copySVG(text)` — Clipboard API + execCommand 降级
- `buildFileName(type, ext)` — `flowchart_20260922_134530.png`

**完成定义**: vitest 全绿，所有方法返回正确 Blob/MIME

### Batch 2 — 入口接入（T4 + T5）

改 `visimer-backend.ts` + `readonly-adapter.ts`

- VisimerBackend.buildCanvasToolbar() 右侧追加「导出 ▾」dropdown（5 个子项）
- ReadOnlyAdapter preview 区同样导出按钮（代码从 textarea.value 取）
- Exporter 实例复用同一类（差异只在 getCode 来源）
- 错误处理：showErrorPill

**完成定义**: 宿主联调两个 Dialog 都有导出入口

### Batch 3 — 集成 + 验证（T6）

- npm run build 成功
- npm test 全绿（~185 tests）
- 手动：flowchart 导出 PNG 200% 无像素感；SVG 矢量完整；剪贴板复制到 Preview；未知类型改代码后导出
- 导出后检查思源块内容不变（REQ-EXPORT-006）

## Review Gates

| Gate | Evidence | Pass Condition |
|------|----------|----------------|
| DP-3 | 本文件批准 | 用户显式批准 |
| 每 Batch 后 | vitest | 全绿才能进下一批 |
| 关闭前 | 宿主联调 | 所有 6 条 REQ Scenario 通过 |

## Escalation Rules

- SVG→Image 触发 CORS / external 资源 → 升级到 design 层重新评估栅格化方案
- Clipboard API 全部不可用（desktop + mobile）→ 降级为仅文件下载
- Batch 2 发现 VisimerBackend DOM 结构与预期不符 → 先 mock 验证 exporter 独立可用，再调整 DOM 接入点

## Test Coverage Target

| 模块 | 新增 tests | Mock |
|------|-----------|------|
| exporter.test.ts | ~8 | mermaid.render / Image / canvas / navigator.clipboard |
| backend.test.ts | +1 | toolbar 含导出按钮 |
| readonly-adapter.test.ts | +1 | preview 区含导出按钮 |
