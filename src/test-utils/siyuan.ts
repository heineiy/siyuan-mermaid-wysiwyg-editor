/**
 * siyuan 包测试期解析占位（仅供 vitest 使用，永不参与生产构建）。
 *
 * 事实核实（2026-09-16）：siyuan@1.2.7 为纯类型声明包——package.json exports
 * 的 "." 仅含 types 条件、无运行时入口，vite/vitest 无法将其直接解析为运行时
 * 代码。vite.config.mts 的 test.alias 将 "siyuan" 指向本文件使模块解析成功；
 * 运行时内容由测试内 `vi.mock("siyuan", factory)` 工厂整体替换
 * （见 ./controller/dialog.test.ts），本文件不会被实际执行。
 *
 * 生产构建不受影响：rollupOptions.external 保持运行时 require("siyuan")
 * （由思源宿主提供），test.alias 仅作用于测试模式。
 */
export class Dialog {
  // 占位：运行时由 vi.mock 工厂替换，无需真实实现。
}
