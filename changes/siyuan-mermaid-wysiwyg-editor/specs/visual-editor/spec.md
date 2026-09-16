# 能力规格

## Purpose（可选）

思源笔记中 Mermaid 图表为 code-block，仅能纯文本编辑。本能力交付一个思源插件，提供双向 WYSIWYG 可视化编辑：画布拖拽/改字无损实时写回代码块文本，代码块文本修改同步重渲染画布。首期 flowchart 全编辑，sequence / class / gantt 及其它未知类型降级只读预览。核心约束：100% 兼容思源原生 Markdown 存储，插件卸载后笔记内容零损坏。

## ADDED Requirements

### Requirement: REQ-TRIGGER-001 — block-icon 触发入口

插件 SHALL 在每个 Mermaid 代码块的 block-icon 区域注入"可视化编辑"操作入口。

#### Scenario: 鼠标悬停 Mermaid 代码块并点击入口

- **WHEN** 用户将鼠标悬停到 ` ```mermaid ` 代码块并点击注入的可视化编辑按钮
- **THEN** 弹出思源标准 Dialog，Dialog 中初始化可视化画布

#### Scenario: 非 Mermaid 代码块不显示入口

- **WHEN** 用户悬停在普通文本块或非 mermaid 语言代码块上
- **THEN** 不显示可视化编辑按钮

### Requirement: REQ-TRIGGER-002 — 快捷键触发（默认 Shift+Alt+M）

插件 SHALL 注册快捷键（默认 `Shift+Alt+M`），当光标位于 Mermaid 代码块内时触发可视化编辑。冲突规避依据：`Alt+M` 已被思源 Electron 全局快捷键"隐藏/显示窗口"占用（不可查询、不可修改）；`Ctrl+M`（内联公式）、`Ctrl+Alt+M`（备注）、`Ctrl+Shift+M`（跳转到父块上一个块）均被思源默认快捷键占用；`Shift+Alt+M` 在思源官方默认快捷键中未占用。

#### Scenario: 光标在 Mermaid 代码块内按快捷键

- **WHEN** 用户将光标置于 Mermaid 代码块内并按下 `Shift+Alt+M`
- **THEN** 弹出与 block-icon 相同的编辑 Dialog

#### Scenario: 光标不在 Mermaid 代码块内按快捷键

- **WHEN** 用户光标不在 Mermaid 代码块内按下 `Shift+Alt+M`
- **THEN** 不弹出 Dialog，且不产生任何副作用

### Requirement: REQ-TRIGGER-003 — 快捷键可配置

插件 SHALL 提供快捷键配置项（默认 `Shift+Alt+M`），用户可在插件设置中修改，以规避与其自定义思源快捷键或第三方插件快捷键的冲突。

#### Scenario: 用户修改快捷键

- **WHEN** 用户在插件设置中将快捷键改为 `Shift+Alt+V` 并保存
- **THEN** 后续按 `Shift+Alt+V` 触发可视化编辑，原默认键不再触发

### Requirement: REQ-READ-001 — 读取代码块源码并剥离围栏

插件 SHALL 通过 `window.siYuan.api.block.getBlockMarkdown({ id })` 获取 Mermaid 代码块源码，并剥离 ` ```mermaid ` 首行与结尾围栏得到纯 Mermaid 文本。

#### Scenario: 正常 Mermaid 代码块

- **WHEN** 插件获取到形如 `` ```mermaid\nflowchart LR\n  A-->B\n``` `` 的源码
- **THEN** 提取出的纯文本为 `flowchart LR\n  A-->B`，不包含围栏行

#### Scenario: 代码块含前导/尾随空行

- **WHEN** 源码围栏内首尾存在空行
- **THEN** 提取的纯文本保留空行语义，写回后围栏结构不破坏、内容与原始可见内容一致

### Requirement: REQ-RENDER-001 — flowchart 全编辑渲染

插件 SHALL 将提取的纯 Mermaid 文本交给 Visimer（mermaid-wysiwyg / CST）渲染为可编辑画布，支持节点拖拽、连线调整、双击修改节点/连线文本。

#### Scenario: 打开含 flowchart 的代码块

- **WHEN** 用户对 flowchart 类型代码块触发可视化编辑且语法合法
- **THEN** 画布按源码渲染出全部节点与连线，节点可拖拽，节点文本可双击编辑

### Requirement: REQ-WRITE-001 — 写回链路

画布发生编辑后，插件 SHALL 组装完整代码块内容（`` ```mermaid\n${newCode}\n``` ``）并通过 `window.siYuan.api.block.updateBlock({ id, data })` 写回。

#### Scenario: 拖拽结束写回

