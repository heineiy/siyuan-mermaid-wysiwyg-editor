# Wave 2 Review Report: w2-adapter-layer

**审查范围**：T5 适配器注册表 + 能力探测 + 降级路由 / T8 Dialog 生命周期与画布挂载

**审查方式**：控制器人工代码审查（读实现 + 全量测试 + tsc + 构建）

## 验收核对

| 证据命令 | 结果 |
| --- | --- |
| `npm test` | ✅ 76/76 通过（新增 registry/router 24 + dialog 5），输出干净 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run build` | ✅ 构建通过，dist 产物正常 |

## 规格符合性

- **REQ-ADAPTER-001（T5）**：DiagramAdapter 契约（type/supportLevel/init/destroy）与 AdapterRegistry 齐备；重复注册后者覆盖的文档化约定即为 D5 的临时降级/升级入口；AdapterOptions 最小化（container/backend/onGraphChange），未泄漏 T6/T11 组装细节。
- **REQ-DEGRADE-001（T5）**：`detectDiagramType` 首行判定健壮（前导空行/空白、flowchart 方向变体）；`route` 三路判别联合（full/readonly/unknown + message）覆盖场景 1-3；KNOWN_DIAGRAM_TYPES 覆盖 sequence/class/gantt 等 known-readonly；未知类型兜底提示文案 UNKNOWN_TYPE_MESSAGE 与规格一致。
- **D2 / REQ-TRIGGER-001 容器（T8）**：Dialog 管理器按 siyuan 包真实 API（content HTML 注入 + destroyCallback）实现；close 触发 onDestroy（后端销毁钩子），幂等；重复打开创建新实例、清理旧引用。单测以 mock siyuan + 占位 alias 隔离宿主环境，仅测试模式生效。

## 代码质量

- 接口最小、职责单一；路由结果判别联合使 T11 分支无字符串魔法。
- 关键边界均有测试（76 基线含 24+5 新增）。

## 发现

- **Info**：vitest 5 过滤为子串匹配，T5 测试置于 `src/adapters/adapter-router/` 子目录以保证 `npm test -- adapter-router` 命中（已文档化）。
- **Info**：siyuan 为纯类型包（无运行时入口），测试 alias 方案已验证不泄漏进产物。
- 并行子代理共享 worktree，各自提交仅含自身文件；最终 tsc/test/build 全绿，无冲突残留。

## 结论

**verdict: pass** — 规格符合、测试与构建全绿、代码质量良好。
