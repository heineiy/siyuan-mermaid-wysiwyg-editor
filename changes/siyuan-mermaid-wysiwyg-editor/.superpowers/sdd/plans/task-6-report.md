# Task 6 Report: flowchart 全编辑适配器

**任务**：T6 — `src/adapters/flowchart-adapter.ts`（flowchart 全编辑适配器，装配 Visimer 可编辑画布）
**分支**：`siyuan-mermaid-wysiwyg-editor`
**日期**：2026-09-16

## 实现了什么

- `src/adapters/flowchart-adapter.ts`（新增）：
  - `export class FlowChartAdapter implements DiagramAdapter`：
    - `readonly type = "flowchart"`、`readonly supportLevel = "full" as const`
    - `init(code, opts)`：**幂等**——开头 `destroy()` 旧后端再重建；后端来源 `opts.backend ?? this.backendFactory.create()`（显式注入复用优先，缺省经工厂创建，默认工厂 `visimerBackendFactory`，REQ-BACKEND-001）；调用 `backend.init(code, { container, onGraphChange })` 原样透传；保存实例引用
    - `destroy()`：销毁后端（幂等，置 null 后可重复调用）
  - 构造器 `new FlowChartAdapter({ backendFactory })` 可注入后端工厂（测试注入 fake；真实 `@visimer/dom` 未发布，测试不依赖真实加载）
  - 纯装配层：不含防抖/同步逻辑（T11 职责），不触碰注册表（接线属后续任务）
- `src/adapters/flowchart-adapter.test.ts`（新增，vitest，8 用例）。

## TDD 证据

### RED
`npm test -- adapter`（仅含测试、实现未创建时）：
```
FAIL  src/adapters/flowchart-adapter.test.ts
Error: Cannot find module './flowchart-adapter' imported from .../flowchart-adapter.test.ts
Test Files  1 failed | 2 passed (3)
```
（测试先于实现编写，导入失败即 RED。）

### GREEN
实现 `flowchart-adapter.ts` 后：
```
✓ src/adapters/flowchart-adapter.test.ts (8 tests)
Test Files  3 passed (3)     Tests  32 passed (32)
```

### 全量验证
- `npm test`：**84/84 通过**（基线 76 + 新增 8），全绿
- `npx tsc --noEmit`：**0 错误**
- `npm run build`：通过（dist 产物正常）

## 变更文件

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `src/adapters/flowchart-adapter.ts` | 新增 | FlowChartAdapter 实现 |
| `src/adapters/flowchart-adapter.test.ts` | 新增 | 8 个测试用例 |

未改动 `src/index.ts`、`src/adapters/registry.ts`、`src/adapters/router.ts` 的任何现有导出。

## 测试覆盖（8 用例）

1. 元数据：`type = flowchart`、`supportLevel = full`
2. 构造器可无参实例化（不触发真实 Visimer 加载）
3. init 调用后端 init，透传 code / container / onGraphChange
4. 传入 backend 时复用实例（工厂 create 不被调用）
5. onGraphChange 透传（fake 后端 emitChange → 上层收到 newCode）
6. 重复 init 幂等（先 destroy 旧后端再 init 新后端）
7. destroy 幂等（未 init / 重复调用不抛，后端只销毁一次）
8. 缺省后端工厂（不传 backend 时经注入工厂 create 并 init）

## 自检结论

- ✅ 纯装配：适配器仅"选后端 → init → 透传回调"，无防抖/同步泄漏（T11 职责）
- ✅ 不触碰注册表：文件未 import `AdapterRegistry`，无 register 调用
- ✅ 幂等语义符合设计：init 先 destroy、destroy 可重复
- ✅ 测试不依赖真实 `@visimer/dom`（fake 后端 + 注入工厂）

## 关注点

- **`AdapterOptions.backend` 类型与「缺省」语义的张力**：T5 落地的 `AdapterOptions.backend` 为必填类型，但 T6 规格要求 `opts.backend ?? visimerBackendFactory.create()`（运行时缺省）。本任务遵守"不改 registry.ts 现有导出"约束，保持类型不变，适配器用 `??` 实现创建/复用语义；测试中「缺省」路径以构造器注入 fake 工厂 + 一处最小 `as unknown as AdapterOptions` 断言覆盖。若后续任务（T11 接线）希望类型如实反映可缺省，可把 `backend` 放宽为可选（本任务不做，避免越权改契约）。
- **共享 worktree 并发**：`package.json` / `package-lock.json` 在本次任务开始前（15:46）已被并行子代理修改（新增 `mermaid ^12.0.0` 依赖，疑似 T7 readonly 适配器所用），非本任务改动；已按"各自提交仅含自身文件"约定仅提交本任务两个文件，未触碰也不回退他人改动。

## 提交

- base：`bc7ebdf`（docs: w2-adapter-layer review report）
- head：`0027b0d`（feat: flowchart 全编辑适配器（TDD），2 files changed, 222 insertions）
