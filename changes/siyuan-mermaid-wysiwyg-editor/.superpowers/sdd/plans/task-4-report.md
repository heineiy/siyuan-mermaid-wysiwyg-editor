# T4 任务报告：RenderBackend 接口 + Visimer 实现

- **任务**：T4（Wave 1 w1-foundation，Batch Inline 串行执行）
- **状态**：DONE_WITH_CONCERNS（懒加载 seam 接线点待 T6/T11 接入真实包）
- **日期**：2026-09-16

## 1. npm 事实核实结论（先决步骤）

| 包名 | registry.npmjs.org | 结论 |
|------|--------------------|------|
| `visimer` | `npm view` → 404 Not Found | **未发布** |
| `@inkeep/visimer` | `npm view` → 404 Not Found | **未发布** |
| `mermaid-wysiwyg` | `npm view` → 404 Not Found | **未发布** |

- 上游仓库 https://github.com/inkeep/visimer **存在**（HTTP 200，monorepo，根 package.json 名为 `visimer-monorepo`、`private: true`，未走 npm 发布）。
- monorepo 内包：`@visimer/core` v1.1.2（headless 双向编辑引擎，CST/ops）、`@visimer/dom` v1.1.2（DOM 画布：`MermaidCanvasView`，`ViewOptions` 含 `editor/container/mermaid/debounceMs/hooks` 等）、`@visimer/react`、`@visimer/codemirror`、`@visimer/monaco`。
- 代码变更事件事实：`@visimer/dom` 的 view.ts 通过 `this.editor.on('change', () => this.scheduleRender())` 订阅 `@visimer/core` 编辑器的 `change` 事件——即真实接线时用 `editor.on('change')` 接到 `onGraphChange(newCode)`。

**结论**：设计文档引用的 Visimer（mermaid-wysiwyg / inkeep/visimer）**尚无可用 npm 包**（仓库活跃：pushed_at 2026-08-24，updated_at 2026-09-16，仍在开发中）。按任务要求**不伪造实现**，落地为接口合规的懒加载 seam 适配器。

## 2. 实现了什么

### `src/render/backend.ts` — 可替换后端契约（新增）
- `RenderBackendOptions { container: HTMLElement; onGraphChange: (newCode: string) => void }`
- `RenderBackend { init(code, opts): Promise<void> | void; destroy(): void }`（失败以 Promise 拒绝上报明确错误，不抛未捕获异常）
- `BackendFactory { id; create(): RenderBackend }`（后端按 id 注入的组装入口；全局注册表刻意不做——归属 T5 适配层）
- 顶部注释：可替换契约 + VueFlow 桥接仅以接口/文档预留插槽（D5 §8），能力探测（supportLevel）属 T5，不塞入接口

### `src/render/visimer-backend.ts` — Visimer 懒加载适配器（新增）
- `VISIMER_MODULE = "@visimer/dom"`（默认懒加载目标 = monorepo 真实包名，非杜撰）
- `VisimerBackend implements RenderBackend`：
  - `init` 动态 `await import(/* @vite-ignore */ moduleId)`（moduleId 可经 `VisimerBackendOptions.moduleId` 覆写，供测试注入/接线）
  - 加载失败 → 抛 `VisimerLoadError`（`code: "VISIMER_LOAD_FAILED"`、携带 moduleId、消息含接线提示）——**Promise 拒绝，可捕获，不产生未捕获异常**
  - 加载成功 → 校验 seam 契约导出 `mount({container, code, onChange})`，返回 `{unmount}` 句柄；变更经 `onChange` → `opts.onGraphChange(newCode)`（REQ-RENDER-001 反向流）
  - `destroy` 幂等：`unmount` 置于 try/finally，句柄置空后重复调用无副作用；引用清空不泄漏
- `createVisimerBackend()` + `visimerBackendFactory`（`id: "visimer"`）——REQ-BACKEND-001 注入入口

### `src/render/backend.test.ts` — 接口契约测试（新增，9 用例）
1. fake 后端实现接口 → 通用消费方注入使用（REQ-BACKEND-001 场景）
2. fake 编辑触发 `onGraphChange(newCode)`（REQ-RENDER-001 回调契约）
3. `BackendFactory` 按 id 注入（含 visimer 工厂）
4. 懒加载失败路径：init 以 `VisimerLoadError` 拒绝而非未捕获异常；失败无编辑回调；失败后 destroy 安全
5. destroy 幂等：未 init / init 失败 / 挂载成功后均重复调用不抛
6. 成功路径（`vi.doMock("@visimer/dom")` 假模块）：mount 入参 → onChange 透传 → destroy 卸载 + DOM 清空 + 幂等
- 环境为 node（无 jsdom），用最小 fake container（appendChild/replaceChildren）代替 DOM

