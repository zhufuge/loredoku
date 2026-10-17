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
    proxy: {
      '/api': {
        // DEV-H12: `npm run dev -s 4000` 会注入 VITE_PROXY_TARGET，
        // 让前端把 /api 打到同一个后端端口；不设时行为与 v0.4.1 一致。
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // v0.5.6: 懒加载按页切分后 rollup 又自动切出 20+ 个 2~40kB 的依赖 /
        // 共享碎块（useItems、grid、label、每个 lucide 图标各一份），dist 达
        // 45 个文件。手动分组把三类收敛掉，下载总量不变、文件数减半：
        //   vendor-react — react / react-dom / react-router / scheduler
        //   vendor-query — @tanstack/*
        //   vendor-ui    — radix / lucide / zod / sonner 等其余依赖
        //   shared       — src/lib + src/hooks + src/api（跨页共享的数据层）
        // 页面 chunk 与 components/ 的自动共享切分不动（那是有边界的模块）。
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // @remix-run/router 必须跟 react-router 同组，否则 ui→react→ui 成环
            if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id) || id.includes('@remix-run')) {
              return 'vendor-react';
            }
            if (id.includes('@tanstack')) return 'vendor-query';
            return 'vendor-ui';
          }
          // 基础层合成一个 shared：数据层（lib/hooks/api）+ shadcn 组件（components/ui）。
          // 二者互相引用（ui 用 lib/utils 的 cn，data hooks 用 sonner），分成两个手动
          // chunk 会被 rollup 判成循环 chunk；合成一组后组内无边，且这些件全站共用，
          // 每个页面本来就要下载。
          // useEditor* 四个编辑器流程 hook 除外——它们只被两个编辑器页使用，
          // 进 shared 会让 /play 的玩家白下载；交给 rollup 按动态入口自动分配。
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
