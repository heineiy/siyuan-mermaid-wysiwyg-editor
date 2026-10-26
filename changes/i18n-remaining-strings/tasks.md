# 任务清单：剩余硬编码文案迁移

## Delivery / Proof Map

| Requirement | Task(s) | Evidence |
|-------------|---------|----------|
| AC-1 key 成对 | 1 | en/zh 各 55 key，集合一致单测通过 |
| AC-2 router 动态消息 | 2 | router 测试 + i18n 中英切换用例 |
| AC-3 加载/只读/导出/设置文案 | 3 + 4 + 5 | 代码扫描无用户可见中文字面量 |
| AC-4 fence 不回归 | 4 | fence 既有 toThrow 用例通过 |
| AC-5 全量验证 | 6 | tsc exit 0 / 207 passed / build 成功 |

---

- [x] 1 在 i18n/en.json 与 i18n/zh_CN.json 新增 15 个文案 key；证明：中英各 55 key，集合一致性单测通过
- [x] 2 router.ts 消息改为按当前语言取 t()，更新 adapter-router 测试断言；证明：router 测试通过 + 新增中英切换用例
- [x] 3 sync.ts 与 index.ts 的加载失败、只读失败、内核 API 失败、快捷键设置说明改用 t()；证明：tsc 通过、扫描无残留
- [x] 4 fence.ts 两处错误文案改用 t()（保持 throw 行为）；证明：fence 既有 toThrow 用例全绿
- [x] 5 exporter.ts 与 exporter-ui.ts 导出错误文案改用 t()；证明：exporter 测试通过
- [x] 6 全量验证：npx tsc --noEmit、npm test、npm run build，并扫描 src 确认仅剩注释/日志为中文；证明：tsc exit 0、207 passed、build 成功
