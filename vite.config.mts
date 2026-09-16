import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 将 plugin.json（思源插件清单）复制到构建产物根目录。
 * SiYuan 插件目录要求同时包含 plugin.json 与入口 JS（index.js）。
 */
const copyPluginJson = (): Plugin => {
  let outDir = "dist";
  return {
    name: "copy-plugin-json",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const manifest = readFileSync(resolve("plugin.json"), "utf-8");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(resolve(outDir, "plugin.json"), manifest);
    },
  };
};

export default defineConfig({
  build: {
    minify: false,
    sourcemap: false,
    target: "esnext",
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      // SiYuan 前端加载器以 CommonJS 包装（eval + require shim）执行插件入口，
      // 因此产物必须为 CJS 并在运行时 require("siyuan")（对应官方 webpack 的 commonjs2 + externals）。
      external: ["siyuan"],
      output: {
        // 思源加载器按 esModule interop 取 module.default 实例化插件类
        // （生产验证：参考插件 bundle 尾部 exports.default = PluginClass + __esModule）。
        // rollup 对 default-only 入口缺省输出 module.exports = Class（无 .default），
        // 会导致加载器取到 undefined、插件从未实例化——必须显式 named。
        exports: "named",
      },
    },
  },
  plugins: [copyPluginJson()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // siyuan 为纯类型声明包（exports 仅含 types 条件、无运行时入口），测试
    // 环境以别名指向占位模块使 vi.mock("siyuan") 的解析可成功；生产构建
    // 不受影响（rollupOptions.external 保持运行时 require("siyuan")）。
    alias: { siyuan: resolve("src/test-utils/siyuan.ts") },
  },
});
