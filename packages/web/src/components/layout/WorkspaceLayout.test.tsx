import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { WorkspaceLayout } from './WorkspaceLayout';
import { AppShell } from './AppShell';

/**
 * v0.8.0 §18：`/:themeCode` 的解析与两种外壳。
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：只留**地址契约** —— 模块链接带当前编码、
 * 编码不存在时点名、两个「回工坊」都指向入口（`/`）。这三条各自对应一个已经
 * 踩过的死链，界面怎么排都不该变。
 *
 * 顶栏写什么名字、概览是不是排第一、品牌后面有没有斜杠、按钮谁在谁右边 ——
 * 这些都是布局与文案，删掉（它们会随界面改）。
 */

const themesRef: { data: Theme[] | undefined; isLoading: boolean; isError: boolean; error: unknown } = {
  data: undefined,
  isLoading: false,
  isError: false,
  error: null,
};

vi.mock('@/hooks/useThemes', () => ({ useThemes: () => themesRef }));

/** §19：主题在接口上只有编码，没有 id、没有 isDefault。 */
function theme(code: string, name: string): Theme {
  return {
    code,
    name,
    description: null,
    data: { version: 1 },
    counts: { assets: 1, maps: 2, characters: 3, puzzles: 4, games: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('WorkspaceLayout（v0.8.0 §18）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const links = (): HTMLAnchorElement[] => Array.from(document.querySelectorAll('a'));
  const hrefs = (): string[] => links().map((node) => node.getAttribute('href') ?? '');

  function render(path: string): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/:themeCode" element={<WorkspaceLayout />}>
              <Route path="maps" element={<p>地图正文</p>} />
              <Route path="overview" element={<p>概览正文</p>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    themesRef.data = [theme('default', '默认'), theme('hlm', '红楼梦')];
    themesRef.isLoading = false;
    themesRef.isError = false;
    themesRef.error = null;
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('模块链接带当前主题编码 —— 同一套模块，换主题就换前缀', () => {
    render('/hlm/maps');

    expect(text()).toContain('地图正文');
    // 六个模块全都指向 `/hlm/*`；没有一条还在老地址上。
    expect(hrefs()).toEqual(
      expect.arrayContaining([
        '/hlm/overview',
        '/hlm/assets',
        '/hlm/maps',
        '/hlm/characters',
        '/hlm/puzzles',
        '/hlm/deployments',
      ]),
    );
    expect(hrefs().filter((href) => href === '/maps')).toHaveLength(0);
  });

  it('编码不存在时点名那个编码，并给出两条能走的路', () => {
    render('/nope/maps');

    expect(text()).toContain('nope');
    expect(hrefs()).toEqual(expect.arrayContaining(['/settings/themes']));
    // 没有任何模块被渲染出来 —— 不能让作者以为自己在某个主题里。
    expect(text()).not.toContain('地图正文');
  });

  /**
   * v0.8.3（docs/v0.8.3.md §13）：这一页最常见的来路就是「地址里那间刚被删掉」，
   * 而 `workshopPath()` 拼的正是「记住的编码」—— 也就是被删的那一个。若这里仍
   * 用 `workshopPath('overview')`，这个按钮会把自己指回自己，点几下都出不去。
   *
   * 回**入口**（`/`）：`ThemeEntryRedirect` 会把记住的编码对着现有列表验一遍，
   * 失效就落到还开着的第一间。
   */
  it('「回到工坊」去入口，不去记忆里那个已失效的编码', () => {
    window.localStorage.setItem('loredoku.lastTheme', 'nope');
    render('/nope/maps');

    const back = links().find((node) => node.textContent?.trim() === '回到工坊');
    expect(back?.getAttribute('href')).toBe('/');
  });
});

describe('AppShell · config（v0.8.0 §18）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings/themes']}>
          <Routes>
            <Route path="/settings" element={<AppShell variant="config" />}>
              <Route path="themes" element={<p>主题列表正文</p>} />
            </Route>
          </Routes>
        </MemoryRouter>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  /**
   * v0.8.3（docs/v0.8.3.md §13）：删完主题就落在这张列表上，而「返回工坊」原先
   * 拼的是「记住的编码」—— 那正好是刚被删掉的那个，于是点回去得到「没有编码是
   * xxx 的主题」。
   *
   * 现在它指向 `/`：选哪一间由入口统一裁定（记住且还在 → 它；否则第一间）。
   */
  it('「返回工坊」去入口，不自己拼一个可能已被删掉的编码', () => {
    const back = Array.from(document.querySelectorAll('header a')).find(
      (node) => node.textContent?.trim() === '返回工坊',
    );
    expect(back?.getAttribute('href')).toBe('/');
  });
});
