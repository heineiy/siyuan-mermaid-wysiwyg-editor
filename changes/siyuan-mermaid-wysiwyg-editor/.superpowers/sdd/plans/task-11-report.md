# T11 任务报告：双向同步协调器

- **任务**：T11（tasks.md）— 双向同步协调器（w4-sync-core 闭环核心）
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`78a30eb`（docs: w3-adapters-triggers review report）
- **Commit head**：`b1d5bf0`（`feat: 双向同步协调器（TDD）`）

## 一、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/controller/sync.ts`（新增） | 双向同步协调器（REQ-READ-001 / REQ-WRITE-001 / REQ-DEBOUNCE-001 / D3/D4）。导出 `initEditorSession(opts): Promise<EditorSession>` 与 `EditorSession { flushWrite(): void; destroy(): void }`。<br>**正向流**：`getBlockMarkdown(blockId)` → `stripFence` 剥离围栏 → `route(code, registry)` 三路路由：<br>· full：适配器 `init(code, {container, onGraphChange})`，backend 由适配器缺省工厂提供（D5 语义，本协调器不注入 backend）；<br>· readonly：已注册 readonly 适配器（无则 `new ReadOnlyAdapter()`）只读渲染；<br>· unknown：兜底 `new ReadOnlyAdapter()` 只读渲染 + `result.message` 提示文案渲染进画布容器（渲染完成后追加，避免被 innerHTML 覆盖）。<br>**反向流**：`onGraphChange(newCode)` 绝不同步写回——经 `createDebounce(fn, 500)`（`debounceMs` 可配）聚合，停顿 500ms 写回一次；`flushWrite()`（onBlur/关闭场景）立即写回一次；写回组装严格 `wrapFence(newCode)` → `updateBlock(blockId, fenced)`。<br>**会话生命周期**：`destroy()` = 置 destroyed 标志 → flush 未决写回 → `adapter.destroy()` → `cancel()` 防抖；幂等；destroy 后 `onGraphChange`/`flushWrite` 不再触发写回。<br>**错误处理（最小，T13 完善）**：`adapter.init` 同步抛错或返回拒绝 Promise（如 VisimerLoadError）经 `await Promise.resolve(...)` + try/catch 吸收，错误 message 渲染进容器（`mermaid-wysiwyg-error` div），不抛未捕获异常。<br>**写回串行化**：防抖天然聚合 + flush 与定时器互斥（createDebounce 保证），无额外锁；`writeFenced` 与防抖实例内聚为 T12 seam（注释标明 T12 可在此包装 isSyncing 竞态锁 + 版本号比对）。 |
| `src/controller/sync.test.ts`（新增） | vitest + happy-dom（真实 div 容器），模块级 mock 兜底 ReadOnlyAdapter、注册表注册 fake 适配器、注入 vi.fn 读写。10 用例：正向 full 剥离透传 / 反向高频防抖一次写回（wrapFence 内容）/ debounceMs 可配 / flushWrite 立即一次不重复 / flush 无未决零副作用 / readonly 已注册适配器不写回 / readonly 无注册兜底 new ReadOnlyAdapter / unknown 提示文案进容器不写回 / destroy flush+destroy+后续不再写回（幂等）/ backend init 拒绝错误进容器不抛未捕获。 |
| `src/index.ts`（修改） | 替换 T9/T10 stub onInit 为真实接线：`declare global` 声明 `window.siYuan` 最小 API 切片（siyuan@1.2.7 类型包无 Kernel API 声明，事实核实）；onload 组装 `registry`（`new FlowChartAdapter()` + `new ReadOnlyAdapter()`）；`openMermaidEditor(blockId)`：openEditorDialog 取容器 → `initEditorSession({blockId, container, registry, getBlockMarkdown: id=>window.siYuan.api.block.getBlockMarkdown({id}).then(r=>r.markdown), updateBlock: (id,data)=>window.siYuan.api.block.updateBlock({id,data})})`；Dialog onDestroy → `session.destroy()`；`dialogClosed` 标志兜底「初始化期间用户已关闭 Dialog」竞态（init 完成后发现关闭则立即 `s.destroy()` 防泄漏）；init 拒绝（getBlockMarkdown 失败/stripFence fail-fast）兜底渲染错误 div 进容器 + console.error。 |
| `src/adapters/registry.ts`（修改） | `AdapterOptions.backend` 由必填改为**可选**。依据：T11 规格「backend 由 adapter 缺省工厂提供」，FlowChartAdapter 运行期已是 `opts.backend ?? factory.create()`（T6 注释亦标注「当前为必填类型」）；本协调器是首个生产调用方，语义上确实不注入 backend。类型与运行期对齐后消除 sync.ts 三处强制断言；T5/T6 既有测试不受影响（全部显式传 backend）。 |

## 二、TDD 证据

**RED**（仅写测试，`sync.ts` 未实现）：
```
$ npm test -- sync
FAIL  src/controller/sync.test.ts
Error: Failed to resolve import "./sync" from "src/controller/sync.test.ts". Does the file exist?
 Test Files  1 failed (1)      Tests  no tests
```

