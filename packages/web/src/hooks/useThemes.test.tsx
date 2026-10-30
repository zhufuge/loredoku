import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { themesApi } from '@/api/themes';
import { useDeleteTheme } from './useThemes';

/**
 * v0.8.3（docs/v0.8.3.md §13）：删除成功时顺手忘掉「上一次在哪个工作空间」。
 *
 * 系统配置正是删完主题落脚的地方，而它的「返回工坊」读的就是这条记忆。留着被删
 * 的编码，点回去得到的是「没有编码是 xxx 的主题」—— 明明还有别的工坊开着。
 */
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/api/themes', () => ({
  themesApi: { remove: vi.fn() },
}));

describe('useDeleteTheme', () => {
  let container: HTMLDivElement;
  let root: Root;
  let client: QueryClient;
  let remove: ((code: string) => Promise<unknown>) | null = null;

  /** 只挂「删除」，用于观察它顺带做的事。 */
  function DeleteProbe(): null {
    const { mutateAsync } = useDeleteTheme();
    remove = (code) => mutateAsync(code);
    return null;
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    remove = null;
    window.localStorage.clear();
    vi.mocked(themesApi.remove).mockResolvedValue(null);
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <DeleteProbe />
        </QueryClientProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    client.clear();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('删的就是记住的那间 → 记忆一起清掉', async () => {
    window.localStorage.setItem('loredoku.lastTheme', 'gone');

    await act(async () => {
      await remove?.('gone');
    });

    expect(themesApi.remove).toHaveBeenCalledWith('gone');
    expect(window.localStorage.getItem('loredoku.lastTheme')).toBeNull();
  });

  it('删的是别的主题 → 记住的那间不动', async () => {
    window.localStorage.setItem('loredoku.lastTheme', 'hlm');

    await act(async () => {
      await remove?.('gone');
    });

    expect(window.localStorage.getItem('loredoku.lastTheme')).toBe('hlm');
  });

  /**
   * 服务端拒绝时（主题里还有东西）什么都不该发生 —— 记忆还是那间还开着的工坊。
   */
  it('删除失败不动记忆', async () => {
    window.localStorage.setItem('loredoku.lastTheme', 'gone');
    vi.mocked(themesApi.remove).mockRejectedValueOnce(new Error('主题下还有 2 个资源'));

    await act(async () => {
      await remove?.('gone').catch(() => undefined);
    });

    expect(window.localStorage.getItem('loredoku.lastTheme')).toBe('gone');
  });
});
