# T14 任务报告：§11 四项验收用例套件（w6-acceptance）

- **任务**：T14（tasks.md）— 验收用例套件
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`b2f8581`（docs: w5-race-error review report）
- **Commit head**：`89f3578`（`test: §11 四项验收用例套件（TDD）`）

## 一、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/acceptance/acceptance.test.ts`（新增） | §11 四项验收用例套件（7 用例）。**全链路组装**：真实 `AdapterRegistry` + 真实 `FlowChartAdapter` + 真实 `ReadOnlyAdapter` + 真实 `route` + 真实 `initEditorSession` + 真实 `stripFence`/`wrapFence`/`createDebounce`；**仅 mock 注入项**——宿主 `getBlockMarkdown`/`updateBlock`（vi.fn）与渲染后端（REQ-BACKEND-001 可替换 seam 注入 fake，真实 @visimer/dom 未发布）。防抖经 `vi.useFakeTimers` + `advanceTimersByTimeAsync` 控制（async 推进使写回 `complete` 微任务链在断言前落地）。 |
| `package.json`（修改） | 新增脚本 `"verify:acceptance": "vitest run src/acceptance/acceptance.test.ts"`（证据命令）。 |

**测试基础设施（内联于测试文件，非重复造轮子）**：
- `FakeRenderBackend`：实现 `RenderBackend` 接口——`initCalls` 断言画布 init 收到的 code/container/onGraphChange；`emitChange(code)` 可编程触发 onGraphChange（模拟拖拽/改字）；`rejectInitWith` 可触发 init 拒绝（错误保护链路）；
- `makeBackendFactory`：`BackendFactory` seam 装配（FlowChartAdapter 构造注入，对齐 REQ-BACKEND-001）；
- `XmindAdapter`：假想 full 适配器（验收④），复用 FlowChartAdapter 构造（后端装配/init/destroy 全委托），仅更换图类型标签 `type="xmind"`——模拟「新增 full 图类型适配器零改动接入」；
- `openSession()`：全链路组装会话（对齐 `src/index.ts` onload 接线），每会话新建 fake 后端与 registry。

## 二、TDD 证据（RED / GREEN）

实现（T2–T13）已全部落地（基线 163 全绿），本任务交付为「验收用例 + 证据脚本」。TDD 纪律以**可证伪性变异检查**落实：先写测试，再对核心做一次性变异验证套件能检出回归（RED），复原后全绿（GREEN）。

**RED-1（防抖窗口变异）**：临时把 `sync.ts` 的 `DEFAULT_DEBOUNCE_MS` 由 `500` 改为 `10`：
```
FAIL  验收② … onGraphChange × 100 次 … → 拖拽期间 updateBlock 零调用；停顿 500ms 后恰好 1 次
FAIL  验收② … 多轮拖拽突发 … → 整轮写回次数有界 = 突发轮数（无风暴）
Tests  2 failed | 5 passed (7)
```
→ 套件检出「无落盘风暴」红线被破坏。

**RED-2（围栏损坏变异）**：临时给 `fence.ts` 的 `wrapFence` 返回值追加 `\n## corrupt`：
```
FAIL  验收① 拖拽+改字 → 写回内容 = wrapFence(最新编辑)；destroy（模拟卸载）后内容零损坏
FAIL  验收② … ×2
FAIL  验收④ 注册假想 full 适配器（type=xmind）→ route 返回 full → 同一 initEditorSession 双向同步零改动
Tests  4 failed | 3 passed (7)
```
→ 所有断言 `wrapFence` 精确输出的用例（①/②/④）均检出损坏；验收③仅验证正向流（无写回断言），不受影响——证明四项验收各管一段、可证伪。

**GREEN（复原后）**：
```
$ npm run verify:acceptance      # 1 file, 7 passed
$ npm test                       # 16 files, 170 passed（基线 163 + 验收 7，零回归）
$ npx tsc --noEmit               # exit 0（TSC_OK）
$ npm run build                  # 成功
```

## 三、四项验收 → 测试名 → 断言要点映射表

