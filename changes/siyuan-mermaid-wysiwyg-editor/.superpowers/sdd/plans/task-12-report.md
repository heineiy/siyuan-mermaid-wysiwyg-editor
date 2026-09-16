# T12 任务报告：写回竞态防护

- **任务**：T12（tasks.md）— 写回竞态防护（w5-race-error，REQ-RACE-001 / design.md D4）
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`b282f26`（docs: w4-sync-core review report）
- **Commit head**：`3abfaf9`（`feat: 写回竞态防护（TDD）`）

## 一、实现内容（锁 + 版本号的具体设计）

| 文件 | 说明 |
| --- | --- |
| `src/controller/sync.ts`（修改，full 分支） | 在 T11 预留的 `writeFenced` seam 内包装竞态防护，三态闭环：<br>**`editVersion`（编辑版本号）**：每次 `onGraphChange` 递增（destroy 后短路不递增）——新编辑意味着旧回调已过期。<br>**`isSyncing`（写回锁）**：`updateBlock` 进行中置 true、完成后置 false；锁内到达的写回**不并发执行第二个 updateBlock**（思源内核并发写同块不保证顺序），记入 `pendingCode` 由当前写回完成后补写。<br>**`pendingCode`（锁内最新代码）**：只存最新到达者（防抖已保证其输入即最新内容），当前写回完成后立即补写——**绝不丢弃最后一次编辑**。<br>**版本号比对（收尾门）**：写回携带触发时版本快照 v；完成后若 `editVersion > v` 说明期间有新编辑，旧结果不得"收尾"——只允许补写 pendingCode 最新版本，否则留给下一次防抖/flush 周期，绝不把旧版本当最终态覆盖新编辑。<br>**错误最小处理（不越界 T13）**：updateBlock 拒绝/同步抛错仅释放锁 + 补写 pending（`Promise.resolve(...).then(complete, complete)` + try/catch），UI 报错留待 T13。 |
| `src/controller/sync-race.test.ts`（新增） | vitest + happy-dom，**updateBlock 为可控异步 Promise（deferred 手动 resolve）**精确模拟"写回进行中"；防抖窗口注入 `debounceMs: 1`（竞态语义与窗口时长无关，真实定时器 + async/await 驱动，规避 fake timers 与微任务交错）。6 用例：① 写回进行中收到新编辑 → 锁内不并发、完成后补写最后一次编辑 ② isSyncing 期间连续两次新编辑不丢 → 最终写回携带最后一次结果 ③ 版本号比对 → 过期回调旧内容绝不写入，updateBlock data 序列严格单调"新"且最后一次恒为最新 wrapFence ④ flushWrite 竞态 → flush 的是最新版本（完成后立即补写，不等防抖窗口）⑤ flushWrite 竞态无新编辑 → 不重复写回 ⑥ destroy 在写回进行中 → 仍补写最后一次编辑（不丢最后编辑）。 |

## 二、TDD 证据

**RED**（先写测试，sync.ts 未加锁）：
```
$ npm test -- sync-race
 FAIL  src/controller/sync-race.test.ts (4 failed | 2 passed)
  - 写回进行中收到新 onGraphChange → expected "vi.fn()" to be called 1 times, but got 2 times
  - isSyncing 期间连续两次新编辑不丢 → got 2 times (并发 updateBlock，旧回调未被丢弃)
  - 版本号比对 → got 2 times
  - flushWrite 竞态 / destroy 竞态 → got 2 times（无锁时 flush/flush-in-destroy 直接并发写回）
```

**GREEN**（实现后）：
```
$ npm test -- sync-race
 ✓ src/controller/sync-race.test.ts (6 tests) 238ms
 Test Files  1 passed (1)      Tests  6 passed (6)
```

