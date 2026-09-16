# 执行合同

## Intent Lock

- **变更名称**：siyuan-mermaid-wysiwyg-editor（思源 Mermaid 双向可视化编辑插件）
- **要解决的问题**：思源中 Mermaid 仅为 code-block，只能纯文本编辑，无法可视化拖拽节点/连线/双击改字，语法错误缺乏即时可视化反馈；现有开源方案要么过重（Draw.io）、要么破坏原生 Markdown 存储，缺乏既贴合思源块级架构又不破坏原生存储的双向 WYSIWYG 方案。
- **范围内**：构建标准思源 TS 插件；block-icon + 快捷键（默认 `Shift+Alt+M`，可配置）触发；Dialog 承载画布；双向闭环（getBlockMarkdown → 剥离围栏 → Visimer/CST 渲染 → 拖拽/改字 → 防抖 → updateBlock 写回）；flowchart 全编辑；sequence/class/gantt 及未知类型降级只读预览；适配器注册表 + 能力探测 + 可替换 RenderBackend 接口预留（§8 兼容层，不写 VueFlow 代码）；语法错误保护与写回竞态锁。
- **范围外**：不重写思源 Mermaid 渲染引擎；不做 Draw.io 类白板；不做多端离线协同合并；本期不实现其它图类型可视化编辑；不实现 VueFlow 桥接实现代码；不实现白板级缩放/多选/网格吸附等重型交互。

## Approved Behavior

- **已批准需求摘要**：14 条 ADDED 需求（见 specs/visual-editor/spec.md）：触发（block-icon / 快捷键 / 可配置）、围栏剥离读取、flowchart 全编辑渲染、写回链路、防抖红线、竞态防护、适配器注册表、降级路由、可替换后端接口、语法错误保护、原生存储兼容、标准构建产物。
- **关键场景**：
  - 拖拽 onDragEnd / 停顿 500ms 后围栏包回写回一次；拖拽期间零 `updateBlock` 调用。
  - 双击改字 onBlur 立即写回。
  - flowchart→全编辑；sequenceDiagram→只读预览；未知类型→兜底只读提示；均不写回。
  - `Alt+M` 等已被思源占用的组合不得作为默认快捷键。
  - 语法错误保留原文本、无写回、画布提示。
- **验收检查**：§11 四项（无损写回+卸载零损坏 / 拖拽无落盘风暴 / 改文本重开画布正确反映 / 模拟新增 full 适配器零改动接入），证据命令见 tasks.md T14。

## Design Constraints

- **架构约束**：三层分层——插件核心层（Dialog 生命周期 / 防抖调度 / 双向同步 / 类型路由）→ 适配器层（DiagramAdapter 注册表）→ 渲染后端层（RenderBackend 接口，Visimer 为实现）；数据流单一。
- **接口约束**：`DiagramAdapter { type; supportLevel: 'full'|'readonly'; init(code, opts); destroy() }`；`RenderBackend { init(code, opts); destroy(); onGraphChange }`；渲染后端可替换，VueFlow 以接口 + 文档预留（无实现代码）。
- **依赖约束**：可视化渲染依赖 Visimer（mermaid-wysiwyg）；构建依赖 vite + esbuild + TypeScript；运行时仅依赖思源官方 `block.getBlockMarkdown` / `block.updateBlock` 与 Dialog 组件；不得改动思源 ProseMirror DOM。
- **数据约束**：文本往返零失真——剥离仅去首行围栏与结尾围栏，写回严格组装 `` ```mermaid\n${newCode}\n``` ``；写回期间 `isSyncing` 锁 + 编辑版本号比对丢弃过期回调；语法异常不写回坏数据。

## Execution Plan

full 流程：先运行 `ssf execution recommend <change-dir> [--wave <id>:<parallel|serial>:<task,...>[:<depends-on,...>]]`，按任务量与 wave 策略列出可用方式并推荐一种，持久化 recommendation receipt；Agent 展示候选项与理由；用户通过 `--confirm` 明确确认所选执行模式（DP-4）；选择非推荐方式时须记录 `--acknowledge-recommendation`。批准后 `ssf execution plan` 将计划持久化到 `<change>/.superpowers/sdd/execution-plan.json`（计划的持久化控制面，非本合同一部分）。Batch Inline 为串行模式，不得描述为并行。

## Execution Waves

每个 wave 必须有唯一 ID；仅当依赖 wave 的 review receipt 为 `pass` 后，后续 wave 方可开始。`parallel` 仅表示宿主支持并发派发时允许同时执行；不支持并发时必须明确报告，不得把并行计划悄然改写为串行执行。

### Wave 1

- **Wave ID**：w1-foundation
- **任务**：T1（工程骨架/构建）、T2（围栏剥离）、T3（防抖调度器）、T4（RenderBackend 接口 + Visimer 实现）
- **依赖 wave**：无
- **策略**：`parallel`
- **目标**：地基就绪——可构建产物、核心纯函数与后端接口可单测
- **输入**：tasks.md T1–T4
- **输出**：构建通过；fence / debounce / backend 单测绿
- **完成标准**：`npm run build` 产出 dist/plugin.json；`npm test -- fence debounce backend` 全绿
- **Review gate**：review report 路径 `changes/siyuan-mermaid-wysiwyg-editor/.superpowers/sdd/review-w1.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

### Wave 2

- **Wave ID**：w2-adapter-layer
- **任务**：T5（适配器注册表 + 能力探测 + 降级路由）、T8（Dialog 生命周期与画布挂载）
- **依赖 wave**：w1-foundation
- **策略**：`parallel`
- **目标**：适配层与画布容器可用
- **输入**：tasks.md T5、T8
- **输出**：registry/router 单测绿；Dialog 打开/关闭/销毁联动
- **完成标准**：`npm test -- adapter-router dialog` 全绿
- **Review gate**：review report 路径 `.superpowers/sdd/review-w2.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

