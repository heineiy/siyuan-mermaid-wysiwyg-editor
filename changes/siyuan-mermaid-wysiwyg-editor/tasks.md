# Tasks: 思源 Mermaid 双向可视化编辑插件

## Delivery / Proof Map

| 交付物 | 需求覆盖 | 完成证明 |
| --- | --- | --- |
| 插件构建产物（dist/ 含 plugin.json + 入口 JS） | REQ-BUILD-001 | `npm run build` 成功产出 |
| 围栏剥离工具 | REQ-READ-001 | 单测通过（含前导/尾随空行用例） |
| 防抖调度器 | REQ-DEBOUNCE-001 | 单测通过（fake timers，拖拽期间零写回） |
| RenderBackend 接口 + Visimer 实现 | REQ-RENDER-001, REQ-BACKEND-001 | 单测 + 思源内手动拖拽/改字 |
| 适配器注册表 + 能力探测 + 降级路由 | REQ-ADAPTER-001, REQ-DEGRADE-001 | 单测通过（full/readonly/未知三路） |
| flowchart 适配器 + 只读适配器 | REQ-DEGRADE-001 | 单测通过 |
| Dialog 画布 + block-icon + 快捷键（可配置） | REQ-TRIGGER-001/002/003 | 思源内手动验证 + 单测 |
| 双向同步协调器（防抖 + 竞态锁 + 语法保护） | REQ-WRITE-001, REQ-RACE-001, REQ-ERROR-001 | 单测通过 |
| 验收套件（§11 四项） | REQ-STORAGE-001 | 测试命令全绿 |

## Tasks

### T1：插件工程骨架与构建产物
- **影响路径**：根目录（package.json / plugin.json / vite.config.ts / tsconfig.json / src/index.ts 入口）
- **可观测结果**：`npm run build` 产出 `dist/`，内含 `plugin.json` 与入口 JS，可被思源加载
- **证据命令**：`npm run build && test -f dist/plugin.json`
- **依赖**：无

- [ ] T1 初始化 package.json / tsconfig / vite 配置，编写 plugin.json 清单与最小入口，跑通构建

### T2：围栏剥离工具（fence.ts）
- **影响路径**：`src/utils/fence.ts`
- **可观测结果**：输入 `` ```mermaid\ncode\n``` `` 输出纯文本；剥离只去首行与结尾围栏；前导/尾随空行语义保留
- **证据命令**：`npm test -- fence`
- **依赖**：无

- [ ] T2 实现 stripFence / wrapFence 纯函数并覆盖空行、无围栏、异常输入用例

### T3：防抖调度器（debounce.ts）
- **影响路径**：`src/controller/debounce.ts`
- **可观测结果**：持续高频调用不触发 fn，停顿 500ms 后触发一次；cancel 可取消；flush 立即触发
- **证据命令**：`npm test -- debounce`
- **依赖**：无

- [ ] T3 实现可取消防抖（debounce + cancel + flush），用 fake timers 验证拖拽期间零触发

### T4：RenderBackend 接口 + Visimer 实现
- **影响路径**：`src/render/backend.ts`、`src/render/visimer-backend.ts`
- **可观测结果**：`RenderBackend` 接口（init/destroy/onGraphChange）可独立注入；VisimerBackend 实现接口并渲染 flowchart 画布、回调 newCode
- **证据命令**：`npm test -- backend`
- **依赖**：无

- [ ] T4 定义 RenderBackend 接口与 VisimerBackend 实现（画布初始化/销毁/变更回调），接口支持第三方后端注入

### T5：适配器注册表 + 能力探测 + 降级路由
- **影响路径**：`src/adapters/registry.ts`、`src/adapters/router.ts`
- **可观测结果**：registry 可注册/查询适配器；按 Mermaid 首行判定类型路由：full→可视化编辑，readonly→只读预览，未知→兜底只读提示
- **证据命令**：`npm test -- adapter-router`
- **依赖**：T2

- [ ] T5 实现 DiagramAdapter 接口、注册表与首行类型判定路由（full/readonly/未知三路）

