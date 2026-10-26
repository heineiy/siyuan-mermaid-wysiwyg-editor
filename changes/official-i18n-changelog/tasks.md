# 任务清单：对齐思源插件规范

## Delivery / Proof Map

| Requirement | Task(s) | Evidence |
|-------------|---------|----------|
| AC-1 `zh_CN` 键 | 1 | plugin.json 解析 + 键名断言 |
| AC-2/AC-3 i18n 目录与加载优先级 | 2 + 3 | i18n 单测全绿 |
| AC-4 包内 i18n/CHANGELOG | 4 | `unzip -l package.zip` |
| AC-5 全量验证 | 5 | tsc + test + build |

---

## Tasks

- [x] 1 修正 plugin.json 本地化键为 zh_CN（displayName/description/readme），保持值不变；证明：`node -e` 断言三对象键为 `['default','zh_CN']`，dist/plugin.json 同步
- [x] 2 抽出词典到 i18n/en.json 与 i18n/zh_CN.json，tsconfig 开启 resolveJsonModule，改造 t() 为“plugin.i18n → 内置词典 → key”；证明：新增宿主优先/清除回退/key 集合一致 3 个用例，i18n 测试 7 项通过
- [x] 3 onload 注入 plugin.i18n 文案表（setPluginI18n）；证明：`tsc --noEmit` 退出码 0，206 项测试通过
- [x] 4 构建静态资源复制扩展：i18n/*.json 复制到 dist/i18n/，并把 CHANGELOG.md 一并复制到 dist 根；证明：`package.zip` 根含 CHANGELOG.md、i18n/en.json、i18n/zh_CN.json、index.js、plugin.json
- [x] 5 同步 README（中英）目录结构与说明，并完成 tsc + npm test + npm run build 全量验证；证明：tsc exit 0、206 passed、build 成功
