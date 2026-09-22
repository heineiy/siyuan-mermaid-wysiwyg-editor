# Tasks: 高清图片导出

## Delivery / Proof Map

| Requirement | Task(s) | Evidence |
|-------------|---------|----------|
| REQ-EXPORT-001 PNG 高清导出 | T1 + T2 | 手动导出 PNG → 200% 缩放无像素感 |
| REQ-EXPORT-002 SVG 矢量导出 | T1 + T3 | 打开 SVG → 矢量可缩放 |
| REQ-EXPORT-003 剪贴板复制 | T1 + T4 | 粘贴到 Preview → 正常显示 |
| REQ-EXPORT-004 入口 | T5 | VisimerBackend + ReadOnlyAdapter 工具栏有「导出 ▾」 |
| REQ-EXPORT-005 失败处理 | T6 | 语法错误时导出不崩溃 + 红色 pill |
| REQ-EXPORT-006 不影响编辑 | 集成验证 | 导出后 close Dialog → 思源块内容不变 |

---

## Tasks

### T1: exporter 模块骨架 + SVG 获取

- [x] **路径**: `src/utils/exporter.ts`（新增）
- [x] **产出**: `Exporter` 类，构造器接收 `{ getCode: () => string, mermaidInstance }`
- [x] **方法**: `exportSVG(): Promise<Blob>` — 调 `mermaid.render(id, code)` → 拿 svgString → 包装 Blob
- [x] **文件名生成**: `buildFileName(diagramType, ext)` → `flowchart_20260922_134530.svg`
- [x] **单测**: `src/utils/exporter.test.ts` — mock mermaid.render 返回 svg，验证 Blob type + 文件名格式
- [x] **证据**: `npx vitest run src/utils/exporter.test.ts` 全绿

### T2: PNG 栅格化 (SVG → Image → Canvas → Blob)

- [x] **路径**: `src/utils/exporter.ts`（新增 `svgToPng` 私有方法）
- [x] **产出**: `exportPNG(scale: 1|2|3 = 2): Promise<Blob>`
- [x] **步骤**:
  1. 补全 SVG 根节点 xmlns + width/height
  2. base64 编码为 data URI
  3. `new Image().onload → canvas.drawImage(img, 0, 0, w*scale, h*scale)`
  4. `canvas.toBlob('image/png')`
- [x] **单测**: mock Image + canvas，验证 scale=2 时 canvas 尺寸翻倍
- [x] **证据**: vitest 全绿；手动导出 Retina PNG

### T3: 文件下载 + 剪贴板写

- [x] **路径**: `src/utils/exporter.ts`（新增 `download` + `copyToClipboard` 静态方法）
- [x] **下载**: `downloadBlob(blob, filename)` — URL.createObjectURL → a[download] click → revokeObjectURL
- [x] **复制**: `copyPNG(blob)` + `copySVG(text)` — 优先 navigator.clipboard.write，降级 execCommand('copy')
- [x] **单测**: mock navigator.clipboard + document.execCommand，验证降级链路
- [x] **证据**: vitest 全绿

### T4: VisimerBackend 工具栏接入导出

- [x] **路径**: `src/render/visimer-backend.ts`（改 `buildCanvasToolbar`）
- [x] **改动**: 在 toolbar 右侧追加「导出 ▾」按钮，点击弹出 4 个子操作（下载 PNG / PNG 3x / SVG / 复制 PNG）
- [x] **Exporter 实例**: 从 `editor.getCode()` 拿当前 mermaid 代码
- [x] **错误处理**: 导出失败时在 toolbar 下方 showErrorPill
- [x] **测试**: `backend.test.ts` 新增 1 个测试 — toolbar 含导出按钮组
- [x] **证据**: vitest 全绿；宿主联调 Dialog 工具栏有「导出 ▾」

### T5: ReadOnlyAdapter 预览区接入导出

- [x] **路径**: `src/adapters/readonly-adapter.ts`（改 init）
- [x] **改动**: 在 preview-slot 上方或右侧加同样的导出按钮，代码从 textarea.value 拿
- [x] **与 VisimerBackend 共用**: 同一个 Exporter 类实例
- [x] **测试**: `readonly-adapter.test.ts` 新增 1 个测试 — preview 区有导出按钮
- [x] **证据**: vitest 全绿；未知类型 Dialog 也能导出

### T6: 集成验证 + 构建

- [x] **宿主联调**: 拷 dist/ 到思源 → 打开 flowchart → 工具栏导出 PNG/SVG/复制 → 全部成功
- [x] **边界**: 语法错误的未知类型图 → 修改代码到合法 → 导出成功
- [x] **构建**: `npm run build` 成功，dist/index.js 体积增量可控
- [x] **全量测试**: `npm test` 全部通过（新增 ~12 测试，总计 ~185）
- [x] **证据**: npm test 全绿；手动导出 PNG 在 Preview 200% 无像素感
