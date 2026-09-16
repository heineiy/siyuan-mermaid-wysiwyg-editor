# T5 任务报告：适配器注册表 + 能力探测 + 降级路由

- **任务**：T5（Wave 2 w2-adapter-layer）
- **状态**：DONE_WITH_CONCERNS（vitest 过滤行为导致的测试文件路径调整 + 并行任务 T8 共享工作树）
- **日期**：2026-09-16

## 1. 实现了什么

### `src/adapters/registry.ts`（新增）
- `AdapterOptions { container: HTMLElement; backend: RenderBackend; onGraphChange: (newCode: string) => void }` —— 最小必要项；`backend` 以 T4 的 `RenderBackend` **接口类型**依赖（契约级，不绑定具体实现），T6/T11 的组装细节（Dialog、防抖、updateBlock、mermaid 运行时）**未进入本接口**。
- `DiagramAdapter { type; supportLevel: 'full'|'readonly'; init(code, opts): void; destroy(): void }` —— 与 REQ-ADAPTER-001 / design.md D5 完全对齐。
- `AdapterRegistry`：`register(adapter)` / `get(type)` / `list()`；同 type 重复注册**后者覆盖前者**（文档化约定 = D5 临时降级/升级入口：full↔readonly 覆盖即可切换类型能力，不动同步核心）。

### `src/adapters/router.ts`（新增）
- `detectDiagramType(code): string | null` —— 跳过前导空行/首行空白，取首个非空 token；`flowchart LR` 等方向变体（TD/TB/BT/LR/RL）归一为 `flowchart`；未知类型返回原始 token 供上层展示；空/全空白返回 null。
- `KNOWN_DIAGRAM_TYPES` + `isKnownDiagramType()` —— flowchart / sequenceDiagram / classDiagram / gantt / stateDiagram(-v2) / erDiagram / pie / journey / mindmap 判为已知（除 flowchart 外本期均 known-readonly，符合 DEGRADE-001 与任务要求"应把常见类型判定为 known-readonly"）。
- `route(code, registry): RouteResult` —— 判别联合三路：
  1. `{ kind: "full", type, adapter, message: null }`（注册表有 full 适配器 → 可视化编辑）
  2. `{ kind: "readonly", type, adapter: DiagramAdapter|null, message }`（已知类型无 full 适配器 → 只读预览；T7 落地前 adapter 可为 null 由上层兜底）
  3. `{ kind: "unknown", type, adapter: null, message: "该图类型暂不支持可视化编辑" }`（未知/空代码 → 兜底只读 + 提示）
- 提示文案导出常量：`UNKNOWN_TYPE_MESSAGE`（精确含"该图类型暂不支持可视化编辑"）、`READONLY_TYPE_MESSAGE`。

## 2. TDD 证据（RED / GREEN）

**RED**（仅写测试、未实现时）：
```
❯ src/adapters/adapter-router/router.test.ts:2:1
  import { AdapterRegistry, type DiagramAdapter } from "../registry";  ← Cannot find module
 Test Files  2 failed (2)
      Tests  no tests
```
（`registry.test.ts` / `router.test.ts` 均因 `../registry`、`../router` 模块不存在而无法加载，符合先红预期。）

**GREEN**（实现后）：
```
 ✓ src/adapters/adapter-router/registry.test.ts (7 tests) 8ms
 ✓ src/adapters/adapter-router/router.test.ts (17 tests) 10ms
 Test Files  2 passed (2)
      Tests  24 passed (24)
```

**全量 `npm test`**：`Test Files 7 passed (7); Tests 76 passed (76)` —— 全绿。基线 47 为任务开始时数据；执行期间并行任务 T8（Dialog，见 Concerns）向同一工作树新增 5 个测试，故全量现为 76。

**类型检查**：`npx tsc --noEmit` 对本任务 4 个文件零错误；当前仓库唯一 tsc 报错在 `src/controller/dialog.test.ts`（T8 并行任务文件，72/73/102/103 行 `instance is possibly 'undefined'`），非本任务引入、未触碰。

