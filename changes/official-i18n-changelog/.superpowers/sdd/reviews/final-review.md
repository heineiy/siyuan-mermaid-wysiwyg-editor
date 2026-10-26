# 最终评审：对齐思源插件规范

## 评审范围

- Base: `031b796`
- Head: `9cdbd17`
- 评审对象：`plugin.json`、`i18n/*.json`、`src/utils/i18n.ts`、`src/utils/i18n.test.ts`、`src/index.ts`、`vite.config.mts`、`tsconfig.json`、README（中/英）

## 结论

**Verdict: pass**

## 逐项核对

| 项 | 结果 | 证据 |
|----|------|------|
| `plugin.json` 本地化键 `zh_CN` | ✅ | `displayName/description/readme` 键均为 `['default','zh_CN']`，`dist/plugin.json` 同步 |
| `i18n/` 文件名与思源兼容 | ✅ | 内核 `kernel/model/plugin.go` 按 `Conf.Lang → en → zh-CN` 及 `LangToLegacy`（zh-CN→zh_CN）回退，故 `en.json`/`zh_CN.json` 均会被自动加载 |
| `t()` 加载优先级 | ✅ | 宿主 `plugin.i18n` → 内置词典（按 `<html lang>`）→ `en` → key；3 个新增用例覆盖 |
| 中英词典不漂移 | ✅ | 单测断言 key 集合一致 |
| CJS 约束 | ✅ | 词典为**静态 import**，未引入运行时动态 import；产物仍为单文件 `index.js` |
| 构建产物 | ✅ | `package.zip` 根含 `i18n/en.json`、`i18n/zh_CN.json`、`CHANGELOG.md`、`index.js`、`plugin.json`、`icon.png`、`preview.png`、README |
| 无回归 | ✅ | `npx tsc --noEmit` 退出码 0；`npm test` 206 passed / 3 skipped；`npm run build` 成功 |

## 观察（不阻塞）

- `i18n/` 目录同时被静态内联进 `index.js` 与复制到包内，体积增加约 3 KB；这是“宿主加载 + 兜底”双保险的预期代价。
- 本次未改版本号、未发 Release，符合“只做规范对齐”的范围。
- `zh_CN.json` 依赖内核 `LangToLegacy` 映射；若未来移除该兼容层，可改名为 `zh-CN.json`，逻辑无需调整。

## 验证命令

```
npx tsc --noEmit
npm test
npm run build
unzip -l package.zip
```
