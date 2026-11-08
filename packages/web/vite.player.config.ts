import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/extensions
import { bundleAssets, resolveBundlePath } from './scripts/bundleAssets.mjs';

/**
 * v0.9.0（docs/v0.9.0.md §8）—— **播放器**的构建配置：工坊之外的第二份产物。
 *
 * 三处与 `vite.config.ts` 不同，都是这个产物存在的理由：
 *
 * 1. `base: '/loredoku/'` —— 播放器部署在 `/loredoku/` 下，产物里的资源地址、
 *    包地址、路由 basename 全部由这一个值推导出来；
 * 2. `input: player.html` —— 入口不是工坊的 `index.html`，所以工坊的页面、
 *    编辑器、api 层都不会被这个产物间接触达；
 * 3. `bundleAssets()` —— 把**一个主题资源包**烤进产物（`<code>/` 下），并在
 *    dev 时用同一形状的 URL 把它递出去。
 *
 * **包是必填的**：没有包，播放器打开就是一屏「没有这个主题」。与其产出一个
 * 一定能跑但一定没内容的壳，不如在这里停下 —— 构建失败比空页面好解释。
 */
/**
 * 包路径由 `scripts/player.mjs` 解析 `--bundle` 后塞进 `LOREDOKU_BUNDLE`；
 * 直接在命令行里写 `--bundle=…` 会被 vite 的 CLI 当成未知选项拒掉（见那个脚本的注释）。
 *
 * 这里**不抛错**：`vite preview` 也会加载这份 config，而 preview 服务的是已经烤好
 * 包的 `dist-player/`。真缺包时由插件的 `buildStart` / `configureServer` 报错。
 */
const bundlePath = resolveBundlePath();

export default defineConfig({
  plugins: [react(), bundleAssets(bundlePath)],
  base: '/loredoku/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@loredoku/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // 工坊在 5173：两个 dev server 同时开着是常态（一边改包、一边看工坊）。
    port: 5174,
    // 播放器不打接口，所以这里**没有** `/api` 代理 —— 少了它，任何漏网的请求
    // 都会在 dev 里立刻 404，而不是被悄悄代理到工坊后端。
  },
  build: {
    outDir: 'dist-player',
    /**
     * **不清空产物目录**。两个理由：
     *
     * 1. 包里可能有几千个文件，删一遍再写一遍纯属浪费；
     * 2. 本机的文件系统 shim 对「递归删目录」会失败（`safe-delete` 走回收站，
     *    目录操作被拒），`emptyOutDir: true` 会让第二次构建直接报错。
     *
     * 代价：换主题 / 换版本后旧文件会留在原地（尤其哈希过的 `assets/*`）。发布前
     * 手动删一次 `dist-player/` 即可 —— `npm run build:player` 不替你决定这件事。
     */
    emptyOutDir: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./player.html', import.meta.url)),
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
              id,
            ) ||
            id.includes('@remix-run')
          ) {
            return 'vendor-react';
          }
          if (id.includes('@tanstack')) return 'vendor-query';
          return 'vendor-ui';
        },
      },
    },
  },
});