**零回归 + 类型 + 构建**：
```
$ npm test -- sync        # 2 files, 16 passed（T11 的 10 条 sync 测试 + 本任务 6 条，零回归）
$ npm test                # 14 files, 156 passed（基线 150 + 本任务 6）
$ npx tsc --noEmit        # exit 0（TSC_OK）
$ npm run build           # 成功
```

## 三、自审

- **不丢最后一次编辑**：pendingCode 只存锁内最新到达者且立即补写；6 用例覆盖"写回进行中 + 1 次新编辑 / 2 次新编辑 / flush / destroy"四路，最终 updateBlock 内容恒等于最后一次编辑的 wrapFence 结果。
- **过期回调绝不写入**：isSyncing 锁严格串行化（无并发 updateBlock）+ 防抖只透传最新代码 + pendingCode 只存最新 → 写回 data 序列单调"新"，测试 3 显式断言序列 `[wrap(A), wrap(B)]` 且最后调用 = wrap(B)。
- **版本号比对语义**：`editVersion > versionAtTrigger` 为"旧结果不得收尾"的决策门（写回期间有新编辑时只允许补写 pendingCode 最新版本，否则留给下一次防抖/flush 周期）；与 spec「写回携带其触发时的版本快照 v，完成后若 editVersion > v 不要用旧结果收尾」逐字对齐。注：pendingCode 仅在 editVersion 已前进后才可能被置位，故条件实际等价于 `pendingCode !== null`——版本号比对是规格要求的机制表述与防御性门禁，观测语义由测试 3 保证。
- **T11 API 兼容**：`initEditorSession` / `InitEditorSessionOptions` / `EditorSession{flushWrite,destroy}` 签名零改动；T11 的 10 条 sync 测试全绿（`npm test -- sync` 16 passed）。
- **不越界 T13**：错误处理保持 T11 最小兜底——updateBlock 拒绝/同步抛错仅释放锁 + 不丢 pending，无 UI/无错误提示（T13 职责）；注释标明 seam。
- **无泄漏**：destroy 幂等语义保持（destroyed 标志 + flush + adapter.destroy + cancel）；destroy 后 onGraphChange 不递增版本号、不写回；若 destroy 时写回在途且 flush 产生 pendingCode，完成后补写该最后编辑（符合"不丢最后一次编辑"）。
- **pristine**：仅修改 `src/controller/sync.ts`（+40/−3）+ 新增 `src/controller/sync-race.test.ts`；`changes/` 规划工件未触碰；dist 产物 gitignore。

## 四、Concerns

1. **版本号比对与 pendingCode 的重叠性**：如上分析，`editVersion > v` 与 `pendingCode !== null` 在实际可达状态中等价，版本比对更偏向"规格机制表述 + 防御性门禁"而非独立可观测行为；测试按规格以可观测结果（旧内容绝不写入、最终 = 最后编辑）断言。若后续要求版本号比对有独立可观测分支，可考虑把"新编辑在防抖周期内（pendingCode 为空）"的情形做成显式快写路径——但当前语义下防抖周期已保证收敛，无必要。
2. **destroy 后补写语义**：destroy 时写回在途 + flush 产生 pendingCode，会在 destroy 完成后补写一次 updateBlock（保护最后一次编辑）。与 T11「destroy 后不再写回」的既有测试不冲突（其 updateBlock 同步，无在途写回）；属设计意图（REQ-RACE-001 绝不丢最后编辑），特此记录。
3. **T13 seam 提示**：本任务的 complete 拒绝路径已为 T13 预留（仅释放锁 + 补写 pending）；T13 可在该处接入错误 UI 而无需改动锁结构。
4. **思源内手动验证未执行**（需真实思源宿主）：真实 `window.siYuan.api.block.updateBlock` 的并发行为（本次以锁严格串行化规避）与完成时序需在思源内人工确认；测试侧证据命令全绿。

## 五、Commit

- `3abfaf9` `feat: 写回竞态防护（TDD）`（src/controller/sync.ts、sync-race.test.ts；372 insertions / 3 deletions）
