# Specs: 高清图片导出

## ADDED Requirements

### REQ-EXPORT-001: PNG 高清导出

系统 SHALL 提供 PNG 格式高清导出，默认 2x DPI 栅格化。

#### Scenario: 2x DPI PNG 下载

**WHEN** 用户在 Dialog 工具栏点击「导出 ▾ → 下载 PNG」
**THEN** 系统将当前画布对应的 SVG 渲染到 2x 尺寸的 Canvas
**AND** 触发浏览器 download，文件名为 `{type}_{YYYYMMDD_HHmmss}.png`

#### Scenario: 3x DPI 高保真

**WHEN** 用户点击「导出 ▾ → 下载 PNG (3x)」
**THEN** 系统使用 3x DPI 栅格化，确保 Retina 屏幕无像素感

### REQ-EXPORT-002: SVG 矢量导出

系统 SHALL 提供 SVG 原始矢量导出，不栅格化。

#### Scenario: SVG 下载

**WHEN** 用户点击「导出 ▾ → 下载 SVG」
**THEN** 系统输出 mermaid.render 返回的原始 svgString
**AND** 触发浏览器 download，文件名为 `{type}_{YYYYMMDD_HHmmss}.svg`

#### Scenario: SVG 完整性

**WHEN** SVG 文件被打开
**THEN** 矢量结构完整，可无损缩放
**AND** 不依赖外部资源（全部 inline styles）

### REQ-EXPORT-003: 剪贴板复制

系统 SHALL 支持将图片复制到剪贴板。

#### Scenario: 复制 PNG 图片

**WHEN** 用户点击「导出 ▾ → 复制 PNG」
**THEN** 系统将 2x DPI 的 PNG 通过 `navigator.clipboard.write` 写入 ClipboardItem
**AND** 粘贴到 Preview / Word / Discord 时图片正常显示

#### Scenario: 复制 SVG 文本

**WHEN** 用户点击「导出 ▾ → 复制 SVG」
**THEN** 系统将 SVG 字符串以 `text/plain` + `image/svg+xml` 类型写入剪贴板
**AND** 粘贴到文本编辑器时为 XML 代码

### REQ-EXPORT-004: 导出入口 — Dialog 工具栏

系统 SHALL 在 Dialog 画布工具栏最右侧提供统一导出入口。

#### Scenario: VisimerBackend 工具栏有导出

**WHEN** 用户打开任意 Mermaid 图的编辑 Dialog
**THEN** 画布工具栏最右侧显示「导出 ▾」下拉按钮组
**AND** 包含 4 个子操作：下载 PNG、下载 PNG (3x)、下载 SVG、复制 PNG、复制 SVG

#### Scenario: ReadOnlyAdapter 也有导出

**WHEN** 用户打开未知类型 / 语法错误的只读预览 Dialog
**THEN** preview 区同样显示导出按钮
**AND** 导出基于 textarea 当前代码重新 mermaid.render

### REQ-EXPORT-005: 导出失败友好提示

系统 SHALL 在导出失败时显示明确的错误提示。

#### Scenario: mermaid 语法错误时导出

**WHEN** mermaid.render 抛错（语法错误）且用户点击导出
**THEN** 系统不崩溃
**AND** 在 toolbar 下方显示红色错误 pill：「导出失败：{mermaid error message}」

#### Scenario: clipboard API 不可用

**WHEN** 浏览器环境不支持 Clipboard API（非 HTTPS / 无权限）
**THEN** 「复制 PNG」按钮灰显或点击后提示「当前环境不支持剪贴板复制，请用下载功能」

### REQ-EXPORT-006: 导出不影响编辑

导出操作 SHALL 不触发 writeDebounce，不修改思源内容。

#### Scenario: 导出后关闭 Dialog

**WHEN** 用户导出图片后直接关闭 Dialog
**THEN** 思源内核块内容不被导出操作污染
**AND** 不产生额外的 updateBlock 调用