| 验收（tasks.md T14 / design.md Risks 证据列） | 测试名 | 断言要点 |
| --- | --- | --- |
| ① 拖拽/改字无损更新、卸载零损坏 | `验收① … 拖拽+改字 → 写回内容 = wrapFence(最新编辑)；destroy（模拟卸载）后内容零损坏` | 连续两次编辑（拖拽+改字）期间 updateBlock 零调用；`destroy`（模拟卸载）flush 未决写回**恰好 1 次**；写回内容 = `wrapFence(最新编辑)` 且 `stripFence` 无损 round-trip（合法围栏、零损坏）；卸载后残留画布回调不再产生任何写入 |
| ①（竞态）写回期间新编辑不被旧回调覆盖 | `验收① … 写回进行中新编辑不被旧回调覆盖：版本号比对丢弃过期回调，最终 = 最后一次编辑` | 可控异步 updateBlock（deferred）模拟写回进行中：锁内到达不并发写回（调用次数不增）；完成后补写最后一次编辑（`isSyncing` + `editVersion` 版本号比对）；补写后无多余写回（有界） |
| ①（失败零损坏）init 拒绝不写回 | `验收① … 后端 init 拒绝（fake 可编程触发）→ 不建立写回通道、updateBlock 零调用` | `rejectInitWith` 触发 init 拒绝：updateBlock 零调用（保留原文本）、flushWrite 无副作用、destroy 幂等（后端 destroy 恰 1 次） |
| ② 拖拽无落盘风暴 | `验收② … onGraphChange × 100 次（<500ms 间隔）→ 拖拽期间 updateBlock 零调用；停顿 500ms 后恰好 1 次` | 100 次编辑（每次间隔 10ms < 500ms）→ 拖拽期间 updateBlock **零调用**；停顿满 500ms → **恰好 1 次**，内容为最后一次编辑（`wrapFence("…N100")`） |
| ② 整轮写回次数有界 | `验收② … 多轮拖拽突发（轮间停顿 >500ms）→ 整轮写回次数有界 = 突发轮数（无风暴）` | 3 轮 × 30 次编辑（90 次编辑事件）→ 每轮停顿后写回恰一次，**整轮仅 3 次落盘**（有界、无风暴），最终内容为最后编辑 |
| ③ 改文本重开画布正确反映 | `验收③ … 修改代码块文本（不同 markdown 输入）→ 重开会话：init 收到剥离后的新纯文本，画布渲染新内容` | 3 种不同 markdown 输入逐一重开：真实 `stripFence` 剥离 → `initEditorSession` → 适配器 init → fake 后端断言收到的 code = 对应新纯文本（画布渲染新内容）；重开不产生任何写回 |
| ④ 模拟新增 full 适配器零改动接入 | `验收④ … 注册假想 full 适配器（type=xmind）→ route 返回 full → 同一 initEditorSession 双向同步零改动` | `route(code, registry)` 返回 `kind: "full"` 且携带该适配器实例（xmind 不在 KNOWN_DIAGRAM_TYPES，新增类型直接可路由）；同一 `initEditorSession` 打开：init 收到剥离后 xmind 纯文本；编辑 → 防抖 → `wrapFence` 写回零改动生效；`destroy` flush 语义不变；卸载后残留回调不写回 |

## 四、自审

- **四项验收各自可证伪**：以两种核心变异（防抖窗口 500→10、wrapFence 追加损坏后缀）实测检出——RED-1 命中②（+① 的"编辑期间零写回"），RED-2 命中①/②/④；每一项验收都有精确断言（次数、内容、round-trip），无一"永远为真"的软断言。
- **不 mock 被测核心**：registry / FlowChartAdapter / ReadOnlyAdapter / route / initEditorSession / stripFence / wrapFence / createDebounce 全部真实实现；仅宿主 `getBlockMarkdown`/`updateBlock`（任务允许）与后端（REQ-BACKEND-001 seam 注入 fake，真实 @visimer/dom 未发布——与 T4/T6 同策略）为替身。
- **无重复造轮子**：未新建共享抽象（YAGNI）；fake 后端/工厂/XmindAdapter 内联于套件文件，沿用仓库既有测试模式（T11/T12 fake timers、T12 deferred 竞态、T6 backendFactory seam）；不重复 T11/T12/T13 单测已覆盖的边界（readonly/unknown 路由、debounceMs 可配置、destroy 幂等等不在验收范围）。
- **顺序无关**：宿主源码 `blockMarkdown` 在 `beforeEach` 复位，套件测试顺序无关。
- **pristine**：仅新增 `src/acceptance/acceptance.test.ts` + 修改 `package.json`（+1 脚本）；`changes/` 规划工件未触碰；变异检查全程临时改动已复原（`git status` 仅上述两路径）；dist 产物 gitignore。

## 五、Concerns

1. **真实思源宿主内人工验证仍缺位**（继承 T13 concern）：四项验收以「模拟宿主 + 全链路组装」验证闭环语义；真实 `window.siYuan.api.block.*` 与真实 @visimer/dom 加载需在思源环境人工确认（依赖包未发布，见 render/visimer-backend.ts 事实核实）。
2. **验收③的正向流经真实 ReadOnlyAdapter 导入真实 mermaid**：模块级 `import mermaid from "mermaid"` 在 happy-dom 下可加载（套件已实测通过）；四项验收均不触达只读渲染路径，mermaid 渲染能力不在验收范围（T7 单测以 fake renderer 覆盖契约）。
3. **防抖时间常数与真实拖拽帧率**：验收②以 10ms 间隔 × 100 次模拟"连续高频拖拽"（1000ms 持续），防抖 500ms 窗口语义在真实拖拽（~16–33ms/帧）下安全裕度充分；真实宿主帧率下的最终验证属 concern 1。
4. **XmindAdapter 仅为验收假想适配器**：不注册进生产 `src/index.ts`（本期生产仅 flowchart full）；证明的是"新增 full 类型不动核心逻辑"（§8 兼容扩展），非交付 xmind 支持。

## 六、Commit

- `89f3578` `test: §11 四项验收用例套件（TDD）`（2 files changed, 384 insertions / 1 deletion）
