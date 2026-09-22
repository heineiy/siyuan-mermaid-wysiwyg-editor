import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import zipPack from "vite-plugin-zip-pack";

/**
 * 将思源插件运行所需的静态资源复制到构建产物目录。
 * 参考 task-note-management：dist/ 目录本身就是 package.zip 的内容根目录，
 * 即 zip 解压后根目录直接是 index.js / plugin.json / icon.png 等，不能多一层 dist/。
 */
const copyStaticAssets = (): Plugin => {
  let outDir = "dist";
  // 思源插件目录必须包含的前端资源
  const assets = [
    "plugin.json",
    "icon.png",
    "preview.png",
    "README.md",
    "README.en.md",
    "LICENSE",
  ];
  return {
    name: "copy-siyuan-assets",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      mkdirSync(outDir, { recursive: true });
      for (const file of assets) {
        const src = resolve(file);
        try {
          copyFileSync(src, resolve(outDir, file));
        } catch {
          // 允许某些文件缺失（如 README.en.md），静默跳过
        }
      }
    },
  };
};

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
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
        // 思源插件必须是单文件入口：加载器的 require shim 只提供 'siyuan' 等模块名映射，
        // 不解析相对路径 require('./chunk-xxx.js')（生产验证：drawio / copyAsImage /
        // task-note-management 等正常插件全部为单 index.js）。mermaid 内部按图类型
        // 动态 import，缺省会拆出 60+ chunk 导致入口加载失败——必须全部内联。
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    copyStaticAssets(),
    // 将 dist/ 整体打为根目录 package.zip，确保 zip 内无 dist/ 前缀
    zipPack({
      inDir: "./dist",
      outDir: "./",
      outFileName: "package.zip",
    }),
  ],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // siyuan 为纯类型声明包（exports 仅含 types 条件、无运行时入口），测试
    // 环境以别名指向占位模块使 vi.mock("siyuan") 的解析可成功；生产构建
    // 不受影响（rollupOptions.external 保持运行时 require("siyuan")）。
    alias: { siyuan: resolve("src/test-utils/siyuan.ts") },
  },
});
