# Changelog

## v0.5.0 / 2026-10-26

- 改进：导出/复制的 PNG、SVG 按图形实际边界裁剪，四周不再有大片空白
- 改进：全部界面文案统一走官方 i18n 词典，英文界面下不再出现中文提示
- 改进：发布包内附带 CHANGELOG，安装后可查看版本记录
- 修复：插件清单本地化键改为 `zh_CN`，集市中文名称/描述正确显示

---

- Improve: exported/copied PNG & SVG are cropped to the diagram bounds, removing large blank margins
- Improve: all UI strings go through official i18n dictionaries; no Chinese leftovers in the English UI
- Improve: CHANGELOG ships inside the release package
- Fix: plugin manifest locale keys use `zh_CN`, so the Chinese name/description show correctly in Bazaar

## v0.4.0 / 2026-09-22

- 新增：高清导出（下载 PNG/SVG、复制 PNG 图片）；连线工具支持锁定连续连线
- 改进：全界面国际化，随思源语言自动切换

- Add: high-res export (download PNG/SVG, copy as PNG image); connect tool with lock for multiple edges
- Improve: full UI i18n (follows SiYuan language)