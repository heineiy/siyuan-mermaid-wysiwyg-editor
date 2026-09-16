# T1 任务报告：插件工程骨架与构建产物

- **任务**：T1（tasks.md）— 插件工程骨架与构建产物
- **状态**：DONE
- **执行时间**：2026-09-16
- **工作目录**：`/Users/wangj/work/myapp/siyuan-mermaid-wysiwyg-editor-siyuan-mermaid-wysiwyg-editor`（git worktree，分支 `siyuan-mermaid-wysiwyg-editor`）
- **Commit base**：`25f2b99`（docs: 思源 Mermaid 双向编辑插件需求与 v1.0 设计文档）
- **Commit head**：`709c0a6`（feat: 插件工程骨架（vite/vitest/plugin.json 入口））

## 一、实现内容

| 文件 | 说明 |
| --- | --- |
| `package.json` | name=`siyuan-mermaid-wysiwyg-editor`；scripts：`build`=vite build、`dev`=vite build --watch、`test`=vitest run；dependencies：`siyuan@1.2.7`（官方 petal 类型包）；devDependencies：`typescript@^6.0.3`、`vite@^7.0.0`、`vitest@^5.0.1` |
| `plugin.json` | 思源插件清单（legacy 但官方仍支持的字段集）：name/author/url/version=0.1.0/minAppVersion=2.10.0/displayName（default+zh_CN）/description/readme/funding/keywords/platforms=[desktop,android,ios]/isOfficial=false/isMobile=true/scripts=[{method:"index",label:"入口"}] |
| `tsconfig.json` | strict + noUncheckedIndexedAccess，target ES2020，moduleResolution=bundler，isolatedModules，noEmit，include src |
| `vite.config.mts` | 产物 `dist/index.js`（CJS），entry `src/index.ts`；`external:["siyuan"]`；内联 10 行 copy 插件将 plugin.json 复制进 dist；内嵌 vitest `test` 配置（environment=node，include src/**/*.test.ts） |
| `src/index.ts` | 最小插件入口：`export default class MermaidWysiwygEditorPlugin extends Plugin`，onload/onunload 仅 console.log（T8–T13 再实现触发与同步逻辑） |
| `src/__tests__/smoke.test.ts` | vitest 冒烟测试，验证测试运行器可用 |
| `.gitignore` | node_modules/、dist/ |

## 二、关键决策与依据（已与官方 siyuan-note/plugin-sample 核对）

1. **产物格式必须为 CJS 而非 UMD/IIFE/ESM**。任务描述提示"UMD/IIFE 或 esm，以官方模板为准"——实测当前思源前端加载器（`app/src/plugin/loader.ts`，master 分支）用 `window.eval("(function anonymous(require, module, exports){...})")` 包裹插件 JS，并以 `requireFunc` 将 `siyuan` 映射到 API 模块；官方 plugin-sample 的 webpack 配置即 `libraryTarget: "commonjs2"` + `externals: { siyuan: "siyuan" }`。因此 vite 侧等价配置为 `format:"cjs"` + `external:["siyuan"]`，产物内保留运行时 `require("siyuan")`。已在 Node 中完整模拟加载器契约验证通过（见下）。
2. **vite 版本锁定 ^7（Rollup），不用 v8（Rolldown）**。实测 vite 8.3.0（Rolldown）在 `format:"cjs"` 下会静默丢弃入口的 default export（最小复现 `export default class Foo {}` 产出空文件），且 `output.exports` 各取值均异常。vite 7.3.6 的非 lib 模式 `rollupOptions.output.format:"cjs"` 同样丢导出（复现为仅输出 `"use strict";`），但 **`build.lib`（lib mode）输出正确**（`module.exports = <class>`）。最终采用 `build.lib` + `formats:["cjs"]` + `fileName:()=>"index.js"` + `rollupOptions.external`。vitest 5.0.1 的 peer 范围覆盖 vite ^6.4/^7/^8，锁定 ^7 无冲突。
3. **配置文件用 `.mts` 扩展名**（`vite.config.mts`），规避 vite 8 新增的 "configLoader native / ESM-in-CJS" 告警，且不改动 package.json 的 `"type"`（保持 dist/index.js 的 CJS 语义不被 Node 工具误解）。
4. **plugin.json 采用任务明确列举的字段集**（platforms/isOfficial/defaultIcon 省略/isMobile/scripts）。注：当前官方 plugin-sample 已迁移到 webpack + 新版字段（kernels/backends/frontends/icon/publish），但任务列举的 legacy 字段集仍被思源集市与加载器解析，且为任务规格所要求，故按任务执行。
5. **plugin.json 复制**：未引入 `vite-plugin-static-copy`，按任务允许的"手写 10 行 copy 插件"方案实现（零额外依赖，避免与 vite 大版本 peer 冲突）。
6. **vitest 配置内嵌于 vite.config.mts**（`import { defineConfig } from "vitest/config"`），测试用显式 `import { describe, it, expect } from "vitest"`，未开 globals。

