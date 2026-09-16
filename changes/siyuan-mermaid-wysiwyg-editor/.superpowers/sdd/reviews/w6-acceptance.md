# Wave 6 Review Report: w6-acceptance

**审查范围**：T14 §11 四项验收用例套件

**审查方式**：控制器人工代码审查（实现核对 + 全量测试 + verify:acceptance + tsc + 构建）

## 验收核对

| 证据命令 | 结果 |
| --- | --- |
| `npm test` | ✅ 170/170 通过（基线 163 + 验收 7，零回归） |
| `npm run verify:acceptance` | ✅ 7/7 通过 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| `npm run build` | ✅ 构建通过（含 mermaid/elk 产物） |

## §11 四项验收映射

| 验收项 | 测试组 | 断言要点 |
| --- | --- | --- |
| ① 拖拽/改字无损更新、卸载零损坏 | acceptance.test.ts「无损更新与零损坏」 | 写回内容 = wrapFence(最新编辑)；destroy 后数据仍为合法围栏文本 |
| ② 拖拽无落盘风暴 | 「防抖红线」 | 100 次高频 onGraphChange → updateBlock 0 次；停顿 500ms → 恰好 1 次；写回次数有界 |
| ③ 改文本重开画布正确反映 | 「正向流」 | 不同 markdown 输入 → fake backend init 收到剥离后的新纯文本 |
| ④ 新增 full 适配器零改动接入 | 「§8 兼容扩展」 | 注册 xmind full 假想适配器 → 同一 initEditorSession 直接可用、写回链路生效 |

## 规格符合性

- TDD RED 以可证伪性变异实测（防抖窗口变异命中②、wrapFence 损坏命中①/②/④），证明验收测试确实能捕获回归——验收套件可信。
- 全链路使用真实核心实现（registry/适配器/route/initEditorSession/fence/debounce），仅 mock 宿主与后端，符合"不 mock 被测核心"原则。

## 代码质量

- verify:acceptance 脚本已入 package.json，证据命令可复现。
- 假想 XmindAdapter 仅存在于测试，不注册进生产路径。

## 发现

- **Info**：真实思源宿主人工验证仍缺位（@visimer/dom 未发布，同 w3/w4/w5 记录）——列为发布前检查清单。
- 全部 wave review receipts 均为 pass。

## 结论

**verdict: pass** — 四项验收全部可观测通过、测试与构建全绿、代码质量良好。