- **WHEN** 用户在画布上完成一次节点拖拽（onDragEnd）
- **THEN** 至多 500ms 内以围栏包回的新文本调用一次 `updateBlock`，且代码块源码与画布状态一致

#### Scenario: 双击改字写回

- **WHEN** 用户在画布上双击节点并修改文本后失焦（onBlur）
- **THEN** 立即以新文本写回一次 `updateBlock`

### Requirement: REQ-DEBOUNCE-001 — 高频事件防抖红线

插件 SHALL 不在 onDrag / onMouseMove 等高频事件中同步调用 `updateBlock`；节点拖拽类变更 MUST 经 debounce(500ms) 或 onDragEnd 聚合后写回。

#### Scenario: 持续拖拽期间不落盘

- **WHEN** 用户按住节点持续拖拽超过 2 秒且中间无停顿
- **THEN** 拖拽期间不产生任何 `updateBlock` 调用，仅在停止拖拽（或停顿 500ms）后写回一次

### Requirement: REQ-RACE-001 — 写回竞态防护

插件 SHALL 在写回期间加 `isSyncing` 锁并通过编辑版本号比对丢弃过期回调，防止读回旧文本覆盖新编辑。

#### Scenario: 写回期间发生新编辑

- **WHEN** 一次写回尚未完成时用户又产生新编辑
- **THEN** 旧编辑的回调被丢弃，最终代码块内容等于最后一次编辑结果

### Requirement: REQ-ADAPTER-001 — 适配器注册表

插件 SHALL 提供统一 `DiagramAdapter` 接口（含 `type`、`supportLevel: 'full' | 'readonly'`、`init`、`destroy`）与注册表，每种图类型一个适配器实例。

#### Scenario: 注册新适配器

- **WHEN** 向注册表注册一个 `type: 'flowchart'` 的 full 适配器
- **THEN** 该类型进入可视化编辑路径，且双向同步 / 防抖 / 写回逻辑零改动

### Requirement: REQ-DEGRADE-001 — 能力探测与降级路由

插件 SHALL 在打开编辑前解析 Mermaid 首行判定图类型并按能力路由：full → 可视化编辑；readonly → 只读预览；未知 → 兜底只读并提示"暂不支持可视化编辑"。

#### Scenario: flowchart 走全编辑

- **WHEN** 检测到 `flowchart` 类型且注册表有 full 适配器
- **THEN** 打开可编辑画布

#### Scenario: sequence 走只读预览

- **WHEN** 检测到 `sequenceDiagram` 类型且注册表仅有 readonly 适配器
- **THEN** 打开只读预览（渲染 mermaid，禁编辑），不调用 `updateBlock`

#### Scenario: 未知类型兜底

- **WHEN** 检测到未知/不支持的类型
- **THEN** 打开只读预览并展示"该图类型暂不支持可视化编辑"提示，不写回任何数据

### Requirement: REQ-BACKEND-001 — 渲染后端可替换接口

插件 SHALL 将渲染后端抽象为可替换接口（`RenderBackend`：`init(code, opts)` / `destroy()` / 变更回调），Visimer 为实现之一，并为 VueFlow 桥接预留插槽（接口 + 文档，本期无 VueFlow 实现代码）。

#### Scenario: 仅凭接口替换后端

- **WHEN** 实现一个满足 `RenderBackend` 接口的新后端并注入
- **THEN** 适配器与双向同步核心无需改动即可使用新后端

### Requirement: REQ-ERROR-001 — 语法错误保护

插件 SHALL 捕获 Mermaid 解析/渲染异常，异常时保留原文本不写回，并在画布上提示错误。

#### Scenario: 代码块含语法错误

- **WHEN** 打开的 Mermaid 文本解析失败
- **THEN** 画布展示错误提示，且代码块源码不被修改（无 `updateBlock` 调用）

### Requirement: REQ-STORAGE-001 — 原生存储兼容

插件 SHALL 仅通过思源官方块级 API 读写内容，不修改底层数据结构；卸载插件后笔记内容零损坏。

#### Scenario: 插件卸载后校验

- **WHEN** 使用插件完成编辑后卸载插件并重开思源
- **THEN** 原 Mermaid 代码块仍以合法围栏文本存在，内容与卸载前一致

### Requirement: REQ-BUILD-001 — 标准插件构建产物

插件 SHALL 以 TypeScript + vite 构建为思源标准插件包（plugin.json 清单 + 入口脚本），构建命令产出可安装的 `dist/`。

#### Scenario: 执行构建命令

- **WHEN** 执行项目构建命令（如 `npm run build`）
- **THEN** 生成含 `plugin.json` 与入口 JS 的 `dist/` 产物，可通过思源插件市场/手动安装加载
