# 提案：剩余硬编码文案统一迁移到 i18n/*.json

## 背景

上一轮已把 `src/utils/i18n.ts` 的硬编码词典替换为官方 `i18n/en.json`、`i18n/zh_CN.json`，`t()` 优先读 `plugin.i18n`。但代码中仍有 15 处**用户可见**的中文字面量未走 `t()`，英文界面下会显示中文，导致国际化不完整。

## 范围（In Scope）

统一迁移以下位置到 `i18n/*.json`（中英成对新增 key）：

| 位置 | 现有文案 |
|------|----------|
| `src/index.ts` 快捷键设置 | 标题“快捷键”、说明段 |
| `src/index.ts` / `src/controller/sync.ts` | “可视化编辑器加载失败：…” |
| `src/controller/sync.ts` | “只读预览加载失败：…” |
| `src/adapters/router.ts` | “该图类型暂不支持可视化编辑”/“仅支持只读预览” |
| `src/index.ts` 内核 API 封装 | “getBlockKramdown 失败/updateBlock 失败” |
| `src/utils/fence.ts` | “输入不是 mermaid 围栏代码块/缺少结束围栏” |
| `src/utils/exporter.ts` | “未返回有效 SVG/SVG 加载失败/canvas 返回 null” |
| `src/utils/exporter-ui.ts` | “mermaid 模块缺失/不可用” |

## 非目标（Out of Scope）

- 不改动 `console.warn/error` 日志（开发者可见，非 UI 文案）。
- 不改动业务逻辑、导出算法、写回流程。
- 不新增语言；不改版本号、不发版。

## 验收标准

| 编号 | 验收点 | 证据 |
|------|--------|------|
| AC-1 | 新增 key 在 `i18n/en.json` 与 `i18n/zh_CN.json` 中成对存在且集合一致 | 既有 key 一致性单测通过 |
| AC-2 | `router.ts` 返回的 message 随当前语言变化 | router 单测改为断言 `t(key)`，中/英各验一次 |
| AC-3 | 加载失败、只读失败、导出失败、快捷键设置文案均走 `t()` | 代码检索：上述位置无中文字面量 |
| AC-4 | `fence.ts` 原有 `toThrow()` 用例不回归 | `npm test` 全绿 |
| AC-5 | 类型检查 / 单测 / 构建通过，包结构不变 | `tsc --noEmit`、`npm test`、`npm run build` |

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| `router.ts` 导出的常量被测试依赖 | 改为函数式消息或在 `route()` 内取 `t()`，同步更新测试断言 |
| `fence.ts` 是纯函数，引入 `t()` 增加环境依赖 | 仅错误分支调用；测试环境已提供 DOM，且断言只看 `toThrow` |
| 新增 key 遗漏翻译导致英文缺失 | 沿用“中英 key 集合一致”单测 + 全量扫描 |

## 影响面

`i18n/en.json`、`i18n/zh_CN.json`、`src/index.ts`、`src/controller/sync.ts`、`src/adapters/router.ts`、`src/utils/fence.ts`、`src/utils/exporter.ts`、`src/utils/exporter-ui.ts`、相关测试。
