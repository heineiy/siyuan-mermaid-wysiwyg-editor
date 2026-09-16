针对思源笔记（SiYuan）插件开发以及实现 Mermaid 双向修改（WYSIWYG 实时无损同步）的特定场景，选型逻辑需要发生根本性的变化。
由于思源笔记是基于 Electron/纯前端技术栈，且其底层核心是一个基于 ProseMirror 深度定制的块级（Block）富文本/Markdown 编辑器，我们需要选择一个轻量、无状态（Stateless）、能完美融入 DOM/块级更新，且不对宿主环境产生侵入的成熟开源方案。
在这条赛道上，有一个比 Visimer 更成熟、更新活跃、且专门为这类笔记/Markdown 编辑器插件设计的顶级开源实现：
## 👑 最佳开源选择：Mermaid-WYSIWYG (By dynamic-plus) / Mermaid-Editor 核心思想与技术平替
在思源插件的生态下，要做到“双向修改”，目前最成熟且最契合思源块级架构的开源方案并非上述的巨型白板（如 Draw.io，它太重了，无法嵌入思源的 Block 块），而是基于官方 mermaid 解析器配合局部节点捕获的“轻量化桥接结构”。
我们可以直接对比最适合思源插件开发的两个工业级开源思路：
## 方案 A：直接复用 Visimer / mermaid-wysiwyg 的 CST 方案（极致的 Mermaid 原生体验）

* 为什么适合思源： 思源笔记的 Mermaid 本质上就是一个 code-block（代码块）。Visimer 或同类 CST 库最大的优势是完全不改变底层数据结构。
* 双向修改逻辑：
1. 用户在思源中点击“可视化编辑”按钮。
   2. 插件读取该代码块的 markdown 源码（纯文本）。
   3. 插件调用组件，将文本转化为可视化图形。
   4. 当用户在图形上拖拽节点、修改文字时，组件通过 CST 直接修改原文本字符串，并反向写入思源的代码块属性/内容中。
* 优势： 100% 兼容思源的原生 Markdown 存储，即使插件被卸载，笔记内容也完全不会损坏。

## 方案 B：集成 [React Flow](https://github.com/xyflow/xyflow) / [Vue Flow](https://github.com/bcakmakoglu/vue-flow) 作为可视化过渡层（工业级稳定性）

* 为什么更成熟： 如果你觉得 Visimer 在处理复杂多图表、极端语法或大规模节点时不够稳定（Visimer 目前对某些复杂子图的 CST 映射仍有边缘 Bug），行业内最成熟的做法是用 React Flow 做 UI 渲染，通过中介层转换。
* 双向修改逻辑：
* 正向： 提取思源 Mermaid 文本 ➡️ 通过官方 @mermaid-js/parser 解析成 AST ➡️ 转换为 React Flow 的 nodes / edges 数组 ➡️ 渲染画布。
   * 反向： 用户在画布上拖拽/改字 ➡️ 监听 React Flow 的 onNodesChange ➡️ 自写一个简单的 ast-to-mermaid 生成器 ➡️ 将更新后的文本写回思源。

------------------------------
## 🛠️ 思源笔记插件落地：核心架构与避坑指南
思源笔记的插件开发（TS/JS）有其特殊的 API 限制，要实现完美的双向同步，请务必参考以下架构设计：
## 1. 触发与挂载点：使用 ProseMirror 扩展或 block-icon

* 不要尝试去重写思源自带的 Mermaid 渲染引擎（这会导致思源核心升级时插件崩溃）。
* 推荐做法： 监听思源的块级菜单（利用插件 API 注册 block-icon 或快捷键）。当用户点击一个 Mermaid 块时，弹出一个思源标准的 Dialog（对话框组件） 或在当前块下方展开一个 Shadow DOM 画布。

## 2. 数据通信流（核心双向绑定代码思路）
思源提供了非常强大的块级读写 API，你的双向修改应该遵循以下闭环：

// 1. 当用户点击“可视化编辑”时，获取思源当前块的源码const blockId = "当前选中的Mermaid块ID";const response = await window.siYuan.api.block.getBlockMarkdown({ id: blockId });let mermaidCode = response.markdown; // 提取出的纯 Mermaid 文本
// 2. 将 mermaidCode 喂给你的编辑器组件（如 Visimer 或 React-Flow 桥接器）
initCanvas(mermaidCode, {
    onGraphChange: async (newCode) => {
        // 3. 【反向同步】当用户在画布上拖拽或改字时，实时/防抖写入思源
        await window.siYuan.api.block.updateBlock({
            id: blockId,
            data: `\`\`\`mermaid\n${newCode}\n\`\`\``
        });
    }
});

## 3. 关键性能坑：防抖（Debounce）
在双向修改时，用户拖拽节点会触发极其高频的坐标更新事件。

* 绝对不要在 onDrag 事件中同步调用思源的 updateBlock API，这会导致思源的内核索引锁死、卡顿甚至崩溃。
* 解决方案： 文字修改可以即时同步（或者失去焦点 onBlur 时同步），而节点拖拽定位必须加上 debounce(fn, 500)，或者在用户松开鼠标（onMouseUp / onDragEnd）时，才触发一次性的思源数据写入。

## 💡 最终选型临门一脚

* 如果你追求“开发快、轻量、完全保留 Mermaid 原汁原味”：
直接将 Visimer 编译为独立的一个 UMD/ESM 模块，作为你思源插件 Dialog 弹窗里的渲染核心。Visimer 虽新，但它正是为了这种“纯代码块双向微调”的场景而生的，和思源的契合度极高。
* 如果你追求“绝对不能出 Bug、要能处理成百上千个节点的超大流程图”：
花一点时间，采用 React Flow / Vue Flow，自己写一个轻量的 Mermaid-AST 转换器。虽然前期开发成本高一点点，但其画布的流畅度、缩放、多选、网格吸附等功能的成熟度，是任何纯 Mermaid 改装版都无法比拟的。

https://github.com/inkeep/visimer