### Wave 3

- **Wave ID**：w3-adapters-triggers
- **任务**：T6（flowchart 适配器）、T7（只读降级适配器）、T9（block-icon 触发）、T10（快捷键 + 可配置）
- **依赖 wave**：w2-adapter-layer
- **策略**：`parallel`
- **目标**：各图类型适配器与两个触发入口落地
- **输入**：tasks.md T6、T7、T9、T10
- **输出**：flowchart 全编辑 + 只读降级可路由；block-icon 仅 mermaid 块显示；快捷键默认 Shift+Alt+M 且可配置
- **完成标准**：`npm test -- adapter shortcut` 全绿；思源内手动验证 block-icon 与快捷键
- **Review gate**：review report 路径 `.superpowers/sdd/review-w3.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

### Wave 4

- **Wave ID**：w4-sync-core
- **任务**：T11（双向同步协调器）
- **依赖 wave**：w3-adapters-triggers
- **策略**：`serial`
- **目标**：正向/反向数据流闭环
- **输入**：tasks.md T11
- **输出**：onGraphChange→防抖→围栏包回→updateBlock 完整链路
- **完成标准**：`npm test -- sync` 全绿
- **Review gate**：review report 路径 `.superpowers/sdd/review-w4.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

### Wave 5

- **Wave ID**：w5-race-error
- **任务**：T12（写回竞态防护）、T13（语法错误保护）
- **依赖 wave**：w4-sync-core
- **策略**：`parallel`
- **目标**：同步链路加固
- **输入**：tasks.md T12、T13
- **输出**：isSyncing 锁 + 版本号比对；异常不写回 + 画布提示
- **完成标准**：`npm test -- sync-race error-handling` 全绿
- **Review gate**：review report 路径 `.superpowers/sdd/review-w5.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

### Wave 6

- **Wave ID**：w6-acceptance
- **任务**：T14（验收用例套件）
- **依赖 wave**：w5-race-error
- **策略**：`serial`
- **目标**：§11 四项验收全绿，可交付
- **输入**：tasks.md T14
- **输出**：验收证据（无损写回 / 无落盘风暴 / 重开反映 / 新增适配器零改动）
- **完成标准**：`npm test && npm run verify:acceptance` 全绿
- **Review gate**：review report 路径 `.superpowers/sdd/review-w6.md`，base/head SHA 由 git 记录，review receipt（`pass` | `fail`）

## Test Obligations

- **必须先从失败测试开始的行为**：围栏剥离（REQ-READ-001）、防抖红线（REQ-DEBOUNCE-001）、路由三路判定（REQ-DEGRADE-001）、竞态防护（REQ-RACE-001）、语法错误保护（REQ-ERROR-001）。
- **必需的边界情况**：围栏含前导/尾随空行；异常/非法 Mermaid 输入；非 mermaid 代码块不触发；未知图类型兜底；拖拽持续 >2s 无落盘；写回期间新编辑覆盖旧回调；改键后旧键失效。
- **回归敏感区域**：写回链路（围栏组装格式）、防抖（绝不 onDrag 同步写回）、快捷键默认值（不得与思源占用键冲突）、渲染后端接口稳定性（可替换性）。

## Execution Mode

- **可用方式与推荐**：`ssf execution recommend <change-dir> [--wave <id>:<parallel|serial>:<task,...>[:<depends-on,...>]]`
- **用户确认的模式**：待 DP-4 确认（`sdd` | `inline` | `batch-inline`）
- **推荐理由 / 项目事实**：14 任务、6 wave、含 TDD 纪律要求与逐批审查，待 recommend 输出后确认
- **非推荐选择的风险确认**：`--acknowledge-recommendation`（若适用）
- **执行计划命令**：`ssf execution plan <change-dir> --mode <mode> --confirm --reason <text> --wave <id>:<parallel|serial>:<task,...>[:<depends-on,...>] [--acknowledge-recommendation]`
- **允许的修订**：保留/升级为 `sdd` 需重新 recommend + `--confirm` 新 revision；不允许降级：`ssf execution revise <change-dir> --mode sdd --confirm --reason <text> --wave ... [--acknowledge-recommendation]`
- **计划 revision / artifact hash**：待执行计划生成后记录

## Verification Dimensions

| 维度 | 状态 | 发现 |
|------|------|------|
| Completeness | Pending | 14 需求 ↔ 14 任务映射已核（见 tasks.md Delivery/Proof Map），无未映射需求 |
| Correctness | Pending | — |
| Coherence | Pending | — |

**总体结论**：Pending

## Review Gates

- **强制审查点**：每个 Execution Wave（w1–w6）完成后记录 `ssf execution review` review receipt，verdict 必须为 `pass` 才能进入依赖 wave 或收口。
- **阻塞类别**：依赖 wave 未过、review receipt 为 `fail`、review receipt 缺失或过期（与 base/head SHA 不符）。
- **收口条件**：所有当前 wave 均有 `pass` review receipt，且测试证据 `test_result: pass` 已持久化。

## Escalation Rules

- **何时回退到 `specifying`**：需求/范围发生实质变更（如新增图类型可视化编辑、变更存储约束）、specs 与 proposal 漂移，需重开 spec-writer。
- **何时回退到 `bridging`**：契约与工件失配（proposal 范围超出契约 Scope Fence、specs 需求未在契约反映、design 约束变更），需重建契约。
- **何时不得继续实现**：无 execution-contract.md；契约未获 DP-3 批准；无当前 `ssf execution plan`（DP-4 未确认）；任一 wave 的 review receipt 缺失或 `fail`；实现中遇到未调查的测试失败/构建错误（须先经 bug-investigator）。
