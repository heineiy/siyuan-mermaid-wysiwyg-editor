# T8 任务报告：Dialog 生命周期与画布挂载

- **任务**：T8（tasks.md）— Dialog 生命周期与画布挂载
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`324dc2c`（docs: w1-foundation review report）
- **Commit head**：`8444ba4`（feat: Dialog 生命周期与画布挂载（TDD））

## 一、siyuan Dialog 真实 API 确认结论

以 `node_modules/siyuan` 类型定义为准（siyuan@1.2.7），并对照思源官方实现/社区文档交叉核实：

1. **API 形态**（`siyuan.d.ts:837-860`）：`export class Dialog`，构造 options 含 `positionId?/title?/transparent?/content: string/width?/height?/destroyCallback?: (options?: IObject) => void/disableClose?/hideCloseIcon?/disableAnimation?/resizeCallback?`；实例方法 `destroy(options?: IObject): void`、`bindInput(...)`；实例字段 `element: HTMLElement`。
2. **`content` 为 HTML 字符串**：容器注入方式即「content 放一个带 id 的 div，随后 `document.getElementById(id)` 取回」——与思源官方插件文档示例一致（`content: '<div id="SettingPanel"></div>'`）。
3. **`destroyCallback` 语义**（对照思源官方 dialog 实现，社区文档镜像）：`destroy()` 先 `element.remove()` 再回调 `destroyCallback`；用户点关闭按钮/遮罩内部即调用 `destroy()`。因此 **handle.close() 走 `Dialog.destroy()` → destroyCallback → onDestroy 的链路与用户关闭完全一致**。
4. **无显式 open**：构造即挂载到 `document.body` 并显示（构造即打开）。
5. **关键事实**：siyuan 包为**纯类型声明包**（package.json exports 的 `"."` 仅含 `types` 条件、无运行时入口），vite/vitest 无法直接解析为运行时代码——`vi.mock("siyuan")` 本身也会因解析失败报 `Failed to resolve entry for package "siyuan"`。解决：`vite.config.mts` 的 `test.alias` 将 `"siyuan"` 指向 `src/test-utils/siyuan.ts` 占位模块（仅使解析成功，运行时被 `vi.mock` 工厂整体替换），生产构建不受影响（`rollupOptions.external: ["siyuan"]` 保持 `require("siyuan")`）。

## 二、实现内容

| 文件 | 说明 |
| --- | --- |
| `src/controller/dialog.ts` | 受控 Dialog 管理器：`openEditorDialog(options): EditorDialogHandle`（工厂函数）。每次 open 创建**独立** siyuan Dialog 实例，经 `content` 注入带唯一自增 id 的容器 div；句柄含 `close()` / `getContainer(): HTMLElement \| null` / `dialog`（底层实例只读）。关闭链路统一走 `teardown()`：`onDestroy`（上层注入的后端销毁钩子）**只执行一次**且调用后置空引用防泄漏；`close()` 经 `Dialog.destroy()` → `destroyCallback` → `teardown()`（与用户点关闭同路径）；`getContainer()` 每次重新 `document.getElementById`，关闭后 DOM 已移除故返回 null。模块级状态仅容器 id 计数器（保证 id 唯一、无残留复用）。**只交付容器管理**：不接 block-icon/快捷键（T9/T10）、不做后端组装（T11，后端由上层在 onDestroy 注入）。 |
| `src/controller/dialog.test.ts` | vitest + happy-dom（`// @vitest-environment happy-dom`）+ `vi.mock("siyuan")` 工厂 + `vi.hoisted` 可控 MockDialog（行为对齐思源真实实现：构造解析 content 注入 DOM、`destroy()` 触发 destroyCallback 并移除 DOM）。5 个用例覆盖任务要求的全部 4 项 + 用户关闭路径幂等。 |
| `src/test-utils/siyuan.ts` | siyuan 测试期解析占位模块（配合 test.alias，运行时由 vi.mock 工厂替换，不参与生产构建）。 |
| `vite.config.mts` | `test.alias: { siyuan: resolve("src/test-utils/siyuan.ts") }`（仅测试模式生效；构建产物已验证仍为 `require('siyuan')`）。 |
| `package.json` / `package-lock.json` | 新增 devDependency `happy-dom@^20.14.5`（任务指定的 jsdom/happy-dom 方案）。 |

