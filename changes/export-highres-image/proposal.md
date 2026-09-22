# Proposal: 高清图片导出

## Why

当前插件能双向可视化编辑 Mermaid 代码块，但没有导出能力。用户想把流程图/时序图发布到文档、演示文稿、邮件时，必须手动截图——分辨率低、有水印、裁剪不整齐。

## What Changes

新增导出子模块 `src/utils/exporter.ts`，支持：

1. **PNG 高清导出**：SVG → Canvas 栅格化（默认 2x DPI）→ 下载文件
2. **SVG 矢量导出**：mermaid 原始 SVG → Blob → 下载文件
3. **剪贴板复制**：PNG 图片或 SVG 文本 → `navigator.clipboard.write`
4. **工具栏入口**：Dialog 画布工具栏新增"导出 ▾"下拉按钮

## Scope

### In Scope

- PNG 导出（2x/3x DPI 可选）
- SVG 原始矢量导出
- 浏览器 download API 下载到本地
- Clipboard API 复制到剪贴板（SVG 文本或 PNG 图片）
- Dialog 工具栏导出入口（VisimerBackend + ReadOnlyAdapter 都要有）
- 文件名自动生成：`{diagramType}_{timestamp}.{ext}`

### Out of Scope

- 思源内核 API 文件保存（用户浏览器下载即可，不依赖 fetchSyncPost）
- PDF 导出（需第三方库，非核心）
- 批量导出多个 Mermaid 块
- 自定义尺寸/A4 排版

## Impact

| Area | Change |
|------|--------|
| `src/utils/exporter.ts` | **新增** — 导出核心模块 |
| `src/render/visimer-backend.ts` | 工具栏加导出按钮组 |
| `src/adapters/readonly-adapter.ts` | preview 区加导出按钮 |
| `src/controller/dialog.ts` | 无改动（Dialog 容器不动） |

## Proof of Completion

1. `npm run build` 成功
2. `npm test` 全部通过（新增 exporter 单测 + backend 导出集成测试）
3. 宿主联调：打开任意 Mermaid 图 → 工具栏「导出 ▾」→ PNG/SVG 文件下载成功
4. Clipboard 测试：点击「复制 PNG」→ 粘贴到 macOS Preview/Word → 图片清晰无栅格化
5. 高清验证：导出 PNG 在 200% 缩放下无像素感
