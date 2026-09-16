# Design: 思源 Mermaid 双向可视化编辑插件

## 相关事实与约束

- 思源笔记基于 Electron / 纯前端，底层为 ProseMirror 深度定制的块级编辑器；Mermaid 在思源中即 code-block。
- 插件只能经思源官方 API（`block.getBlockMarkdown` / `block.updateBlock`）读写块内容；**100% 兼容原生 Markdown 存储、卸载零损坏**是硬约束。
- 拖拽/连线会产生高频坐标事件，`updateBlock` 同步调用会锁死思源内核索引——防抖是红线（源自 need.md 与设计文档 §7）。
- `Alt+M` 已被思源 Electron 全局快捷键"隐藏/显示窗口"占用且不可修改；`Ctrl+M`、`Ctrl+Alt+M`、`Ctrl+Shift+M` 均被默认占用。
- 设计文档 v1.0 为技术基线（选型已定：方案A Visimer / CST 为主，方案B VueFlow 桥接兜底）。
- 本期范围：flowchart 全编辑 + 其它类型降级只读 + §8 兼容层（可替换后端**接口预留**，不写 VueFlow 实现）。

## Goals

- 提供 Mermaid 代码块的双向 WYSIWYG 编辑闭环，文本往返零失真。
- 高频编辑不卡死思源内核（防抖 + flush 兜底）。
- 图类型与渲染后端解耦：新增图类型 / 替换后端不触碰双向同步核心逻辑。

## Non-Goals

- 不重写思源 Mermaid 渲染引擎；不做 Draw.io 类白板；不做多端离线协同合并。
- 本期不实现其它图类型可视化编辑（仅降级）；不实现 VueFlow 桥接代码。

## Decisions

### D1：渲染后端选型 — Visimer（mermaid-wysiwyg / CST）

- **Choice**：渲染后端采用 Visimer 的 CST 方案，直接以原文本字符串为语义模型，用户操作即 CST 修改文本，触发 `onGraphChange(newCode)`。
- **Rationale**：不改底层数据结构、文本往返零失真，与思源 code-block 契合度最高（设计文档 §3 对比结论）。
- **Alternatives**：React Flow / Vue Flow 桥接（方案B）——画布交互成熟，但需自写 AST↔Mermaid 转换器，保真度依赖转换器完整性。
- **Consequences**：复杂子图存在 Visimer 边缘 Bug 风险；该风险由适配层与可替换后端接口（D5）隔离，可随时切后端而不动同步核心。

### D2：画布挂载 — 思源标准 Dialog

- **Choice**：block-icon / 快捷键触发后，弹出思源标准 Dialog 承载画布。
- **Rationale**：交互清晰、实现复杂度最低，规避 Shadow DOM 内嵌的样式继承、事件冒泡、块布局重排问题（设计文档 §5.2）。
- **Alternatives**：块下方 Shadow DOM 内嵌——无浮层但副作用多。
- **Consequences**：编辑上下文从文档切换到弹窗；写回仍以 blockId 为锚，无位置漂移风险。

### D3：双向同步分层 — 插件核心层 + 适配器层 + 渲染后端层

- **Choice**：三层架构：核心层（Dialog 生命周期、防抖调度、双向同步协调、类型路由）→ 适配器层（DiagramAdapter 注册表）→ 渲染后端层（RenderBackend 接口，Visimer 为实现）。
- **Rationale**：数据流单一（正向 getBlockMarkdown→剥离围栏→后端 init；反向 onGraphChange→防抖→updateBlock 围栏包回），每层职责可独立替换与测试。
- **Alternatives**：单层直连——开发快但后续扩展图类型 / 换后端必然触碰同步逻辑。
- **Consequences**：前期多一层抽象成本，换取 §8 兼容扩展的平滑接入。

### D4：防抖与写回 — 双通道分级同步 + 竞态锁

- **Choice**：文字修改 onBlur 即时写回；节点拖拽 debounce(500ms) 且 onDragEnd 强制 flush；写回期间 `isSyncing` 锁 + 编辑版本号比对丢弃过期回调。
- **Rationale**：文字频率低可即时同步；拖拽频率高必须聚合；锁与版本号防止"读回旧文本覆盖新编辑"竞态（设计文档 §7）。
- **Alternatives**：全量即时同步——会锁死内核索引，红线禁止。
- **Consequences**：写回有 ≤500ms 延迟，换取内核稳定；onDragEnd flush 保证最后一次变更不丢。

### D5：适配层与可替换后端 — 注册表 + 能力探测 + RenderBackend 接口

- **Choice**：统一 `DiagramAdapter`（type / supportLevel: 'full'|'readonly' / init / destroy）注册表；打开编辑前解析首行判定图类型并路由（full→可视化编辑，readonly→只读预览，未知→兜底只读提示）；渲染后端抽象为 `RenderBackend` 接口，Visimer 为实现之一，VueFlow 桥接以接口 + 文档预留插槽（本期无实现代码）。
- **Rationale**：图类型与后端一对一解耦，新增类型 / 换后端均不动双向同步核心（设计文档 §8 验收标准 4）。
- **Alternatives**：硬编码 flowchart 逻辑——迭代 Visimer 升级或暴露 Bug 时无退路。
- **Consequences**：需维护适配器清单；Bug 类型可临时降级 readonly 规避故障。

### D6：快捷键 — 默认 `Shift+Alt+M` + 可配置

- **Choice**：默认 `Shift+Alt+M`（思源官方默认未占用），并提供插件设置项允许用户改键。
- **Rationale**：`Alt+M` 被思源 Electron 全局快捷键"隐藏/显示窗口"占用且不可修改；`Ctrl+M`/`Ctrl+Alt+M`/`Ctrl+Shift+M` 均被默认占用；可配置项兜底用户自定义快捷键冲突。
- **Alternatives**：沿用设计文档的 `Alt+M`——与思源全局快捷键直接冲突，被排除。
- **Consequences**：默认键非最顺手（三键组合），但零冲突；用户可一键改键。

## Risks

| 风险 | 缓解 | 验证证据 |
| --- | --- | --- |
| Visimer 对复杂子图 CST 映射有边缘 Bug | D5 可替换后端接口 + 临时降级 readonly | 验收用例 4：模拟新增 full 适配器零改动接入；复杂子图用例降级路径生效 |
| 拖拽高频写回卡死内核 | D4 防抖 + flush + 锁 | 验收用例 2：拖拽期间无连续落盘风暴（可观测写回次数） |
| 写回竞态丢/覆盖数据 | D4 版本号比对丢弃过期回调 | 验收用例 1：写回期间新编辑不被旧回调覆盖 |
| 围栏剥离/包回破坏原生存储 | 严格按 `` ```mermaid\n${code}\n``` `` 组装，剥离只去首行与结尾围栏 | 验收用例 1 + 3：卸载插件后内容零损坏、重开画布正确反映 |
| 快捷键冲突 | D6 默认键查证 + 可配置 | 设置中改键后旧键失效、新键生效 |
