# Proposal: 思源 Mermaid 双向可视化编辑插件

## Why

思源笔记中，Mermaid 图表本质上是 code-block（代码块），用户只能逐字编辑纯文本：

- 无法可视化拖拽节点、连线、双击改字，维护复杂流程图效率低。
- 语法错误只能在代码块里逐字排查，缺乏即时可视化反馈。
- 现有开源方案要么过重（Draw.io 无法嵌入思源块级结构），要么破坏原生 Markdown 存储，没有"既贴合思源块级架构、又不破坏原生存储"的双向 WYSIWYG 方案。

本变更交付一个思源插件：Mermaid 代码块上通过 block-icon / 快捷键弹出可视化画布，画布编辑 **无损且实时** 写回代码块纯文本；反之修改代码块文本，画布同步重渲染。核心约束：**100% 兼容思源原生 Markdown 存储，插件卸载后笔记内容零损坏**。

## What Changes

新增一个 TypeScript 思源插件（vite + esbuild + plugin.json 标准打包），首期实现：

1. **触发与挂载**：在 Mermaid 代码块 block-icon 注入入口 + 注册快捷键（如 Alt+M）；点击后弹出思源标准 Dialog 承载画布。
2. **正向数据流**：`block.getBlockMarkdown` 读取代码块源码 → 剥离 ` ```mermaid ` 围栏得到纯文本 → 交渲染后端（Visimer / mermaid-wysiwyg CST）渲染可编辑画布。
3. **反向数据流**：画布拖拽 / 双击改字 → CST 直接修改原文本 → `onGraphChange(newCode)` → 防抖调度 → `block.updateBlock` 围栏包回写。
4. **防抖红线**：拖拽等高帧事件绝不在 onDrag 中同步写回；文字修改 onBlur 即时写回，节点拖拽 debounce 500ms + onDragEnd 强制 flush；写回期间加 `isSyncing` 锁 + 版本号比对防竞态。
5. **图类型适配层（§8 兼容扩展）**：统一 `DiagramAdapter` 接口 + 注册表；能力探测（full / readonly / 未知）与降级路由；flowchart 全编辑（Visimer CST），sequence / class / gantt 等降级只读预览；渲染后端抽象为可替换接口并预留 VueFlow 桥接插槽（本期不实现 VueFlow 代码）。
6. **错误处理**：Mermaid 语法错误捕获后保留原文本不写回，画布提示错误；写回竞态丢弃过期回调。

## Scope

### In-Scope

- 插件工程骨架（plugin.json / vite / 入口注册）与打包产物。
- block-icon + 快捷键触发，Dialog 画布生命周期管理。
- 双向同步闭环：getBlockMarkdown → 围栏剥离 → Visimer 渲染 → CST 改写 → 防抖 → updateBlock 写回。
- flowchart 图类型全编辑适配器（Visimer CST 后端）。
- 适配器注册表 + 能力探测 + 降级路由（含只读预览）。
- 渲染后端可替换接口与 VueFlow 插槽预留（接口 + 文档，无 VueFlow 实现）。
- 语法错误处理与写回竞态防护。
- §11 四项验收用例可测。

### Out-of-Scope

- 不重写 / 替换思源自带 Mermaid 渲染引擎。
- 不做 Draw.io 类巨型白板。
- 不做多端离线协同的写冲突合并。
- 本期不实现其它图类型的可视化编辑（仅降级只读）。
- 本期不编写 VueFlow 桥接后端实际代码。

## Impact

| 影响面 | 说明 |
| --- | --- |
| 思源笔记数据 | 仅通过 `block.getBlockMarkdown` / `block.updateBlock` 读写代码块源码，文本往返零失真；插件卸载后笔记内容不受损 |
| 思源渲染引擎 | 零侵入，不修改 ProseMirror DOM 结构 |
| 构建产物 | 新增独立插件包（dist/），供思源市场或手动安装 |
| 后续图类型扩展 | 通过注册表新增 full 适配器即可接入，双向同步 / 防抖 / 写回逻辑零改动 |

## Proof of Completion

- 在思源（或模拟环境）中：flowchart 画布拖拽 / 改字后，代码块源码准确、无损更新；修改代码块文本后重开画布正确反映。
- 拖拽高频事件不卡死内核：防抖生效，无连续落盘风暴（可观测写回次数）。
- 模拟新增一个 full 图类型适配器：无需改动双向同步 / 防抖 / 写回逻辑即可接入（§8 兼容设计验证）。
- 非支持图类型走只读预览降级路径，不产生坏数据写回。
