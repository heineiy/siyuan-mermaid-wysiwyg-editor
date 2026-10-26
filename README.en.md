# Siyuan Mermaid WYSIWYG Editor Plugin

> Siyuan Note plugin —— bring bidirectional visual editing to your Mermaid code blocks.

[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF)](https://vitejs.dev/)
[![Mermaid](https://img.shields.io/badge/Mermaid-12.x-ff3670)](https://mermaid.js.org/)
[![Visimer](https://img.shields.io/badge/Visimer-1.1.x-7c3aed)](https://github.com/visimer/visimer)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

## 🙏 Acknowledgements

This plugin's visual editing capability is **entirely built on top of [Visimer](https://github.com/inkeep/visimer)** ——
a headless engine + interactive canvas framework for building Mermaid WYSIWYG editors. Visimer provides:

- **`@visimer/core`** — Pure TypeScript headless editing engine: compiles Mermaid text into an editable AST and back (the key to bidirectional sync)
- **`@visimer/dom`** — Interactive canvas (`MermaidCanvasView`) with Select/Connect tools, popover property panels, Plus buttons, panZoom, and auto-fit
- **`@visimer/codemirror`** — Official code panel with syntax highlighting, entity highlighting, and shared undo stack

Visimer is developed by the [inkeep](https://github.com/inkeep) team. Repository:
[https://github.com/inkeep/visimer](https://github.com/inkeep/visimer)

**None of this would be possible without Visimer.** This plugin only adapts Visimer to the Siyuan plugin ecosystem:
- Siyuan hotkey system (`plugin.addCommand`)
- Siyuan block-icon menu (`click-blockicon` event)
- Siyuan kernel API (`fetchSyncPost` for block read/write)
- Native DOM toolbar (Select / Connect / +Node / Undo / Redo / Export)

## ✨ Features

### 🎨 Visual Editing (22 Mermaid Diagram Types)

| Diagram Type | Visual Edit | Diagram Type | Visual Edit |
|-------------|:-----------:|-------------|:-----------:|
| **flowchart** | ✅ Full | **sequence** | ✅ Full |
| **class** | ✅ Full | **state** | ✅ Full |
| **er** | ✅ Full | **gantt** | ✅ Full |
| **pie** | ✅ Full | **sankey** | ✅ Full |
| **mindmap** | ✅ Full | **timeline** | ✅ Full |
| **architecture** | ✅ Full | **block** | ✅ Full |
| **c4** | ✅ Full | **gitgraph** | ✅ Full |
| **journey** | ✅ Full | **kanban** | ✅ Full |
| **packet** | ✅ Full | **quadrant** | ✅ Full |
| **radar** | ✅ Full | **requirement** | ✅ Full |
| **treemap** | ✅ Full | **xychart** | ✅ Full |

> `zenuml` is read-only by Visimer design. All other 22 types are fully editable.

### 🖱️ Canvas Interaction

| Interaction | How |
|-------------|-----|
| **Select entity** | Click node / edge |
| **Edit properties** | Click → Popover appears: shape, arrow, line style, color |
| **Edit label** | Double-click entity → Inline Editor |
| **Delete entity** | Select + `Delete` / `Backspace` |
| **Create edge** | Switch to `Connect` tool → drag from node A to node B |
| **Add node** | Toolbar `+ Node` dropdown → auto-append to graph |
| **Switch direction** (flowchart) | Toolbar `TD/LR/BT/RL` dropdown |
| **Add participant** (sequence) | Toolbar `+ Participant` dropdown |
| **Undo / Redo** | `Ctrl+Z` / `Ctrl+Y` or toolbar `↶ Undo` / `↷ Redo` |
| **Pan canvas** | Drag empty area |
| **Zoom canvas** | `Ctrl + wheel` or bottom-right zoom controls |
| **Auto-fit** | Bottom-right `⛶` button / auto fitView on open |

### 🔗 Connect Tool (with Continuous Edge Lock)

Default behavior: after drawing one edge, the tool auto-returns to Select mode — ideal for single-edge scenarios.
When locked: stays in Connect mode after each edge, so you can repeatedly drag from any node. Press `Esc` or click the Connect tool again to exit.

### 📤 High-Resolution Export

The `Export` dropdown in the toolbar offers four options:

| Export Option | Description |
|---------------|-------------|
| **Download PNG (2×)** | High-resolution PNG file at 2× DPI |
| **Download SVG** | Original vector SVG file |
| **Copy as PNG Image** | Directly to clipboard — paste into WeChat, docs, etc. |
| **Copy SVG Source** | Copy the raw SVG XML |

Export prioritizes pre-rendered SVG nodes on the canvas (no DOM container pollution, no mermaid lazy-loading race). Falls back to re-rendering with automatic retry (≤3 attempts).

### 🌐 Internationalization

UI strings (tool buttons, menu items, status bar, error messages) auto-switch with Siyuan's language:
- `<html lang="zh-CN">` → 中文
- `<html lang="en">` / default → English

No restart needed — close and reopen the editor window after changing Siyuan's language.

### 📝 Code Panel (CodeMirror with Syntax Highlighting)

| Feature | Description |
|---------|-------------|
| **Dual-pane sync** | Canvas edits → code panel updates; code panel typing → canvas re-renders |
| **Entity highlighting** | Canvas selection → corresponding source code range highlighted |
| **Shared undo stack** | Text and canvas edits share `Ctrl+Z` / `Ctrl+Y` |
| **Toggle show/hide** | Toolbar `◀ Hide Code` / `▶ Show Code` button |
| **Syntax validation** | Bottom status bar shows `✓ parse ok` or `✗ error summary` in real time |

### ⚠️ Error / Unknown Type Degradation

- Unknown types (e.g. `foobarDiagram`) → opens split-view: left textarea + right error hint. **Fix the syntax in textarea, and it writes back automatically.**
- Syntax errors → right side shows red box + red status indicator. Canvas recovers once fixed.
- **Key invariant**: Render failures **never pollute Siyuan**. `updateBlock` is only called when syntax is valid.

### 🔌 Trigger Methods

| Method | Description |
|--------|-------------|
| **Block icon menu** | Click the icon left of a Mermaid block → Plugins → Visual Edit |
| **Keyboard shortcut** | Default `Shift+Alt+M` (when cursor is inside a Mermaid block). **Configurable in plugin settings.** |

## 📦 Installation

### Option A: Siyuan Plugin Marketplace

Siyuan → Settings → Marketplace → Search "Mermaid WYSIWYG Editor" → Install.

### Option B: Manual Install (For Developers)

```bash
# 1. Clone
git clone https://github.com/heineiy/siyuan-mermaid-wysiwyg-editor.git
cd siyuan-mermaid-wysiwyg-editor

# 2. Install dependencies
npm install

# 3. Build (auto-produces dist/ + package.zip at project root)
npm run build

# 4. Download package.zip from a GitHub Release, extract it, rename the directory to
#    "mermaid-wysiwyg-editor", and drop it into the Siyuan plugins folder:
#    macOS:   ~/Library/Application Support/Siyuan/conf/plugins/
#    Windows: %APPDATA%\SiYuan\conf\plugins\
#    Linux:   ~/.config/SiYuan/conf/plugins/
#    Required files inside: index.js / plugin.json / icon.png / preview.png

# 5. Reload plugins from Siyuan → Settings → About → Reload Plugins
```

## ⌨️ Shortcuts

| Shortcut | Action | Context |
|----------|--------|---------|
| `Shift+Alt+M` | Open visual editor | Cursor inside a Mermaid code block |
| `Delete` / `Backspace` | Delete selected entity | Canvas editing |
| `Ctrl+Z` | Undo | Canvas & code panel (shared stack) |
| `Ctrl+Y` | Redo | Canvas & code panel (shared stack) |
| `Ctrl + Wheel` | Zoom canvas | Over canvas |
| `Drag canvas` | Pan canvas | Drag empty area |
| `Esc` | Exit Connect lock | Continuous edge mode |

> **Customizing shortcuts**: Siyuan → Settings → Plugins → Mermaid WYSIWYG → Visual Edit Shortcut → Record new key combo → Save.

### Why `Shift+Alt+M` by default?

Siyuan reserves these combos by default:
- `Alt+M` → Electron global "hide/show window" (immutable)
- `Ctrl+M` → Inline formula
- `Ctrl+Alt+M` → Note
- `Ctrl+Shift+M` → Jump to previous parent block

**Conflict avoidance**: `Shift+Alt+M` avoids all Siyuan defaults. Strict matching: adding/removing any modifier key (e.g. `Ctrl+Shift+Alt+M`) disables the match.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Siyuan Note Host                          │
│  block-icon menu  |  Shift+Alt+M  |  onload lifecycle       │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────▼───────────────┐
          │         controller/index.ts    │  Plugin entry
          │  load → register triggers      │
          └───────┬──────────┬─────────────┘
                  │          │
     ┌────────────▼──┐  ┌────▼─────────────┐
     │  shortcut.ts  │  │    trigger.ts    │  Two trigger sources
     │  keydown      │  │  block-icon menu │
     └────────┬──────┘  └────┬─────────────┘
              └──────┬───────┘
                     │
          ┌──────────▼──────────┐
          │    dialog.ts        │  Opens Dialog → sync.initEditorSession
          └──────────┬──────────┘
                     │
          ┌──────────▼────────────────────────────┐
          │          sync.ts                       │  Bidirectional sync hub
          │  getBlockMarkdown → strip fence →       │
          │  route() → adapter.init →              │
          │  onGraphChange → debounce →             │
          │  wrap fence → updateBlock              │
          └──────────┬────────────────────────────┘
                     │
          ┌──────────▼────────────────────────────┐
          │      adapters/registry.ts              │  Capability routing
          │  flowchart/sequence/class/... → full    │
          │  zenuml or render failure    → readonly │
          │  unknown type                → readonly │
          └──────────┬────────────────────────────┘
                     │
     ┌───────────────┼───────────────┐
     │               │               │
┌────▼────┐    ┌─────▼─────┐   ┌────▼─────┐
│ Visimer │    │ ReadOnly  │   │   ...    │
│ Backend │    │ Adapter   │   │          │
└────┬────┘    └─────┬─────┘   └──────────┘
     │               │
     └───────┬───────┘
             │
   ┌─────────▼───────────────────────────────┐
   │            @visimer dependency chain      │
   │  @visimer/core       MermaidWysiwygEditor │  headless engine
   │  @visimer/dom        MermaidCanvasView    │  interactive canvas
   │  @visimer/codemirror MermaidCodeMirror    │  official code panel
   │  mermaid@12          fallback + export    │  readonly rendering + type detection
   └──────────────────────────────────────────┘
```

### Three Layers + Replaceable Interface

| Layer | Files | Responsibility |
|-------|-------|----------------|
| **Controller** | `sync.ts`, `dialog.ts`, `shortcut.ts`, `trigger.ts` | Host bridging, Dialog lifecycle, trigger sources |
| **Adapters** | `registry.ts`, `visimer-full-adapter.ts`, `readonly-adapter.ts` | Capability routing, adapter interface |
| **Render** | `visimer-backend.ts`, `backend.ts` | `RenderBackend` interface + Visimer implementation |
| **Utils** | `exporter.ts`, `exporter-ui.ts`, `i18n.ts` | High-res export pipeline, export dropdown, i18n |

### Adapter Registration (Loop over 22 types)

```typescript
// In index.ts onload:
DIAGRAM_TYPES
  .filter(t => t.capability === "edit")   // 22 editable types
  .forEach(t => registry.register(new VisimerFullAdapter({ type: t.id })));
registry.register(new ReadOnlyAdapter());  // wildcard fallback
```

## 🛠️ Development

### Requirements

- Node.js ≥ 20.10.0
- npm ≥ 10.0.0

### Commands

```bash
npm install                # Install dependencies
npm run dev                # Vite dev mode (watch build → dist/index.js)
npm run build              # Production build (single-file CJS + auto package.zip at root)
npm test                   # Unit tests (Vitest)
npm run verify:acceptance  # Acceptance suite
```

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@visimer/core` | ^1.1.2 | Visimer headless editing engine |
| `@visimer/dom` | ^1.1.2 | Visimer interactive canvas |
| `@visimer/codemirror` | ^1.1.2 | Visimer official code panel |
| `@codemirror/commands` | ^6.11 | CodeMirror commands (Undo/Redo) |
| `@codemirror/language` | ^6.12 | CodeMirror language highlighting |
| `@codemirror/state` | ^6.7 | CodeMirror state management |
| `@codemirror/view` | ^6.43 | CodeMirror view layer |
| `mermaid` | ^12.0.0 | Mermaid rendering core + type detection |
| `siyuan` | 1.2.7 | Siyuan types + `fetchSyncPost` |

## 📚 Project Structure

```
siyuan-mermaid-wysiwyg-editor/
├── src/
│   ├── controller/         # Host bridge: sync / dialog / shortcut / trigger / settings
│   ├── adapters/           # Adapter layer: registry / visimer-full-adapter / readonly-adapter
│   ├── render/             # Render layer: backend interface + visimer-backend implementation
│   ├── utils/              # Utilities: exporter / exporter-ui / i18n / fence
│   ├── __tests__/          # Shared fixtures
│   ├── acceptance/         # Acceptance tests
│   └── index.ts            # Plugin entry (onload wires everything)
├── dist/                   # Build artifact (single-file CJS + static assets)
│   ├── index.js            #   Main entry
│   ├── plugin.json         #   Manifest
│   ├── icon.png            #   Icon
│   ├── preview.png         #   Preview image
│   └── README.md / LICENSE #   Docs
├── package.zip             # Root-level bundle (auto from vite-plugin-zip-pack)
├── plugin.json             # Siyuan plugin manifest
├── vite.config.mts         # Vite config (inlineDynamicImports + named exports + zipPack)
├── gh_release.sh           # One-click release (extracts CHANGELOG section + uploads package.zip)
└── tsconfig.json
```

## 🎯 Known Limitations

| Limitation | Reason |
|------------|--------|
| **zenuml** is read-only | Visimer designed it as render-only |
| **Siyuan version** requirement | ≥ 3.8.0 (uses `fetchSyncPost` + `click-blockicon` event) |
| **Build artifact ~10.7MB** | Includes CodeMirror + Visimer + Mermaid (no tree-shaking possible) |
| **No dynamic import() at runtime** | Siyuan plugins run in CJS — `inlineDynamicImports` in rollup keeps everything inlined |

## 📄 License

MIT
