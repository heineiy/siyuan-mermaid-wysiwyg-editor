# T13 任务报告：语法/加载错误保护（REQ-ERROR-001）

- **任务**：T13（tasks.md）— 语法错误保护（w5-race-error，REQ-ERROR-001 / design.md Risks）
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`4fc5cd5`（docs: T12 任务报告）
- **Commit head**：`9218619`（`feat: 语法/加载错误保护（TDD）`）

## 一、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/adapters/flowchart-adapter.ts`（修改） | **修复 w4 review Important 待办**：`init` 由同步 `void` 改为 `async init(...): Promise<void>`，**转发 `backend.init` 的 Promise 拒绝**（`await backend.init(...)`）。此前真实 Visimer 懒加载失败会产生未处理拒绝、sync.ts try/catch 接不到；现在拒绝沿 adapter.init 返回值上报，上层可 await 捕获。TS 上 `Promise<void>` 兼容 `DiagramAdapter` 的 `void` 契约（同 T7 ReadOnlyAdapter 做法）。幂等语义不变（先 destroy 再重建；失败后 destroy 仍清理持有的后端）。 |
| `src/controller/sync.ts`（修改，full 分支） | 把 T11 的"最小兜底"完善为完整 REQ-ERROR-001 语义：新增 `writeClosed` 标志，`onGraphChange` 增加 `writeClosed` 短路；`try { await Promise.resolve(adapter.init(...)) } catch` 内：错误 message 渲染进画布容器（`可视化编辑器加载失败：{message}`，`.mermaid-wysiwyg-error` div）→ `writeClosed = true` + `writeDebounce.cancel()`（清掉 init 期间已聚合变更）→ 返回**降级失败会话**（`flushWrite` 零副作用；`destroy` 幂等调用 `adapter.destroy()` 清理）。语义：init 失败 → 不建立写回通道（适配器残留 onGraphChange / flushWrite 均不可达）→ updateBlock 零调用（保留原文本）。 |
| `src/controller/sync.ts`（修改，readonly 分支） | 兜底 `new ReadOnlyAdapter()` 注入 `onError`：渲染/解析失败（含语法错误）时把 `只读预览渲染失败：{message}` 渲染进画布容器；只读路径本无写回通道（updateBlock 恒零）。unknown 分支保持现状（渲染失败静默 + 提示文案已覆盖，不越界）。 |
| `src/controller/sync.ts`（修改，写回 seam） | updateBlock 拒绝/同步抛错路径确认 T12 语义：`.then(complete, complete)` + try/catch 只释放锁 + 补写 pending，**不把错误扩散为未捕获异常**（注释更新为 REQ-ERROR-001 表述）。 |
| `src/controller/error-handling.test.ts`（新增） | 5 用例，见下。 |
| `src/adapters/flowchart-adapter.test.ts`（修改） | 新增 2 用例（init 转发 backend 拒绝 + 缺省 Visimer 懒加载失败拒绝），原 8 条零改动零回归。 |

**运行期错误通道说明**：`RenderBackend` 接口无运行期渲染错误通道（仅 init/destroy/onGraphChange）——任务允许"没有则保持现状并报告说明"。只读路径的运行期渲染错误通道（`ReadOnlyAdapter.onError`）本期已接入 sync；Visimer 全编辑路径的运行期错误通道待真实 `@visimer/dom` 接线（T6/T11 记录的 mount 接线点，editor 'change'/hooks）时接入，本期接口无此通道。

## 二、TDD 证据

**RED**（先写测试，实现未改）：
```
$ npx vitest run src/controller/error-handling.test.ts src/adapters/flowchart-adapter.test.ts
 Test Files  2 failed (2)      Tests  4 failed | 11 passed (15)      Errors  2 errors
 - × init 失败后不建立写回通道：适配器残留 onGraphChange / flushWrite 均不触发 updateBlock
   （旧实现 flushWrite 触发写回 → updateBlock 被调）
 - × 只读渲染失败 → 错误提示渲染进容器、零 updateBlock（旧实现未注入 onError，无提示）
 - × FlowChartAdapter 转发 ×2：Unhandled Rejection（VisimerLoadError / "visimer load failed"）——
   正是 w4 review Important：adapter.init 未转发 backend.init 拒绝
```

**GREEN**（实现后）：
```
$ npx vitest run src/controller/error-handling.test.ts src/adapters/flowchart-adapter.test.ts
 Test Files  2 passed (2)      Tests  15 passed (15)   （无 unhandled rejection）
```

**零回归 + 类型 + 构建 + 证据命令**：
```
$ npm test                # 15 files, 163 passed（基线 156 + 本任务 7：error-handling 5 + flowchart 2）
$ npm test -- error-handling   # 1 file, 5 passed（任务证据命令）
$ npx tsc --noEmit        # exit 0（TSC_OK）
$ npm run build           # 成功
```

## 三、自审

- **原文本零写回**：init 失败后 `writeClosed` + 失败会话 noop `flushWrite` + `writeDebounce.cancel()` 三重保障，updateBlock 零调用；测试覆盖 VisimerLoadError / 任意 Error / init 失败后残留 onGraphChange + flushWrite / readonly 渲染失败四种场景，全部断言 updateBlock 零调用。
- **无未捕获异常**：FlowChartAdapter 转发 Promise 后，RED 阶段的两个 Unhandled Rejection 消失；错误路径全部被 `Promise.resolve(...).then/catch` 或 async/await try/catch 吸收。
- **T11/T12 零回归**：`sync.test.ts` 10 + `sync-race.test.ts` 6 全绿（163/163）；`initEditorSession` / `InitEditorSessionOptions` / `EditorSession` 签名零改动；FlowChartAdapter 原 8 测试零改动零回归（async 化后重复 init/destroy 幂等语义不变，断言仍同步成立——FakeBackend.init 无 await 前副作用，initCalls 同步记录）。
- **会话生命周期**：失败会话 destroy 幂等（destroyed 标志 + adapter.destroy 幂等——FlowChartAdapter/ReadOnlyAdapter/VisimerBackend 均幂等）；正常会话 destroy 语义不变。
- **pristine**：仅修改 `src/adapters/flowchart-adapter.ts`、`src/adapters/flowchart-adapter.test.ts`、`src/controller/sync.ts` + 新增 `src/controller/error-handling.test.ts`；`changes/` 规划工件未触碰；dist 产物 gitignore。

## 四、Concerns

1. **运行期错误通道缺位（全编辑路径）**：`RenderBackend` 接口无运行期渲染错误通道，Visimer 全编辑路径的运行期错误提示需在真实 @visimer/dom 接线时以 mount hooks 接入（任务允许，已按"保持现状并报告"处理）。
2. **未知类型（unknown）分支渲染失败静默**：unknown 分支兜底 ReadOnlyAdapter 渲染失败仍静默（未注入 onError），但提示文案"该图类型暂不支持可视化编辑"已渲染进容器，用户信息不缺失；未越界扩展。
3. **失败会话的 updateBlock 拒绝语义**：写回失败（updateBlock 拒绝）仍沿用 T12 语义（释放锁 + 补写 pending，无 UI 提示）——REQ-ERROR-001 的"错误提示"范围聚焦解析/渲染异常（init/onError），写回失败提示不在本期（T12 已确认不扩散未捕获）。
4. **思源内手动验证未执行**（需真实思源宿主）：真实 `window.siYuan.api.block.updateBlock` 拒绝路径与 Visimer 真实加载在思源环境的人工确认列入 w6-acceptance。

## 五、Commit

- `9218619` `feat: 语法/加载错误保护（TDD）`（4 files changed, 311 insertions / 11 deletions）
