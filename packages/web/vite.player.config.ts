import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/extensions
import { bundleAssets } from './scripts/bundleAssets.mjs';
import { fontSubsetPlugin } from './scripts/fontSubset.mjs';
import { resolveBundlePath } from './scripts/playerEnv.mjs';

/** v0.9.0（docs/v0.9.0.md §8）：播放器（工坊之外第二份产物）的构建配置 —— base `/loredoku/`、入口 `player.html`、`bundleAssets()`。
 *  包是必填的（仓库根 `.env` 的 `LOREDOKU_BUNDLE` 给默认值，§14）：没有包直接构建失败，好过产出空壳。 */
/** 用函数形式是为了拿 `mode` / `isPreview`：`mode` 让 `resolveBundlePath` 挑 `.env.[mode]`（顺序与 Vite 一致）；
 *  `preview` 服务已烤好包的 `dist-player/`，传 `null` 走 `peek()` 不读 `.env`（包删了也能预览上一次产物）。 */
export default defineConfig(({ mode, isPreview }) => {
  const bundlePath = isPreview ? null : resolveBundlePath({ mode });

  return {
    plugins: [
      react(),
      bundleAssets(bundlePath),
      /** v0.11.3（docs/v0.11.3.md §1）—— 必须排在 `bundleAssets` **后面**：字符集要算上包里的 JSON，而那是它在 `generateBundle` 里才 `emitFile` 进来的。 */
      fontSubsetPlugin(),
    ],
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
      /** **不清空产物目录**。两个理由： 1. 包里可能有几千个文件，删一遍再写一遍纯属浪费； 本机的文件系统 shim 对「递归删目录」会失败（`safe-delete` 走回收站， 目录操作被拒），`emptyOutDir: true` 会让第二次构建直接报错。 代价：换主题 / 换版本后旧文件会留在原地（尤其哈希过的 `assets/*`）。发布前手动删一次 `dist-player/` 即可 —— `npm run build:player` 不替你决定这件事。 */
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
  };
});
