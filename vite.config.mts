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
    },
  },
  plugins: [copyPluginJson()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