## 3. TDD 证据（RED / GREEN）

**RED**（写测试后、实现前）：
```
 FAIL  src/render/backend.test.ts
 Error: Cannot find module '/src/render/visimer-backend' imported from .../backend.test.ts
 Test Files  1 failed (1)  Tests  no tests
```
（模块不存在 → 测试套件无法加载，符合 TDD 先红预期）

**GREEN**（实现后）：
```
 ✓ src/render/backend.test.ts (9 tests) 25ms
 Test Files  1 passed (1)  Tests  9 passed (9)
```

**类型与构建**：`npx tsc --noEmit` 退出 0；`npm run build` 成功（dist/index.js + plugin.json）。

**全量 `npm test`**：`Test Files 1 failed | 3 passed (4); Tests 2 failed | 43 passed (45)` —— 2 个失败全部来自 **T2 并行任务的 `src/utils/fence.test.ts`**（`stripFence(wrapFence(...))` 往返断言），与 T4 无关，由 T2 负责；T4 证据命令 `npm test -- backend` 全绿。

## 4. Files Changed

| 文件 | 变更 |
|------|------|
| `src/render/backend.ts` | 新增（RenderBackend 契约） |
| `src/render/visimer-backend.ts` | 新增（懒加载 seam 适配器） |
| `src/render/backend.test.ts` | 新增（契约测试 9 例） |

未触碰：`changes/` 规划产物、`src/utils/`（T2）、`src/controller/`（T3）、`src/index.ts`、构建配置。

## 5. Self-Review Findings

- **接口最小且可替换**：RenderBackend 仅 init/destroy + onGraphChange；能力探测/注册表逻辑未塞入（T5 职责）；VueFlow 插槽仅文档说明，无实现代码。
- **无过度设计**：未建全局后端注册表、未加 onError 字段（错误经 init 拒绝上报，契约面最小）、未写任何真实 Visimer 渲染代码。
- **fake-vs-real 边界清晰**：生产真实路径 = 懒加载失败（包未发布，404 拒绝）；成功路径仅以 `vi.doMock` 假模块验证 seam 全链路；测试不依赖真实包，符合任务要求。
- **destroy 幂等**：未 init / 失败 / 成功三态均验证重复调用安全；DOM 清理经 unmount 句柄 + 引用置空。
- **类型安全**：strict + noUncheckedIndexedAccess 下 tsc 0 错误。

## 6. Concerns / 懒加载 seam 接线点（T6/T11）

1. **真实包未发布是本期最大约束**：`@visimer/dom` 尚未上 npm，插件在真实包发布前无法渲染 flowchart 画布（`init` 必然拒绝）。T6（flowchart 适配器）/T11（双向同步协调器）组装时需按下列接线点接入真实包。
2. **接线点 A（推荐）**：将 `VISIMER_MODULE` 指向一个本地薄适配模块，由它封装 `@visimer/dom` 真实 API（`MermaidCanvasView` + `ViewOptions{editor, container, mermaid, ...}`），并导出本 seam 的 `mount({container, code, onChange})` 形状；`editor.on('change', ...)` → `onChange(newCode)`。`VisimerBackend` 本体零改动。
3. **接线点 B**：若发布后 `@visimer/dom` 直接导出 `mount`，则无需薄适配层，仅按真实签名对齐 `VisimerMountOptions`。
4. **错误流接续**：`VisimerLoadError`（code + moduleId）即 T13（REQ-ERROR-001 画布错误提示）与只读降级（REQ-DEGRADE-001）的判据，T11 需 `await init` 并捕获。
5. **mermaid 运行时依赖**：真实 `ViewOptions` 需要 `mermaid`（MermaidLike），T6 接线时需引入 mermaid 运行时（当前 package.json 无此依赖，属 T6 范围）。

## 7. Commits

- Base：`57f211f`（docs: T1 任务报告）
- Head：见本次提交（feat: RenderBackend 接口 + Visimer 懒加载适配器；docs: T4 任务报告）
