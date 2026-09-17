# Siyuan Mermaid WYSIWYG Editor Plugin

> Siyuan Note plugin —— bring bidirectional visual editing to your Mermaid code blocks.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Mermaid](https://img.shields.io/badge/Mermaid-12.x-ff3670)](https://mermaid.js.org/)
[![Visimer](https://img.shields.io/badge/Visimer-1.1.x-7c3aed)](https://github.com/visimer/visimer)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

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
| **Delete entity** | Select + `Delete` / `Backspace` or toolbar `🗑 Delete` |
| **Create edge** | Switch to `Connect` tool → drag from node A to node B |
| **Add node** | Toolbar `+ Node` dropdown → auto-append to graph |
| **Switch direction** (flowchart) | Toolbar `TD/LR/BT/RL` dropdown |
| **Add participant** (sequence) | Toolbar `+ Participant` dropdown |
| **Undo / Redo** | `Ctrl+Z` / `Ctrl+Y` or toolbar `↶ Undo` / `↷ Redo` |
| **Pan canvas** | Drag empty area |
| **Zoom canvas** | `Ctrl + wheel` or bottom-right zoom controls |
| **Auto-fit** | Bottom-right `⛶` button / auto fitView on open |

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
git clone https://github.com/your-org/siyuan-mermaid-wysiwyg-editor.git
cd siyuan-mermaid-wysiwyg-editor

# 2. Install dependencies
npm install

# 3. Build (output: dist/index.js — single-file CJS artifact)
npm run build

# 4. Copy to Siyuan plugin directory
# macOS:   ~/Library/Application Support/Siyuan/conf/plugins/mermaid-wysiwyg-editor/
# Windows: %APPDATA%\SiYuan\conf\plugins\mermaid-wysiwyg-editor\
cp -r dist/* ~/Library/Application\ Support/Siyuan/conf/plugins/mermaid-wysiwyg-editor/

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
   │  mermaid@12          fallback renderer    │  readonly + type detection
   └──────────────────────────────────────────┘
```

### Three Layers + Replaceable Interface

| Layer | File | Responsibility |
|-------|------|----------------|
| **Controller** | `controller/sync.ts`, `dialog.ts`, `shortcut.ts` | Host bridging, Dialog lifecycle, trigger sources |
| **Adapters** | `adapters/registry.ts`, `visimer-full-adapter.ts`, `readonly-adapter.ts` | Capability routing, adapter interface |
| **Render** | `render/visimer-backend.ts`, `render/backend.ts` | `RenderBackend` interface + Visimer implementation |

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
npm install               # Install dependencies
npm run dev               # Vite dev mode (watch build)
npm run build             # Production build → dist/index.js (single-file CJS)
npm test                  # Unit tests (Vitest)
npm run test:acceptance   # Acceptance tests
npm run typecheck         # TypeScript type-check only
npm run lint              # ESLint
npm run verify:acceptance # Full acceptance suite
```

### Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `@visimer/core` | ^1.1.2 | Visimer headless editing engine |
| `@visimer/dom` | ^1.1.2 | Visimer interactive canvas |
| `@visimer/codemirror` | ^1.1.2 | Visimer official code panel |
| `mermaid` | ^12.0.0 | Mermaid rendering core + type detection |
| `siyuan` | ^0.0.1 | Siyuan types + `fetchSyncPost` |
| `@codemirror/*` | ^6.x | CodeMirror 6 (required by MermaidCodeMirror) |

## 📚 Project Structure

```
siyuan-mermaid-wysiwyg-editor/
├── src/
│   ├── controller/         # Host bridge: sync / dialog / shortcut / trigger / settings
│   ├── adapters/           # Adapter layer: registry / visimer-full-adapter / readonly-adapter
│   ├── render/             # Render layer: backend interface + visimer-backend implementation
│   ├── __tests__/          # Shared fixtures
│   ├── acceptance/         # Acceptance tests
│   └── index.ts            # Plugin entry (onload wires everything)
├── dist/index.js           # Build artifact (single-file CJS, Siyuan loader requirement)
├── plugin.json             # Siyuan plugin manifest
├── vite.config.mts         # Vite config (inlineDynamicImports + named exports)
└── tsconfig.json
```

## 🎯 Known Limitations

| Limitation | Reason |
|------------|--------|
| **zenuml** is read-only | Visimer designed it as render-only |
| **GitGraph** drag nodes not supported | Branch-centric; Visimer only edits text |
| **Siyuan version** requirement | ≥ 3.8.0 (uses `fetchSyncPost` + `click-blockicon` event) |
| **Build artifact 10.6MB** | Includes CodeMirror + Visimer + Mermaid (no tree-shaking possible) |

## 📄 License

MIT
