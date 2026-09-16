# T9 任务报告：block-icon 触发入口

- **任务**：T9（tasks.md）— block-icon 触发入口
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`03d20ac`（docs: T7 任务报告（只读降级适配器））
- **Commit head**：见文末（`feat: block-icon 触发入口（TDD）` + `docs: T9 任务报告（block-icon 触发入口）`）

## 一、siyuan 事件 / Menu / DOM 核实结论

以 `node_modules/siyuan` 类型定义为准（siyuan@1.2.7），并对照思源前端源码（gutter/index.ts、wysiwyg/codeBlock.ts）、官方 plugin-sample 与社区插件模式交叉核实：

1. **`click-blockicon` 事件负载**（`siyuan.d.ts:191-195`，IEventBusMap）：`{ menu: subMenu, protyle: IProtyle, blockElements: HTMLElement[] }`。思源在用户点击块级 block-icon 后弹出块菜单（subMenu）并广播该事件；插件同步向 `detail.menu.addItem(...)` 加项，该项即出现在弹出的块菜单中——这是官方 plugin-sample / 社区插件的通用注入模式（区别于「插件自建 Menu 再 open」）。
2. **subMenu API**（`types/index.d.ts:1020-1028`）：`menus: IMenu[]`、`addItem(menu: IMenu): void`、`addSeparator(index?, id?)`。
3. **IMenu 形态**（`types/index.d.ts:780-799`）：`{ checked?, iconClass?, icon?, iconHTML?, label?, click?: (element, event) => boolean | void | Promise<...>, type?: "separator"|"submenu"|"readonly"|"empty", accelerator?, ... }`。
4. **Menu 类**（`siyuan.d.ts:863-888`）：`constructor(id?, closeCB?)`、`isOpen`、`element`、`addItem(option: IMenu): HTMLElement`、`addSeparator()`、`open(options: IPosition)`、`close()`；`IPosition = { x, y, w?, h?, isLeft? }`（`types/index.d.ts:656-662`）。
5. **EventBus**（`siyuan.d.ts:816-836`）：`on<K extends TEventBus>(type, listener: (event: CustomEvent<D>) => any)` / `off(type, listener)` / `emit(type, detail?)`；`Plugin.eventBus: EventBus`（`siyuan.d.ts:590`）。
6. **块 DOM 约定**（社区官方文档 + 思源前端源码）：
   - `data-node-id` = 块 id；`data-type` = 块类型；`data-subtype` = 块子类型（社区插件开发 Quick Start 明示）。
   - 代码块：`data-type="code-block"`；Mermaid 语言标记为 `data-subtype="mermaid"`（Lute 渲染 code-block 时以语言名作为 subtype 写到块元素上）。
   - 兜底信号：代码元素带 `language-mermaid` class（思源 wysiwyg `codeBlock.ts` 按 `className.startsWith("language-")` 解析语言，证实 `language-*` class 约定）。
   - `isMermaidCodeBlock` 采用「`data-type="code-block"` +（`data-subtype="mermaid"` **或** 内含 `code.language-mermaid`）」双信号，主信号 + 渲染形态差异兜底。

## 二、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/controller/trigger.ts` | ① 纯函数 `isMermaidCodeBlock(el): el is HTMLElement`（DOM 判定，type guard 便于收窄）；② `registerBlockIconTrigger(opts): () => void`：监听 `click-blockicon`，命中 Mermaid 代码块时注入「可视化编辑」菜单项（icon `iconGraph`），点击回调 `onOpenMermaidEditor(blockId)`（blockId 取自块 DOM `data-node-id`）。注入路径二选一：缺省向事件自带的 `detail.menu`（subMenu，思源原生块菜单）加项；传入 `menu`（siyuan Menu）时改用该实例 `addItem` + `open`（锚点为被点击块 bounding rect）。非 mermaid（普通块/其他语言代码块/空 blockElements）早退零副作用。返回卸载函数：`off("click-blockicon", listener)`，幂等（unregistered 标志兜底）。**只交付触发**：无同步/updateBlock/后端组装逻辑。 |
| `src/controller/trigger.test.ts` | vitest + happy-dom + `vi.mock("siyuan")`（对齐 T8 dialog.test.ts 基建；MockEventBus/MockSubMenu/MockMenu 对齐思源真实 API 形态）。11 个用例：`isMermaidCodeBlock` 5 项（data-subtype 形态 / language-mermaid class 形态 / 其他语言 code 块 / 普通块 / null·undefined）+ `registerBlockIconTrigger` 6 项（mermaid 注入菜单并回调 blockId / 非 mermaid code 块零副作用 / 普通块零副作用 / 空 blockElements 零副作用 / 卸载移除监听且幂等 / 传入 menu 时改由独立 Menu 承载并 open 且事件 subMenu 不被注入）。 |
| `src/index.ts` | `onload()` 注册 `registerBlockIconTrigger`；`onOpenMermaidEditor` 临时实现仅调 T8 的 `openEditorDialog`（title/width/height，onDestroy 空 stub），T11 TODO 注释标明将注入真实双向同步初始化；`onunload()` 调用卸载函数并置空引用。 |

