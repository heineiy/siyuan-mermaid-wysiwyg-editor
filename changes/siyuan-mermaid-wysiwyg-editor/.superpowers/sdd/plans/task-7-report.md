# T7 任务报告：只读降级适配器

- **任务**：T7（Wave 3 w3-adapters-triggers）
- **状态**：DONE_WITH_CONCERNS（真实 mermaid 渲染未在单测环境执行，留待思源宿主内人工验证；并发任务 T6 共享工作树）
- **日期**：2026-09-16

## 1. mermaid API 核实结论

- **版本**：`mermaid@12.0.0`（2026-09-16 npm 最新），安装为 `dependencies`（`"mermaid": "^12.0.0"`）。
- **依赖形态**：v12 自带全部运行时依赖（含 `dompurify@^3.4.12`、`d3`、`cytoscape`、`elkjs` 等，无 peerDependencies），`import mermaid from "mermaid"` 直接可用。
- **渲染 API**（读 `node_modules/mermaid/dist/mermaidAPI.d.ts:82` + `dist/types.d.ts` 核实）：
  - `mermaid.render(id: string, text: string, svgContainingElement?: Element): Promise<RenderResult>`，`RenderResult = { svg: string; diagramType: string; bindFunctions?: (element: Element) => void }`；
  - 语法错误 / 未知类型时 `render` 以 **reject** 上报（v12 已移除 `mermaidAPI.render` 的 callback 形态，返回 Promise）；
  - `mermaid.initialize(config: MermaidConfig): void`，`startOnLoad` 在 v10+ 默认 `false`，本实现**显式**传 `{ startOnLoad: false }` 防御宿主页全局配置污染；
  - `mermaid.parse(text, opts?)` 存在但非必需：`render` 内部即含解析，直接 `render` 即可（任务允许二选一）。
- **结论**：采用 `mermaid.initialize({ startOnLoad: false })` + `mermaid.render(id, code)`，返回的 `svg` 由适配器自行 `container.innerHTML = svg` 挂载（不传 `svgContainingElement`，避免 mermaid 自插 DOM 与 destroy 清理语义冲突）。

## 2. 实现了什么

### `src/adapters/readonly-adapter.ts`（新增）
- `ReadOnlyAdapter implements DiagramAdapter`：
  - `readonly type = "*"`（兜底通配关键字，注释文档化 design.md §8.1 语义）；
  - `readonly supportLevel = "readonly" as const`；
  - `init(code, opts): Promise<void>`：重复 init 先清理旧容器残留；经 renderer 渲染后把 SVG 挂载进 `opts.container`；**含 destroy/新一轮 init 竞态守卫**（渲染完成时本实例已不再持有该容器则不写 DOM）；失败 `catch` 后回调 `onError`，不抛未捕获异常；
  - `destroy(): void`：清理容器内渲染产物，幂等（含从未 init 的情况）；
  - **零编辑、零写回**：不订阅任何编辑事件，代码中不引用 `opts.onGraphChange`（仅契约携带），测试断言全程未调用。
- **错误回调接线**：`onError?: (err: unknown) => void` **经构造器注入**（`ReadOnlyAdapterOptions`），刻意**不改动** `registry.ts` 的 `AdapterOptions` 契约（遵循任务约束"优先考虑构造器注入"）。这是 T13 语法错误保护的接线点；本期渲染失败仅提示、不写回坏数据。
- **renderer 注入**：`ReadonlyRenderer = (id, code) => Promise<{ svg }>` 构造器可注入（测试用）；缺省 `defaultRenderer` 走真实 mermaid（见 §1）。每次渲染生成唯一 id（`mermaid-readonly-${seq}`），避免容器间 SVG id 冲突。
- `init` 返回 `Promise<void>` 而契约声明 `void`：TS 允许 `Promise<void>` 赋值给 `void` 返回签名，类仍满足 `DiagramAdapter` 接口（`npx tsc --noEmit` 验证通过）；换取测试可 `await` 渲染完成。

### `src/adapters/readonly-adapter.test.ts`（新增，11 例）
- 元数据（type/supportLevel/契约形状）；构造器无参不触发真实 mermaid；
- init 调用注入 renderer 并挂载 SVG 到 container（含渲染 id 为字符串、code 透传断言）；
- **init 全程不触发 onGraphChange**（成功路径）；
- renderer 失败 → 构造注入的 onError 收到错误、**不调用 onGraphChange**、container 保持为空（不写回）；
- 未注入 onError 时失败不抛未捕获异常（`resolves.toBeUndefined()`）；
- destroy 清理 container 且幂等（重复调用）；从未 init 时 destroy 安全；**destroy 后完成渲染不写回已销毁容器**（竞态守卫）；
- 重复 init 先清理旧产物再挂载新结果；
- 缺省 renderer 路径：`vi.mock("mermaid")` 验证 `mermaid.initialize({ startOnLoad: false })` + `mermaid.render(code)` 被调用、结果挂载。
- 测试环境：`// @vitest-environment happy-dom`（沿用 T8 dialog.test.ts 的 per-file pragma，无需改 vite.config）。