## 3. Files Changed

| 文件 | 变更 |
|------|------|
| `src/adapters/registry.ts` | 新增（DiagramAdapter 契约 + AdapterOptions + AdapterRegistry） |
| `src/adapters/router.ts` | 新增（detectDiagramType / isKnownDiagramType / route / RouteResult / 提示文案） |
| `src/adapters/adapter-router/registry.test.ts` | 新增（注册/查询/覆盖/list/快照/契约形状，7 例） |
| `src/adapters/adapter-router/router.test.ts` | 新增（首行判定/已知清单/三路路由/空白容错/降级覆盖，17 例） |

未触碰：`changes/` 规划产物、T1–T4 已落地文件、`src/index.ts`、构建配置（`package.json`/`vite.config.mts` 的改动属并行 T8，未纳入本次提交）。

## 4. Self-Review Findings

- **接口最小且无泄漏**：AdapterOptions 仅 container/backend(onGraphChange 回调)；无 Dialog、防抖、updateBlock、mermaid 运行时等 T6/T11 细节；`backend` 依赖 T4 接口类型而非具体实现。
- **三路路由全覆盖**：full（含 full→readonly 覆盖后降级为只读）、readonly（注册 readonly 适配器 + 已知类型无适配器两种子场景）、unknown（未知 token + 空代码）均有测试；RouteResult 判别联合让 T11 可按 `kind` 分支并读取 `message`。
- **首行判定健壮**：前导空行、前导空格/制表符、方向变体（TD/TB/BT/LR/RL）、CR 结尾（trim 兜底）、空输入均覆盖。
- **注册表语义文档化**：后者覆盖约定写入 registry.ts 注释与测试（覆盖即 D5 临时降级入口）。
- **vitest 过滤行为核实**（读 node_modules 源码 `filterFiles`）：vitest 5 位置参数为**子串匹配**（`testFile.includes(filter)`），`adapter-router` 无法匹配 `src/adapters/registry.test.ts` / `src/adapters/router.test.ts` 的平铺路径（会以 "No test files found, exiting with code 1" 失败）。故将测试置于 `src/adapters/adapter-router/` 子目录（**文件名保持任务指定的 `registry.test.ts` + `router.test.ts` 不变**），使证据命令 `npm test -- adapter-router` 可同时跑两个测试文件，完整演示"registry 可注册/查询 + 三路路由"的可观测结果。

## 5. Concerns

1. **测试文件路径偏离任务字面**（`src/adapters/adapter-router/*.test.ts` 而非平铺 `src/adapters/*.test.ts`）：为满足证据命令 `npm test -- adapter-router` 全绿而做的必要调整（vitest 5 子串过滤，见 Self-Review）。已实测 `npm test -- adapter-router` 恰好命中且只命中这两个文件。
2. **并行任务 T8 共享工作树**：执行期间检测到 `src/controller/dialog.ts`、`src/controller/dialog.test.ts`、`src/test-utils/`、`package.json`/`vite.config.mts` 的改动（非本任务所为）。T8 的 `dialog.test.ts` 存在 tsc 报错（运行时测试通过）。本提交**只包含 T5 的 4 个文件**；若评审要求"全仓 tsc 干净"，需 T8 修复其类型错误后复验。
3. **AdapterOptions.backend 接口级耦合**：T6 组装 flowchart 适配器时需注入 RenderBackend 实例；若 T6 决定不在 init 时注入 backend（如改由适配器自建），需按契约调整——不影响本任务的注册表/路由骨架。
4. **KNOWN_DIAGRAM_TYPES 含 stateDiagram 与 stateDiagram-v2 两个别名**：任务仅列 stateDiagram-v2；为覆盖 Mermaid 常见写法多含一个 legacy 别名，属"常见类型判为 known-readonly"的合理延伸，已注释说明。

## 6. Commits

- Base：`324dc2c`（docs: w1-foundation review report）
- Head：见本次提交（feat: 适配器注册表与类型路由（TDD）；docs: T5 任务报告）