## 三、TDD 证据

**RED**（仅写测试、未实现 `trigger.ts`）：
```
$ npm test
 FAIL  src/controller/trigger.test.ts [ src/controller/trigger.test.ts ]
Error: Failed to resolve import "./trigger" from "src/controller/trigger.test.ts". Does the file exist?
```
（测试文件加载失败：0 test，Failed Suites 1，其余基线 95 全绿。）

**GREEN**（实现 `trigger.ts` 后）：
```
$ npm test
 ✓ src/controller/trigger.test.ts (11 tests) 20ms
 Test Files  10 passed (10)      Tests  106 passed (106)
```

**全量 + 类型 + 构建**：
```
$ npm test      # 10 files, 106 passed（基线 95 + 本任务 11）
$ npx tsc --noEmit   # exit 0
$ npm run build      # dist/index.js 2.69 kB，产物仍 require('siyuan')
```

## 四、自审

- **任务覆盖**：悬停/点击 Mermaid 块 block-icon → 块菜单出现「可视化编辑」✓（注入事件 subMenu）；非 mermaid 块不显示、零副作用 ✓（早退 + 3 类负例测试）；blockId 取自 `data-node-id` ✓；卸载函数移除监听且幂等 ✓；`src/index.ts` 注册 + 卸载接线 ✓。
- **非 mermaid 零副作用**：早退发生在任何菜单对象访问之前；测试覆盖「非 mermaid code 块 / 普通块 / 空 blockElements」三种负例均断言 `addItem` 未被调用。
- **卸载干净**：`off` 传同一 listener 引用；幂等标志防重复 off；`onunload` 卸载后置空引用。
- **无 T11 逻辑泄漏**：`trigger.ts` 无同步/updateBlock/围栏/后端工厂逻辑；`index.ts` 的 `onOpenMermaidEditor` 仅开 Dialog，T11 接管点以注释显式标注（读块源码 → 剥围栏 → 组后端 → 挂画布），onDestroy 为空 stub 并标注归属 T11。
- **类型守卫**：`isMermaidCodeBlock` 返回 `el is HTMLElement`，注册处理器内收窄后无需二次非空断言。
- **测试基建一致性**：沿用 T8 的 `vi.hoisted` + `vi.mock("siyuan")` + `@vitest-environment happy-dom`；未触碰 `src/test-utils/siyuan.ts` / `vite.config.mts`（trigger.ts 仅类型导入 siyuan，运行时无 siyuan 依赖）。

## 五、Concerns

1. **思源内手动验证未执行**（需真实思源宿主）：事件注入 subMenu 的「随块菜单弹出」行为基于思源官方实现与 plugin-sample 模式核实，但真实宿主联动（菜单项展示、iconGraph 图标可用性、`data-subtype="mermaid"` 实际渲染）需后续在思源内人工确认——已按任务「证据命令：思源内手动验证 + npm test」完成测试侧，思源侧待宿主验证。
2. **`data-subtype` 主信号的版本差异**：若某些思源版本未将语言写到块元素 `data-subtype`，由 `code.language-mermaid` 兜底信号承接；两信号均已单测固定，宿主验证时若有出入只需调整判定函数与对应用例。
3. **`menu` 参数语义**：任务签名含 `menu?: Menu`，本实现将其定义为「可选独立 Menu 承载（addItem + open，锚点为块位置）」，缺省走思源原生 subMenu 注入。若后续设计意图是「始终自建 Menu」，只需在 index.ts 传入 menu 实例即可，触发层 API 不变。

## 六、Commit

- `feat: block-icon 触发入口（TDD）`（src/controller/trigger.ts、src/controller/trigger.test.ts、src/index.ts）
- `docs: T9 任务报告（block-icon 触发入口）`（本报告）