**GREEN**（实现后首轮 6 处失败，根因：测试夹具首行用旧语法 `graph TD;`，而 `router.detectDiagramType` 取首个 token 得 `"graph"`、不在 `KNOWN_DIAGRAM_TYPES` → 落 unknown 分支。修正夹具首行为 `flowchart TD;`（router 既有语义，测试对齐之），随后全绿）：
```
$ npm test -- sync
 ✓ src/controller/sync.test.ts (10 tests)
 Test Files  1 passed (1)      Tests  10 passed (10)
```

**全量 + 类型 + 构建 + 证据命令**：
```
$ npm test              # 13 files, 150 passed（基线 140 + 本任务 10）
$ npx tsc --noEmit      # exit 0（TSC_OK；含 index.ts 的 window.siYuan 声明与 registry 可选化后无 TS2345）
$ npm run build         # 成功（mermaid 随 readonly 适配器进产物，预期）
$ npm test -- sync      # 证据命令：10 passed
```

## 三、自审

- **闭环完整**：正向（读→剥→路由→渲染）+ 反向（编辑→防抖→包回→写回）+ flushWrite + destroy 全链路在单测覆盖；写回组装严格 `wrapFence`（测试断言 `updateBlock(blockId, "```mermaid\n…\n```")` 精确内容）。
- **T12/T13 未越界**：未实现 isSyncing 竞态锁/版本号比对（T12）——仅将 `writeFenced` 与防抖实例内聚并注释标明 seam；语法错误保护/画布错误 UI（T13）未实现——backend init 拒绝仅做「错误 message 渲染进容器 + 不抛未捕获异常」最小兜底，注释标明 T13 完善。
- **只读/unknown 不建写回**：readonly/unknown 会话 `flushWrite` 为 noop、永不调用 updateBlock（专项测试断言 updateBlock 零调用）；unknown 提示文案渲染进容器（专项测试断言 textContent 含提示）。
- **无泄漏**：destroy 幂等（destroyed 标志，重复调用 adapter.destroy 仅一次）；destroy 后 onGraphChange/flushWrite 失效（专项测试）；index.ts `dialogClosed` 竞态兜底 + onDestroy 置空 session 引用。
- **backend 可选化**：唯一越出 T11 文件边界的改动，但属任务规格直接要求（backend 由适配器缺省工厂提供）的类型对齐，且消除生产调用点强制断言；T5/T6 测试零改动零回归。
- **pristine**：仅新增 2 文件 + 修改 2 文件（src/index.ts、src/adapters/registry.ts）；`changes/` 规划工件未触碰；dist 产物 gitignore。

## 四、Concerns

1. **T12/T13 seam 说明**：`writeFenced`（`updateBlock(blockId, wrapFence(newCode))`）与防抖实例在 sync.ts full 分支内聚，T12 可直接在此包装 isSyncing 锁 + 版本号比对（含 flush 期间并发写回的拒绝策略）；错误 div（`mermaid-wysiwyg-error` / `mermaid-wysiwyg-hint` class）已就位，T13 可平滑替换为正式错误 UI。
2. **FlowChartAdapter 不传播 backend.init 拒绝**：T6 适配器 `init` 为同步 void、未 await 后端 Promise，若真实 Visimer backend.init 拒绝会产生**未处理 Promise 拒绝**（sync.ts 的 try/catch 接不到）。本任务按规格对「适配器 init 拒绝」做最小兜底（测试覆盖）；若 Visimer 加载失败路径需同步闭环，建议 T12/T13 时让 FlowChartAdapter 返回/转发 backend.init 的 Promise（或 T11 外层挂 unhandledrejection 守卫）——已记录待办。
3. **思源内手动验证未执行**（需真实思源宿主）：`window.siYuan.api.block.getBlockMarkdown/updateBlock` 的实际返回形状（`{markdown}` / void）、真实 Dialog 容器挂载、mermaid readonly 渲染均需后续在思源内人工确认；本任务完成测试侧（证据命令全绿）。
4. **registry 中注册的 `*` 通配 ReadOnlyAdapter 不参与路由匹配**：router 按精确 type 查询（`registry.get(type)`），readonly/unknown 兜底由 sync.ts 每次 `new ReadOnlyAdapter()` 实例化（与 T7 文档「上层用本适配器填充」语义一致）；注册的 `*` 实例仅作声明性存在，功能等价无泄漏。
5. **测试夹具修正说明**：首轮 GREEN 失败的根因是夹具用旧语法 `graph TD;`（detectDiagramType → "graph" 不在已知清单 → unknown），非实现缺陷；已修正夹具并注释说明 router 语义。

## 五、Commit

- `b1d5bf0` `feat: 双向同步协调器（TDD）`（src/controller/sync.ts、sync.test.ts、src/index.ts、src/adapters/registry.ts；658 insertions / 15 deletions）
