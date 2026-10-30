import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemeOverviewPage } from './ThemeOverviewPage';

/**
 * v0.8.3：概览页只回答两件事 —— 「这个空间是什么」与「它按什么规矩长」。
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：这里只留**写回数据的契约** —— 缺省风格改成
 * `data.style`、难度分级改成 `data.difficultyLevels`（含两条边界：什么都没改就
 * 不带这个键、恢复内置五档是删键而不是写一份一样的数组），以及「还有东西的
 * 主题删不掉」。
 *
 * 五格计数、信息卡四行、页头有哪两个按钮、清单里列了哪几组、识别色怎么显示 ——
 * 全是文案与布局，界面还要改，钉在这里只会每天早上叫一次。
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
const deleteMutate = vi.fn(() => Promise.resolve());
const updateMutate = vi.fn((_payload: unknown) => Promise.resolve());

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));
vi.mock('@/hooks/useThemes', () => ({
  useUpdateTheme: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeleteTheme: () => ({ mutateAsync: deleteMutate, isPending: false }),
}));

describe('ThemeOverviewPage（v0.8.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) =>
        node.textContent?.trim() === label ||
        node.textContent?.trim().includes(label) === true ||
        node.getAttribute('aria-label')?.includes(label) === true,
    );

  function render(theme: Theme = themeRef): void {
    workspaceRef.value = {
      theme,
      themes: [theme],
      themeCode: theme.code,
      href: (module: string) => `/hlm/${module}`,
    };
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/hlm/overview']}>
          <ThemeOverviewPage />
        </MemoryRouter>,
      );
    });
  }

  /** 改一个输入框的值。React 认原型上的 setter，直接赋值它看不见。 */
  function type(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  beforeEach(() => {
    deleteMutate.mockClear();
    updateMutate.mockClear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('编辑缺省风格：改一项线宽，保存写回 data.style（其余键原样带着）', () => {
    render();
    act(() => button('编辑缺省风格')?.click());

    const width = document.querySelector<HTMLInputElement>('#theme-style-gridSeparator\\.width');
    expect(width).not.toBeNull();
    type(width as HTMLInputElement, '4');
    act(() => button('保存')?.click());

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { version: number; style: { gridSeparator: { width: number } } };
    };
    expect(payload.data.version).toBe(1);
    expect(payload.data.style.gridSeparator.width).toBe(4);
  });

  it('编辑难度分级：加一档后保存，写回 data.difficultyLevels', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('添加一档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ key: string; label: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(6);
    expect(payload.data.difficultyLevels?.[5]?.key).toBe('tier-1');
  });

  /**
   * 回归：改名字**不改 key**，所以第一版那道 `isBuiltIn` 判断（只比 key）把这次
   * 编辑当成了「还是内置五档」，`difficultyLevels` 被删掉 → 保存后名字又变回去。
   * 作者看到的就是「保存不生效」。名字恰恰是这一屏唯一能自定义的东西之一。
   */
  it('只改名字也要写回 —— 名字正是要存的东西', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[aria-label="第 1 档名称"]',
    ) as HTMLInputElement;
    type(input, '入门');
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ key: string; label: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(5);
    expect(payload.data.difficultyLevels?.[0]).toEqual({ key: 'veryEasy', label: '入门' });
  });

  it('什么都没改就保存，不带 difficultyLevels —— 等同「没配过」', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  /**
   * 「恢复内置五档」不是写一份和内置一模一样的数组 —— 它把 `difficultyLevels`
   * 这个键**删掉**，回到「没配过」。以后内置改了，这类主题跟着改。
   */
  it('恢复内置五档后保存，payload 里没有 difficultyLevels 这个键', () => {
    render({
      ...themeRef,
      data: { version: 1, difficultyLevels: [{ key: 'warmup', label: '热身' }] },
    });
    act(() => button('编辑难度分级')?.click());
    act(() => button('恢复内置五档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  it('主题里还有东西时「删除」不可点 —— 先把数量说清楚再拦', () => {
    render();
    act(() => button('删除主题')?.click());

    expect(text()).toContain('主题下还有 49 个资源');
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === '删除',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
