# Wave 4 Review Report: w4-sync-core

**审查范围**：T11 双向同步协调器（正向流 + 反向流闭环）

**审查方式**：控制器人工代码审查（实现核对 + 全量测试 + tsc + 构建）

## 验收核对

| 证据命令 | 结果 |
| --- | --- |
| `npm test` | ✅ 150/150 通过（新增 sync 10），输出干净 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run build` | ✅ 构建通过 |

## 规格符合性

- **REQ-READ-001（正向流）**：initEditorSession 按 getBlockMarkdown → stripFence → route 三路路由（full 适配器 / readonly / unknown 提示）实现；fence 剥离复用 T2。
- **REQ-WRITE-001 + REQ-DEBOUNCE-001（反向流）**：onGraphChange 全部经 createDebounce(500ms) 聚合（高频零写回，停顿 500ms 恰好一次）；flushWrite 覆盖 onBlur/关闭时立即写回一次；写回严格 wrapFence(newCode)；readonly/unknown 会话零 updateBlock。
- **闭环完整性**：index.ts 已由 stub 替换为真实组装（onload 组装 registry + 注册 FlowChartAdapter/ReadOnlyAdapter；openEditorDialog → initEditorSession；关闭时 destroy）；Dialog onDestroy 钩子 flush + 会话销毁。
- **边界**：backend init 拒绝有最小兜底（错误渲染进容器、无未捕获异常），未实现 T12/T13 逻辑（seam 清晰）。

## 代码质量

- 注入式依赖（getBlockMarkdown/updateBlock/registry）全部可测；防抖 + flush + destroy 生命周期完整；无泄漏。
- AdapterOptions.backend 由必填改可选：与"缺省工厂"语义对齐，T5/T6 测试零回归（合理类型修正，已记录）。

## 发现

- **Important（记录，转 T13）**：FlowChartAdapter.init 为同步 void，未转发 backend.init 的 Promise 拒绝；真实 Visimer 加载失败会产生未处理拒绝，sync.ts try/catch 接不到。T13 语法/加载错误保护时需让适配器转发 Promise（已记录待办）。
- **Info**：真实宿主手动验证（getBlockMarkdown/updateBlock 实际形状、Dialog 挂载）待思源环境确认，列入 w6-acceptance。

## 结论

**verdict: pass** — 双向闭环符合规格、测试与构建全绿、代码质量良好；Important 项为 T13 的前置待办。