## 三、构建 / 测试证据

```
$ npm run build && test -f dist/plugin.json && ls dist/
index.js
plugin.json
EVIDENCE OK: dist/plugin.json exists

$ npm test
 RUN  v5.0.1
 ✓ src/__tests__/smoke.test.ts (1 test) 4ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
 Duration  208ms

$ npx tsc --noEmit        # 退出码 0，类型干净
$ npm ls vite vitest typescript siyuan
siyuan@1.2.7 / vite@7.3.6 / vitest@5.0.1 / typescript@6.0.3
```

**加载器契约模拟**（按 siyuan `app/src/plugin/loader.ts` 的 eval + require shim 逻辑在 Node 中执行 `dist/index.js`）：

```
pluginClass is function: true
extends Plugin: true
[siyuan-mermaid-wysiwyg-editor] plugin loaded
[siyuan-mermaid-wysiwyg-editor] plugin unloaded
LOADER SIMULATION OK
```

`dist/index.js` 产物结构（未压缩，目标环境 esnext）：

```js
'use strict';
const siyuan = require('siyuan');
class MermaidWysiwygEditorPlugin extends siyuan.Plugin { ... }
module.exports = MermaidWysiwygEditorPlugin;
```

构建输出无警告（无 configLoader 告警、无 external 告警）。

## 四、变更文件清单

- 新增：`package.json`、`package-lock.json`、`plugin.json`、`tsconfig.json`、`vite.config.mts`、`.gitignore`、`src/index.ts`、`src/__tests__/smoke.test.ts`
- 未触碰：`need.md`、`思源-Mermaid-双向编辑插件-设计文档-v1.0.md`、`changes/` 下全部规划工件（含 `.spec-superflow.yaml` 的既有未提交修改，均留给流程/父代理处理）
- `dist/` 与 `node_modules/` 按 `.gitignore` 不入库

## 五、自审

- **完整**：任务 9 项要求逐条落实（package.json/plugin.json/tsconfig/vite/src 入口/vitest/冒烟测试/构建测试通过/提交）。
- **最小**：未实现 block-icon、快捷键、Dialog 等后续任务逻辑（YAGNI）；无多余依赖（未引入 vite-plugin-static-copy、zip 插件等）。
- **测试运行器对未来任务可用**：`vitest run` 与 `tsc --noEmit` 均验证通过；T2–T4 新增 `src/utils/fence.ts`、`src/controller/debounce.ts`、`src/render/backend.ts` 后，`test.include`（`src/**/*.test.ts`）与 tsconfig include（src）自动覆盖。
- **干净**：构建与测试输出零告警；脚手架探针目录已清理。

## 六、顾虑 / 需后续留意

1. `plugin.json` 中 `author`/`url` 为占位值（仓库无 remote 可引用），`readme` 指向 `README.md`/`README_zh_CN.md`，但本期未创建 README 文件（按"不主动创建文档"约束）。发布前需补齐 README 并替换 author/url，否则集市页 readme 会 404。
2. vite 8（Rolldown）CJS default export 静默丢失的问题仅在本骨架验证过（最小复现成立）；若未来升级 vite 大版本，需重新跑本报告第三节的证据命令确认产物仍含 `module.exports = <class>`。
3. `dist/` 未打包 zip（本期要求仅 dist 目录，符合任务说明）。
