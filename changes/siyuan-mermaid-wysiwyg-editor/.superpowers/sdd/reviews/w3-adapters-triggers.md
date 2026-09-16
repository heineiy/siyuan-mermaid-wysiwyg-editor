# Wave 3 Review Report: w3-adapters-triggers

**审查范围**：T6 flowchart 适配器 / T7 只读降级适配器 / T9 block-icon 触发 / T10 快捷键 + 可配置设置

**审查方式**：控制器人工代码审查（实现核对 + 全量测试 + tsc + 构建）

## 验收核对

| 证据命令 | 结果 |
| --- | --- |
| `npm test` | ✅ 140/140 通过（新增 T6 8 + T7 11 + T9 11 + T10 34），输出干净 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run build` | ✅ 构建通过，dist/index.js 正常，`require('siyuan')` 保持外部化 |

## 规格符合性

- **REQ-RENDER-001（T6）**：FlowChartAdapter（type=flowchart, supportLevel=full）纯装配——幂等 init（先 destroy 重建）、backend 注入（缺省工厂）、onGraphChange 透传；未泄漏 T11 同步/防抖逻辑；未越权改共享文件。
- **REQ-DEGRADE-001（T7）**：ReadOnlyAdapter（type="*" 兜底, readonly）——mermaid@12 只读渲染（initialize({startOnLoad:false}) + render），渲染失败回调 onError 且**零 onGraphChange**（禁编辑、无写回）；destroy 幂等 + 渲染竞态守卫；renderer 构造注入使单测不依赖真实浏览器能力。
- **REQ-TRIGGER-001（T9）**：click-blockicon 事件核实（负载 menu/protyle/blockElements），mermaid 判定双信号（data-subtype + code.language-mermaid 兜底），非 mermaid 零副作用；卸载函数幂等。
- **REQ-TRIGGER-002/003（T10）**：默认 Shift+Alt+M 精确匹配（含大小写）；**防冲突回归测试**固定 Alt+M / Ctrl+M / Ctrl+Alt+M / Ctrl+Shift+M 均不命中；光标块内判定复用 isMermaidCodeBlock；改键即时生效（旧键失效、新键生效）；settings 走 loadData/saveData（storage 抽象可测）+ 官方 Setting 类最小界面。

## 代码质量

- 纯函数与副作用分离（parseShortcut/matchesShortcut/isMermaidCodeBlock 可单测）；settings 用 storage 注入抽象；index.ts 保留 T11 接线注释。
- 新增 64 测试全部行为可证伪（fake backend / mock siyuan / jsdom 键盘事件）。

## 发现

- **Important（记录，不阻塞）**：真实宿主手动验证未执行（思源环境不可用）——T9 事件菜单注入、T10 Setting 界面与 Electron 键盘传递、T7 真实 mermaid 渲染（DOMPurify/canvas）均需在思源宿主内人工验收；已在任务报告标注接线点。
- **Info**：T6 与 T7 在共享 worktree 并行提交 package.json 依赖变更（mermaid@12），最终状态一致、无冲突。
- **Info**：block 判定 data-subtype 存在版本差异，已由 language-mermaid 兜底 + 双信号单测固定。

## 结论

**verdict: pass** — 规格符合、测试与构建全绿、代码质量良好；宿主手动验证项列入 w6-acceptance 与发布前检查清单。