### 依赖
- `package.json` / `package-lock.json`：新增 `"mermaid": "^12.0.0"`（dependencies）。

## 3. TDD 证据（RED / GREEN）

**RED**（仅写测试、未实现时，`npx vitest run src/adapters/readonly-adapter.test.ts`）：
```
❯ TransformPluginContext.transform .../config.js
  import { ReadOnlyAdapter, ... } from "./readonly-adapter";
  → Cannot find module './readonly-adapter'
 Test Files  1 failed (1)
      Tests  no tests
```

**GREEN**（实现后）：
```
 ✓ src/adapters/readonly-adapter.test.ts (11 tests) 14ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

**证据命令**：
```
$ npm test -- adapter
 ✓ registry.test.ts (7) / router.test.ts (17) / flowchart-adapter.test.ts (8) / readonly-adapter.test.ts (11)
 Test Files  4 passed (4); Tests 43 passed (43)

$ npm test
 Test Files  9 passed (9); Tests 95 passed (95)   ← 全绿（基线 76 + 并发 T6 的 8 + 本任务 11）

$ npx tsc --noEmit   ← 零错误
$ npm run build      ← 通过（readonly-adapter 尚未被 index.ts 引用，产物 0.33 kB 不变）
```

## 4. Files Changed

| 文件 | 变更 |
|------|------|
| `src/adapters/readonly-adapter.ts` | 新增（ReadOnlyAdapter + ReadonlyRenderer + ReadOnlyAdapterOptions + 缺省 mermaid renderer） |
| `src/adapters/readonly-adapter.test.ts` | 新增（11 例，见 §2） |
| `package.json` / `package-lock.json` | 新增 `mermaid@^12.0.0`（dependencies，任务要求） |

未触碰：`changes/` 规划产物、`src/index.ts`、`src/adapters/registry.ts`、`src/adapters/router.ts`、`vite.config.mts`（并行任务产物）。

## 5. Self-Review Findings

- **只读语义严格**：适配器代码路径上无 `onGraphChange` 调用、无任何事件订阅；测试覆盖成功/失败/竞态三种路径断言 `onGraphChange` 零调用——零编辑、零写回成立。
- **错误接线清晰且不越权**：`onError` 经构造器注入，`registry.ts` 的 `AdapterOptions` 契约一字未改；失败路径 catch → onError → 容器保持空（不写回坏数据），与 design.md §9「Mermaid 语法错误 → 保留原文本不写回」对齐，T13 可直接复用本构造参数。
- **生命周期竞态防护**：destroy 后完成渲染不写 DOM（`this.container !== container` 守卫），是"destroy 清理渲染结果与 DOM"的补强语义，已测试。
- **幂等完备**：destroy 重复调用 / 从未 init 调用 / 重复 init 覆盖均幂等并有测试。
- **测试隔离真实 mermaid**：`vi.mock("mermaid")` 全文件替换，node/happy-dom 环境不触达 DOMPurify/canvas，稳定且快（14ms）。
- **契约满足性**：`async init(): Promise<void>` 对 `DiagramAdapter.init(): void` 的赋值性由 TS 静态验证（tsc 零错误），实现注释已说明。

## 6. Concerns

1. **真实 mermaid 渲染未在单测执行**：node/happy-dom 下 mermaid 渲染依赖 DOMPurify/canvas 等浏览器能力，单测以注入 fake renderer + `vi.mock("mermaid")` 验证契约行为；缺省 renderer 的真实渲染留待**思源宿主内人工验证**（打开任一 sequence/class/gantt/未知类型代码块的可视化编辑入口，观察只读 SVG 呈现）。若宿主环境出现渲染异常（如安全策略、图标加载），接线点在 `defaultRenderer` 一处。
2. **`init` 返回 `Promise<void>` 而非字面 `void`**：为可测试性（await 渲染完成）与竞态守卫所需的异步性，TS 契约赋值合法；若评审坚持字面 `void`，需改为 fire-and-forget + 轮询/延迟断言（不推荐）。
3. **并发任务 T6 共享工作树**：执行期间工作树含未提交的 flowchart-adapter（T6）文件，全量 95 中 8 例来自 T6；T6 已自行提交（`0027b0d` / `6f1cd97`），本提交**只包含 T7 的 4 个文件**（package.json/lock + 2 个源码文件），未混入他人改动。
4. **mermaid 体积**：v12 全量依赖较重（~2MB+ 级）；当前未被 `index.ts` 引用故构建产物不变，后续注册接线任务把 readonly 兜底挂入 registry 时 mermaid 会进入打包产物——届时可评估按需引入或 code-split，本期不做。
5. **未知类型渲染**：未知类型（如 `someNewDiagram`）走本兜底适配器时 mermaid.render 大概率 reject → onError 提示，符合「兜底只读 + 提示」路由语义（`router.ts` unknown 分支 message 由上层展示，T11 接线）。

## 7. Commits

- Base：`6f1cd97`（docs: T6 任务报告（flowchart 全编辑适配器））
- Head：`<本次提交>`（feat: 只读降级适配器（TDD））+ docs: T7 任务报告
