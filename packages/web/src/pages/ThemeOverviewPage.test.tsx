import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapGameSummary, Theme, ThemeDeploymentSummary } from '@loredoku/shared';
import { ThemeOverviewPage } from './ThemeOverviewPage';

/**
 * v0.8.0 §18：`/:code/overview` —— 工作空间的概览。
 *
 * 这一屏只回答「这个空间是什么」，所以钉四件事：
 *
 * 1. 四个计数是**入口**（链到本主题的模块），不是四个装饰数字；
 * 2. 编码 / 缺省风格 / 上线状态都是「别处改不了但必须知道」的事实；
 * 3. 主按钮只有「上线」，低频动作在 `⋯` 里（§16.2）；
 * 4. 导出的包只含**这个主题**已上线的关（§16.10）。
 */

const themeRef: Theme = {
  code: 'hlm',
  name: '红楼梦',
  description: '大观园里的推理。',
  data: { version: 1 },
  counts: { assets: 49, maps: 8, characters: 32, puzzles: 8, games: 6 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const workspaceRef: { value: unknown } = { value: null };
const gamesRef: { data: MapGameSummary[] } = { data: [] };
const deploymentsRef: { data: ThemeDeploymentSummary[] } = { data: [] };
const deleteMutate = vi.fn(() => Promise.resolve());

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));
vi.mock('@/hooks/useGames', () => ({ useGames: () => gamesRef }));
vi.mock('@/hooks/useThemes', () => ({
  useThemeDeployments: () => deploymentsRef,
  useUpdateTheme: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
  useDeleteTheme: () => ({ mutateAsync: deleteMutate, isPending: false }),
  useDeployTheme: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
}));

function game(id: number, themeCode: string, name: string): MapGameSummary {
  return {
    id,
    puzzleId: id * 10,
    themeCode,
    puzzleName: name,
    puzzleVersionNo: 2,
    name,
    slug: `slug-${id}`,
    coverUrl: null,
    difficulty: 'easy',
    gridSize: 6,
    participantCount: 3,
    createdAt: '2026-10-01T00:00:00.000Z',
  };
}

describe('ThemeOverviewPage（v0.8.0 §18）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) =>
        node.textContent?.trim().includes(label) === true ||
        node.getAttribute('aria-label')?.includes(label) === true,
    );
  const hrefs = (): string[] =>
    Array.from(document.querySelectorAll('a')).map((node) => node.getAttribute('href') ?? '');

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/hlm/overview']}>
          <ThemeOverviewPage />
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    workspaceRef.value = {
      theme: themeRef,
      themes: [themeRef],
      themeCode: themeRef.code,
      href: (module: string) => `/hlm/${module}`,
    };
    gamesRef.data = [game(1, 'hlm', '撕扇'), game(2, 'default', '别的主题的关')];
    deploymentsRef.data = [];
    deleteMutate.mockClear();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('四个计数既是数字也是入口 —— 点进去是本主题的模块', () => {
    render();

    expect(text()).toContain('49');
    expect(text()).toContain('32');
    expect(hrefs()).toEqual(
      expect.arrayContaining(['/hlm/assets', '/hlm/maps', '/hlm/characters', '/hlm/puzzles']),
    );
  });

  it('编码与缺省风格都写成事实，而不是可点的控件', () => {
    render();

    expect(text()).toContain('hlm');
    expect(text()).toContain('未设置');
    // 风格只能在画布上设 —— 这里说清去哪儿设，而不是放一个点不动的按钮。
    expect(text()).toContain('设为主题风格');
  });

  it('主题风格已设过时，那一行改口说「已设置」', () => {
    workspaceRef.value = {
      ...(workspaceRef.value as object),
      theme: { ...themeRef, data: { version: 1, style: {} } },
    };
    render();
    expect(text()).toContain('已设置');
  });

  it('主按钮只有一个（上线），导出与改名都在 ⋯ 里', () => {
    render();

    expect(button('上线')).toBeDefined();
    expect(button('导出资源包')).toBeUndefined();

    act(() => button('更多操作')?.click());
    expect(button('导出资源包')).toBeDefined();
    expect(button('重命名')).toBeDefined();
    expect(button('删除主题')).toBeDefined();
  });

  it('导出对话框只列这个主题已上线的关', () => {
    render();
    act(() => button('更多操作')?.click());
    act(() => button('导出资源包')?.click());

    expect(text()).toContain('导出资源包 · 红楼梦');
    expect(text()).toContain('撕扇');
    expect(text()).not.toContain('别的主题的关');
  });

  it('主题里还有东西时「删除」不可点 —— 先把数量说清楚再拦', () => {
    render();
    act(() => button('更多操作')?.click());
    act(() => button('删除主题')?.click());

    expect(text()).toContain('主题下还有 49 个资源');
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === '删除',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