## 三、TDD 证据

**RED**（仅写测试、未实现 `dialog.ts`）：
```
$ npm test -- dialog
 FAIL  src/controller/dialog.test.ts
 Error: Failed to resolve import "./dialog" ... [1/1]   Test Files 1 failed (1), Tests no tests
```
（初次实现后仍 RED 一次：`Failed to resolve entry for package "siyuan"`——siyuan 纯类型包无运行时入口，遂引入 test.alias + 占位模块解决；随后 GREEN。）

**GREEN**：
```
$ npm test -- dialog
 ✓ src/controller/dialog.test.ts (5 tests) 15ms
 Test Files  1 passed (1)     Tests  5 passed (5)
```

**全量 + 类型 + 构建**：
```
$ npm test
 Test Files  7 passed (7)     Tests  76 passed (76)
$ npx tsc -p tsconfig.json   # exit 0
$ npm run build && grep -n siyuan dist/index.js
 const siyuan = require('siyuan');   # 保持外部依赖，test.alias 未泄漏进产物
```
（基线 47 测试；本次新增 5 个 dialog 测试，另有并行任务 T5/T6 的 24 个 adapters 测试在本次会话中汇入，最终全绿 76。）

## 四、自审

- **任务覆盖**：open 创建 Dialog 并注入容器 ✓；close 触发 onDestroy ✓；关闭后再 open 全新 Dialog、旧引用/容器/钩子不残留 ✓；onDestroy 幂等（多次 close 只一次）✓；另覆盖「用户点关闭（Dialog.destroy 路径）」幂等 ✓。
- **无 T9/T10/T11 逻辑泄漏**：`dialog.ts` 无 block-icon/快捷键/设置/同步/updateBlock/后端工厂逻辑；`src/index.ts` 未改动；onDestroy 钩子由调用方注入。仅 `src/test-utils/siyuan.ts` 为测试辅助（明确标注不参与生产）。
- **生命周期清洁**：每 open 独立 Dialog + 独立容器 id；关闭后 destroyHook 置空、DOM 移除、getContainer 返回 null；幂等由闭包 `destroyed` 标志保证；模块级仅 id 计数器。
- **测试隔离**：每个测试文件独立模块注册表（容器 id 自增不影响断言，reopen 用例用「id 互异」而非硬编码序号，除首个用例显式断言 `mermaid-wysiwyg-canvas-1`）。

## 五、Concerns

1. **并行任务干扰**：本次会话期间另一任务（T5/T6，`src/adapters/`：registry/router + 2 个测试）的未提交文件与我的测试并发存在；其 `router.test.ts` 曾有瞬时 `TS2307`（写盘中途），随后自愈。**我的 commit 仅包含本任务 6 个文件**，`src/adapters/` 保持未跟踪，未误提交。
2. **思源内手动验证未执行**（需要真实思源宿主环境）：`openEditorDialog` 在真实思源的可用性依赖已验证的 API 形态与官方行为对齐（构造即打开、destroy 触发 destroyCallback），但真实宿主联动（弹窗样式、关闭按钮 DOM）需后续任务在思源内人工确认——已按任务「证据命令：思源内手动验证 + npm test -- dialog」完成测试侧，思源侧待宿主验证。
3. **handle.close() 幂等的实现位置**：幂等由 `teardown()` 的 destroyed 标志保证，而非在 `close()` 前置判断——`Dialog.destroy()` 重复调用仍会进 destroyCallback，但被标志兜底（语义与测试均覆盖）。
