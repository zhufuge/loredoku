import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@loredoku/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    /*
     * Vitest 改文件时会在源码目录留下 `.<file>.<pid>.<hash>.tmpdir/` 原子写入目录。
     * Windows 上 Vite 的 watcher 去 watch 那个临时文件会因 EBUSY 直接崩掉整个 dev
     * server（跑测试时尤其容易撞上）。 ignore 掉，只盯着真正的源码。
     */
    watch: {
      ignored: ['**/*.tmpdir/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // @remix-run/router 必须跟 react-router 同组，否则 ui→react→ui 成环
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id) || id.includes('@remix-run')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack')) return 'vendor-query';
            return 'vendor-ui';
          }
          if (/[\\/]src[\\/](lib|api)[\\/]/.test(id) || /[\\/]src[\\/]components[\\/]ui[\\/]/.test(id)) {
            return 'shared';
          }
          if (/[\\/]src[\\/]hooks[\\/]/.test(id) && !/[\\/]src[\\/]hooks[\\/]useEditor/.test(id)) {
            return 'shared';
          }
        },
      },
    },
  },
});
