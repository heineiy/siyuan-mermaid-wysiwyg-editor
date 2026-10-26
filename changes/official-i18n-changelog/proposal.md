# 提案：对齐思源插件规范（zh_CN 键 / 官方 i18n 目录 / 打包 CHANGELOG）

## 背景

参考 `~/work/qt/siyuan-plugin-task-note-management` 的发布包后发现三处可借鉴差异：

1. 该插件 `plugin.json` 的本地化键使用思源规范 `zh_CN`（下划线），本项目使用 `zh-CN`（连字符），集市可能只回退到 `default`，中文名称/描述/README 不生效。
2. 该插件把文案放在 `i18n/en.json`、`i18n/zh_CN.json`，运行期优先读 `plugin.i18n`，静态import 词典兜底；本项目文案硬编码在 `src/utils/i18n.ts`，不符合插件规范且字典随 bundle 膨胀。
3. 该插件把 `CHANGELOG.md` 打进 `package.zip`；本项目只用于抽取 Release notes，安装后看不到版本历史。

## 范围（In Scope）

1. **`zh_CN` 键修正**：`plugin.json` 中 `displayName`、`description`、`readme` 三个对象的 `zh-CN` 改为 `zh_CN`。
2. **官方 `i18n/` 目录方案**：
   - 新增 `i18n/en.json`、`i18n/zh_CN.json`，收纳现有全部文案 key；
   - `src/utils/i18n.ts` 改为“优先 `plugin.i18n`（思源按语言自动加载）→ 内置 JSON 兜底 → 返回 key”，对外 `t(key)` API 保持不变；
   - `onload` 注入插件实例文案表；
   - 构建时把 `i18n/*.json` 复制进 `dist/`。
3. **打包 `CHANGELOG.md`**：将其加入构建静态资源复制清单，出现在 `package.zip` 根目录。

## 非目标（Out of Scope）

- 不新增语言（仅中/英）。
- 不引入 `kernel.js`、`index.css`、`assets/`、`audios/`、`skills/` 等本插件不产出的文件。
- 不改动任何编辑/导出业务逻辑，不发版、不改版本号。

## 验收标准

| 编号 | 验收点 | 证据 |
|------|--------|------|
| AC-1 | `plugin.json` 三个本地化对象键为 `zh_CN`，JSON 合法 | `node -e` 解析 + 键名断言 |
| AC-2 | `i18n/en.json` 与 `i18n/zh_CN.json` key 集合完全一致 | 新增单测 |
| AC-3 | `t()` 在 `plugin.i18n` 缺失时仍按语言返回内置文案；命中 `plugin.i18n` 时优先返回宿主文案 | 新增单测 |
| AC-4 | `dist/` 与 `package.zip` 根目录均含 `i18n/en.json`、`i18n/zh_CN.json`、`CHANGELOG.md` | `unzip -l package.zip` |
| AC-5 | 类型检查、单测、构建全部通过 | `npx tsc --noEmit`、`npm test`、`npm run build` |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 运行早於 `onload` 时取不到 `plugin.i18n`（热重载/模块初始化） | 与参考项目一致：内置 JSON 兜底，保证任何时机都能返回文案 |
| 两份 JSON key 漂移 | 单测断言 key 集合相等 |
| TS 未开启 `resolveJsonModule` 导致 JSON import 报错 | `tsconfig.json` 增加 `resolveJsonModule: true` |
| 重复打包（静态 import + 复制原文件）增加体积 | 词典约 4 KB，可忽略；换取“官方加载 + 兜底”双保险 |

## 影响面

`plugin.json`、`i18n/*.json`（新增）、`src/utils/i18n.ts`、`src/index.ts`（注入实例）、`vite.config.mts`（静态资源复制）、`tsconfig.json`、`src/utils/i18n.test.ts`、README 目录结构说明。
