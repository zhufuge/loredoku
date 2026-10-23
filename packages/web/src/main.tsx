import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios from 'axios';
import { RouterProvider } from 'react-router-dom';
import { ApiError } from '@/api/client';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { router } from '@/router';
import { registerBundledFonts } from '@/lib/fonts';
import '@/index.css';

/**
 * v0.7.4: 把 `src/assets/fonts/` 里的字体注册进 `document.fonts`。注册本身不
 * 下载文件，真正的请求发生在第一次有文字用到那款字体时 —— 所以放启动时最省心。
 */
registerBundledFonts();

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) return error.code < 0;
  if (axios.isAxiosError(error)) return !error.response;
  return false;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      staleTime: 30_000,
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
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
