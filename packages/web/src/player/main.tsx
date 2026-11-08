import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { registerBundledFonts } from '@/lib/fonts';
import { playerRouter } from './router';
import '@/index.css';

/**
 * v0.9.0（docs/v0.9.0.md §3）—— 播放器的入口。
 *
 * 与工坊的 `main.tsx` 差三件事，都是**减**出来的：
 *
 * 1. 没有 `axios` 与 `ApiError` —— 这个产物一个 `/api` 都不打；
 * 2. 没有 `shouldRetry` 那段（它判的是「网络断了才重试」）—— 包取不到是配置错误，
 *    重试没有意义，所以 query 的默认 `retry` 直接关掉；
 * 3. 路由是 `playerRouter`，两条路径，没有 workspace / 编辑器。
 *
 * 字体照旧注册：播放器自带一份构建期字体（包里不带字体文件，见 v0.8.0 §11.5），
 * 与工坊同一个 `registerBundledFonts()`，所以同一主题在两个入口里字形一致。
 */
registerBundledFonts();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
});

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found');
}

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={playerRouter} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
