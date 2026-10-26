# 最终评审：剩余硬编码文案迁移

## 评审范围

- Base: `031b796`（当前 target 分支 master 与本分支的 merge-base；因此范围同时包含上一轮 i18n 目录化改动与文档路径修正）
- Head: `0e3c2cd`
- 重点关注：`i18n/*.json`、`src/adapters/router.ts`、`src/controller/sync.ts`、`src/index.ts`、`src/utils/{fence,exporter,exporter-ui,i18n}.ts`、相关测试

## 结论

**Verdict: pass**

## 逐项核对

| 项 | 结果 | 证据 |
|----|------|------|
| 新增 key 中英成对 | ✅ | `en` 55 key / `zh_CN` 55 key；`Object.keys(...).sort()` 相等单测通过 |
| 无遗留用户可见硬编码 | ✅ | 扫描 `src`：剩余中文仅注释与 `console.*` 日志（按范围约定保留） |
| router 提示随语言切换 | ✅ | `unknownTypeMessage()` / `readonlyTypeMessage()` 动态取 `t()`；新增中英切换用例通过 |
| 加载/只读失败提示 | ✅ | `sync.ts` 与 `index.ts` 均改为 `${t("error.loadFailed")}: ...` |
| 内核 API 失败提示 | ✅ | `error.getBlockFailed` / `error.updateBlockFailed` |
| 围栏错误 | ✅ | 两条消息走 `t()`，保留 `stripFence:` 技术后缀便于排查；既有 `toThrow` 用例全绿 |
| 导出错误 | ✅ | `export.svgInvalid/svgLoadFailed/blobNull/mermaidMissing/mermaidUnavailable` 全部接入 |
| 无 DOM 环境安全 | ✅ | `currentLang()` 在 `typeof document === "undefined"` 时返回空串 → 回退英文，Node 环境测试不再抛 ReferenceError |
| 无回归 | ✅ | `npx tsc --noEmit` exit 0；`npm test` 207 passed / 3 skipped；`npm run build` 成功，`package.zip` 结构未变（仍含 `i18n/`、`CHANGELOG.md`） |

## 观察（不阻塞）

- `router.ts` 原 `UNKNOWN_TYPE_MESSAGE` / `READONLY_TYPE_MESSAGE` 常量改为函数；已同步更新唯一的测试引用，无外部调用方。
- `exporter-ui.ts` 内原有局部变量 `t`（图类型）与 i18n 的 `t()` 同名，已重命名为 `diagramType`，避免遮蔽。
- 本分支尚未合入 master，按用户要求等待统一手工验证后再收口。

## 验证命令

```
npx tsc --noEmit
npm test
npm run build
unzip -l package.zip
```
