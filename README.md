# 思源 Mermaid 可视化编辑插件

> 思源笔记插件 —— 为 Mermaid 代码块提供所见即所得的双向可视化编辑体验。

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF)](https://vitejs.dev/)
[![Mermaid](https://img.shields.io/badge/Mermaid-12.x-ff3670)](https://mermaid.js.org/)
[![Visimer](https://img.shields.io/badge/Visimer-1.1.x-7c3aed)](https://github.com/visimer/visimer)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

## 🙏 致谢

本插件的可视化编辑能力完全基于 [**Visimer**](https://github.com/inkeep/visimer) ——
一个 Mermaid WYSIWYG 编辑器的 headless 引擎 + 交互式画布框架。Visimer 提供了：

- **`@visimer/core`** — 纯 TypeScript headless 编辑引擎，把 Mermaid 文本编译成可编辑的 AST，再从 AST 编译回文本（双向同步的关键）
- **`@visimer/dom`** — 交互式画布（`MermaidCanvasView`），内置 Select/Connect 工具、popover 属性面板、Plus 按钮、panZoom、fitView
- **`@visimer/codemirror`** — 官方代码面板，语法高亮 + entity 高亮 + 共享 undo 栈

Visimer 由 [inkeep](https://github.com/inkeep) 团队开发，开源仓库：
[https://github.com/inkeep/visimer](https://github.com/inkeep/visimer)

**没有 Visimer，就没有这个插件。** 本插件只是把 Visimer 适配到思源插件生态：
- 思源快捷键系统（`plugin.addCommand`）
- 思源 block-icon 菜单（`click-blockicon` 事件）
- 思源内核 API（`fetchSyncPost` 读写块）
- 原生 DOM 工具栏（Select / Connect / +Node / Undo / Redo / Export）

## ✨ 功能特性

### 🎨 可视化编辑（22 种 Mermaid 图类型）

| 图类型 | 可视化编辑 | 图类型 | 可视化编辑 |
|--------|:----------:|--------|:----------:|
| **flowchart** 流程图 | ✅ 完整 | **sequence** 时序图 | ✅ 完整 |
| **class** 类图 | ✅ 完整 | **state** 状态图 | ✅ 完整 |
| **er** ER 图 | ✅ 完整 | **gantt** 甘特图 | ✅ 完整 |
| **pie** 饼图 | ✅ 完整 | **sankey** 桑基图 | ✅ 完整 |
| **mindmap** 思维导图 | ✅ 完整 | **timeline** 时间线 | ✅ 完整 |
| **architecture** 架构图 | ✅ 完整 | **block** 方块图 | ✅ 完整 |
| **c4** C4 模型图 | ✅ 完整 | **gitgraph** Git 分支图 | ✅ 完整 |
| **journey** 旅程图 | ✅ 完整 | **kanban** 看板图 | ✅ 完整 |
| **packet** 包图 | ✅ 完整 | **quadrant** 象限图 | ✅ 完整 |
| **radar** 雷达图 | ✅ 完整 | **requirement** 需求图 | ✅ 完整 |
| **treemap** 矩形树图 | ✅ 完整 | **xychart** 图表 | ✅ 完整 |

> `zenuml` 仅支持只读渲染（Visimer 设计如此），其余 22 种全部可编辑。

### 🖱️ 画布交互

| 交互 | 操作方式 |
|------|----------|
| **选中实体** | 单击节点/连线 |
| **改属性** | 选中后弹出 Popover：形状、箭头、线条样式、颜色 |
| **改文字** | 双击实体 → Inline Editor |
| **删除实体** | 选中后按 `Delete` / `Backspace` |
| **新建连线** | 切换到 `Connect` 工具 → 从节点 A 拖到节点 B |
| **新建节点** | 工具栏 `+ Node` 下拉选形状 → 自动追加到图上 |
| **切换方向** (flowchart) | 工具栏 `TD/LR/BT/RL` 下拉 |
| **新增参与者** (sequence) | 工具栏 `+ Participant` 下拉选类型 |
| **撤销 / 重做** | `Ctrl+Z` / `Ctrl+Y` 或工具栏 `↶ Undo` / `↷ Redo` |
| **平移画布** | 拖空白处 |
| **缩放画布** | `Ctrl + 滚轮` 或右下角缩放控件 |
| **自动适配** | 右下角 `⛶` 按钮 / 首次打开自动 fitView |

### 🔗 连线工具（含连续连线锁定）

默认行为：连完一条线后自动返回 Select 模式，适合单条连线场景。
开启锁定后：连完一条线仍停留在 Connect 模式，可持续从不同节点拖出连线，按 `Esc` 或再次点击 Connect 工具退出。

### 📤 高清导出

工具栏 `Export` 下拉菜单提供四种导出方式：

| 导出方式 | 说明 |
|----------|------|
| **下载 PNG（2×）** | 高分辨率 PNG 文件，默认 2 倍 DPI |
| **下载 SVG** | 原始矢量 SVG 文件 |
| **复制 PNG 图片** | 直接复制到系统剪贴板，粘贴到微信/文档 |
| **复制 SVG 代码** | 复制 SVG 的 XML 源码 |

导出优先使用画布已渲染的 SVG 节点（无容器污染、无 mermaid 懒加载时序问题），失败时回退到重新渲染（含自动重试 ≤3 次）。

### 🌐 国际化

界面文案（工具按钮、菜单、状态栏、错误提示）随思源语言自动切换：
- `<html lang="zh-CN">` → 中文
- `<html lang="en">` / 默认 → English

无需重启，切换思源语言后重新打开编辑窗口即可生效。

### 📝 代码面板（CodeMirror 语法高亮）

| 功能 | 说明 |
|------|------|
| **双栏同步** | 画布改图 → 代码面板自动更新；代码面板打字 → 画布自动重绘 |
| **实体高亮** | 画布选中节点 → 代码面板高亮对应源码位置 |
| **共享撤销栈** | 文本编辑和画布编辑共用 `Ctrl+Z` / `Ctrl+Y` |
| **显隐切换** | 工具栏 `◀ 隐藏代码` / `▶ 显示代码` 按钮 |
| **语法校验** | 底部状态栏实时显示 `✓ parse ok` 或 `✗ 错误摘要` |

### ⚠️ 错误/未知类型降级

- 未知图类型（如 `foobarDiagram`）→ 打开分屏：左侧 textarea + 右侧错误提示，**可在 textarea 里改成合法类型后自动写回**
- 语法错误 → 右侧红框提示 + 状态指示器红字，修正后画布自动恢复
- **关键**：渲染失败时**不写回坏数据**，只有语法正确才触发 `updateBlock`

### 🔌 触发方式

| 方式 | 说明 |
|------|------|
| **块图标菜单** | 点击 Mermaid 块左侧图标 → 插件 → 可视化编辑 |
| **快捷键** | 默认 `Shift+Alt+M`（光标在 Mermaid 块内时触发），**可在插件设置页自定义** |

## 📦 安装

### 方式一：思源插件市场

在思源 → 设置 → 市场 → 搜索 "Mermaid WYSIWYG Editor" → 安装。

### 方式二：手动安装（开发者）

```bash
# 1. 克隆
git clone https://github.com/heineiy/siyuan-mermaid-wysiwyg-editor.git
cd siyuan-mermaid-wysiwyg-editor

# 2. 安装依赖
npm install

# 3. 构建（自动产出 dist/ + 根目录 package.zip）
npm run build

# 4. 从 GitHub Release 下载 package.zip，解压后把目录改名为
#    "mermaid-wysiwyg-editor"，丢进思源 plugins 目录：
#    macOS:   ~/Library/Application Support/Siyuan/conf/plugins/
#    Windows: %APPDATA%\SiYuan\conf\plugins\
#    Linux:   ~/.config/SiYuan/conf/plugins/
#    要求目录内含 index.js / plugin.json / icon.png / preview.png

# 5. 在思源 → 设置 → 关于 → 重载插件
```

## ⌨️ 快捷键

| 快捷键 | 功能 | 场景 |
|--------|------|------|
| `Shift+Alt+M` | 打开可视化编辑 | 光标在 Mermaid 代码块内时 |
| `Delete` / `Backspace` | 删除选中实体 | 画布编辑中 |
| `Ctrl+Z` | 撤销 | 画布/代码面板共用 |
| `Ctrl+Y` | 重做 | 画布/代码面板共用 |
| `Ctrl + 滚轮` | 缩放画布 | 画布中 |
| `Drag canvas` | 平移画布 | 画布空白处拖拽 |
| `Esc` | 退出 Connect 锁定 | 连续连线锁定中 |

> **快捷键自定义**：思源 → 设置 → 插件 → Mermaid WYSIWYG → 可视化编辑快捷键 → 录制新组合键 → 保存。

### 为什么默认用 `Shift+Alt+M`？

思源默认占用了以下组合：
- `Alt+M` → Electron 全局"隐藏/显示窗口"（不可修改）
- `Ctrl+M` → 内联公式
- `Ctrl+Alt+M` → 备注
- `Ctrl+Shift+M` → 跳转父块上一个

**冲突规避**：`Shift+Alt+M` 不与任何思源默认快捷键冲突，且严格要求三个修饰键同时按下（多带/少带任一修饰键均不匹配）。

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     思源笔记 宿主                          │
│  block-icon 菜单  |  Shift+Alt+M 快捷键  |  onload 生命周期  │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────▼───────────────┐
          │         controller/index.ts    │  插件入口
          │  load → register triggers      │
          └───────┬──────────┬─────────────┘
                  │          │
     ┌────────────▼──┐  ┌────▼─────────────┐
     │  shortcut.ts  │  │    trigger.ts    │  两种触发源
     │  keydown 监听 │  │  block-icon 菜单 │
     └────────┬──────┘  └────┬─────────────┘
              └──────┬───────┘
                     │
          ┌──────────▼──────────┐
          │    dialog.ts        │  弹 Dialog → 调 sync.initEditorSession
          └──────────┬──────────┘
                     │
          ┌──────────▼────────────────────────────┐
          │          sync.ts                       │  双向同步中枢
          │  getBlockMarkdown → strip fence →       │
          │  route() → adapter.init →              │
          │  onGraphChange → debounce →             │
          │  wrap fence → updateBlock              │
          └──────────┬────────────────────────────┘
                     │
          ┌──────────▼────────────────────────────┐
          │      adapters/registry.ts              │  能力路由
          │  flowchart/sequence/class/... → full    │
          │  zenuml 或渲染失败           → readonly │
          │  未知类型                     → readonly │
          └──────────┬────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐    ┌─────▼─────┐   ┌────▼─────┐
│ Visimer │    │ ReadOnly  │   │   ...    │
│  Backend │    │ Adapter   │   │          │
└────┬────┘    └─────┬─────┘   └──────────┘
     │               │
     └───────┬───────┘
             │
   ┌─────────▼───────────────────────────────┐
   │            @visimer 依赖链              │
   │  @visimer/core    MermaidWysiwygEditor   │  headless 编辑引擎
   │  @visimer/dom     MermaidCanvasView      │  交互式画布（panZoom + popover）
   │  @visimer/codemirror MermaidCodeMirror   │  官方代码面板（语法高亮 + 共享 undo）
   │  mermaid@12       只读渲染 + 导出兜底    │  兜底 + 类型判断 + 重新渲染回退
   └──────────────────────────────────────────┘
```

### 三层 + 可替换接口

| 层 | 文件 | 职责 |
|----|------|------|
| **Controller** | `controller/sync.ts`, `dialog.ts`, `shortcut.ts`, `trigger.ts` | 宿主桥接、Dialog 生命周期、触发源 |
| **Adapters** | `adapters/registry.ts`, `visimer-full-adapter.ts`, `readonly-adapter.ts` | 能力路由（full/readonly）、适配器接口 |
| **Render** | `render/visimer-backend.ts`, `render/backend.ts` | RenderBackend 接口 + Visimer 实现 |
| **Utils** | `utils/exporter.ts`, `utils/exporter-ui.ts`, `utils/i18n.ts` | 高清导出管线、导出下拉菜单、国际化 |

### 适配器注册（循环 22 种）

```typescript
// index.ts onload 中：
DIAGRAM_TYPES
  .filter(t => t.capability === "edit")   // 22 种可编辑
  .forEach(t => registry.register(new VisimerFullAdapter({ type: t.id })));
registry.register(new ReadOnlyAdapter());  // 通配兜底
```

## 🛠️ 开发

### 环境要求

- Node.js ≥ 20.10.0
- npm ≥ 10.0.0

### 命令

```bash
npm install        # 安装依赖
npm run dev        # Vite 开发模式（watch 构建 → dist/index.js）
npm run build      # 生产构建（单文件 CJS dist/index.js + 自动产出根目录 package.zip）
npm test           # 单元测试（Vitest）
npm run verify:acceptance   # 验收用例
```

### 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@visimer/core` | ^1.1.2 | Visimer headless 编辑引擎 |
| `@visimer/dom` | ^1.1.2 | Visimer 交互式画布 |
| `@visimer/codemirror` | ^1.1.2 | Visimer 官方代码面板 |
| `@codemirror/commands` | ^6.11 | CodeMirror 命令（Undo/Redo） |
| `@codemirror/language` | ^6.12 | CodeMirror 语言高亮 |
| `@codemirror/state` | ^6.7 | CodeMirror 状态管理 |
| `@codemirror/view` | ^6.43 | CodeMirror 视图 |
| `mermaid` | ^12.0.0 | Mermaid 渲染内核 + 类型判断 |
| `siyuan` | 1.2.7 | 思源类型定义 + `fetchSyncPost` |

## 📚 目录结构

```
siyuan-mermaid-wysiwyg-editor/
├── src/
│   ├── controller/         # 宿主桥接：sync / dialog / shortcut / trigger / settings
│   ├── adapters/           # 适配器层：registry / visimer-full-adapter / readonly-adapter
│   ├── render/             # 渲染层：backend 接口 + visimer-backend 实现
│   ├── utils/              # 工具：exporter / exporter-ui / i18n / fence
│   ├── __tests__/          # 共享 fixture
│   ├── acceptance/         # 验收用例
│   └── index.ts            # 插件入口（onload 组装全部模块）
├── dist/                   # 构建产物（单文件 CJS + 静态资源）
│   ├── index.js            #   入口脚本
│   ├── plugin.json         #   清单
│   ├── icon.png            #   图标
│   ├── preview.png         #   预览图
│   ├── i18n/               #   中英词典（宿主 plugin.i18n 加载）
│   └── README.md / LICENSE #   文档
├── i18n/                   # 官方 i18n 词典源文件：en.json / zh_CN.json
├── package.zip             # 根目录打包（vite-plugin-zip-pack 自动产出）
├── plugin.json             # 思源插件清单（本地化键用 zh_CN）
├── CHANGELOG.md            # 版本记录（随包分发）
├── vite.config.mts         # Vite 配置（inlineDynamicImports + named exports + zipPack）
├── gh_release.sh           # 一键发布（提取 CHANGELOG 对应版本段 + 上传 package.zip）
└── tsconfig.json
```

## 🎯 已知限制

| 限制 | 原因 |
|------|------|
| **zenuml** 仅只读 | Visimer 设计为 render-only |
| **思源版本要求** | ≥ 3.8.0（使用 `fetchSyncPost` + `click-blockicon` 事件） |
| **产物 ~10.7MB** | 含完整 CodeMirror + Visimer + Mermaid（无法 tree-shake） |
| **运行时禁动态 import()** | 思源插件为 CJS 环境，rollup inlineDynamicImports 已全部内联 |

## 📄 License

MIT