### T6：flowchart 全编辑适配器
- **影响路径**：`src/adapters/flowchart-adapter.ts`
- **可观测结果**：注册 `flowchart` 为 full 适配器，内部使用 VisimerBackend 渲染可编辑画布
- **证据命令**：`npm test -- adapter`
- **依赖**：T4、T5

- [ ] T6 实现 flowchart 适配器（supportLevel=full，组装 VisimerBackend），注册入 registry

### T7：只读降级适配器
- **影响路径**：`src/adapters/readonly-adapter.ts`
- **可观测结果**：sequence/class/gantt 及其它未知类型走只读预览（渲染 mermaid，禁止编辑，无写回）
- **证据命令**：`npm test -- adapter`
- **依赖**：T5

- [ ] T7 实现 readonly 适配器（mermaid 渲染 + 禁编辑 + 未知类型提示文案），注册为兜底

### T8：Dialog 生命周期与画布挂载
- **影响路径**：`src/controller/dialog.ts`
- **可观测结果**：触发后弹出思源标准 Dialog，承载画布容器；关闭时销毁后端实例，重复打开可复用
- **证据命令**：思源内手动验证 + `npm test -- dialog`
- **依赖**：T1

- [ ] T8 实现 Dialog 打开/关闭/销毁生命周期，容器挂载与后端 destroy 联动

### T9：block-icon 触发入口
- **影响路径**：`src/index.ts`、`src/controller/trigger.ts`
- **可观测结果**：悬停 Mermaid 代码块 block-icon 区域出现"可视化编辑"按钮；非 mermaid 块不显示
- **证据命令**：思源内手动验证
- **依赖**：T8

- [ ] T9 实现 block-icon 注入与点击触发（仅 mermaid 代码块），无副作用于普通块

### T10：快捷键触发 + 可配置设置
- **影响路径**：`src/controller/shortcut.ts`、`src/controller/settings.ts`
- **可观测结果**：默认 `Shift+Alt+M` 在光标位于 Mermaid 块内触发；设置中改键后旧键失效、新键生效
- **证据命令**：`npm test -- shortcut` + 思源内手动验证
- **依赖**：T8

- [ ] T10 实现快捷键注册（默认 Shift+Alt+M）、块内判定与设置项改键持久化

### T11：双向同步协调器
- **影响路径**：`src/controller/sync.ts`
- **可观测结果**：正向 getBlockMarkdown→剥离围栏→适配器 init；反向 onGraphChange→防抖→围栏包回→updateBlock
- **证据命令**：`npm test -- sync`
- **依赖**：T3、T6、T8

- [ ] T11 实现正向/反向数据流闭环，组装 ```mermaid\n${newCode}\n``` 写回

### T12：写回竞态防护
- **影响路径**：`src/controller/sync.ts`
- **可观测结果**：写回期间 isSyncing 锁生效，版本号比对丢弃过期回调，最终内容等于最后编辑结果
- **证据命令**：`npm test -- sync-race`
- **依赖**：T11

- [ ] T12 实现 isSyncing 锁 + 编辑版本号比对，防旧回调覆盖新编辑

### T13：语法错误保护
- **影响路径**：`src/controller/sync.ts`、`src/render/visimer-backend.ts`
- **可观测结果**：解析/渲染异常时保留原文本、不调用 updateBlock，画布展示错误提示
- **证据命令**：`npm test -- error-handling`
- **依赖**：T11

- [ ] T13 捕获解析/渲染异常，不写回坏数据并提示错误

### T14：验收用例套件
- **影响路径**：测试目录 + 端到端脚本
- **可观测结果**：§11 四项验收全绿：① 拖拽/改字无损更新、卸载零损坏 ② 拖拽无落盘风暴 ③ 改文本重开画布正确反映 ④ 模拟新增 full 适配器零改动接入
- **证据命令**：`npm test && npm run verify:acceptance`
- **依赖**：T9、T10、T12、T13

- [ ] T14 挂接验收用例（四项），输出全绿证据
