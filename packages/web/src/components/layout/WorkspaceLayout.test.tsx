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
 * 钉的是**地址即工作空间**这条主张：
 *
 * - 模块链接带当前主题编码（`/hlm/assets`），刷新、分享、前进后退都不丢上下文；
 * - 编码不存在时**说出编码本身**，不悄悄落到默认主题（否则别人发来的链接会
 *   静默变成另一个世界）；
 * - 系统配置页的外壳里没有任何模块。
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

  it('顶栏写着当前主题名，并把选择记下来（旧地址兜底用）', () => {
    render('/hlm/maps');

    expect(text()).toContain('红楼梦');
    expect(window.localStorage.getItem('loredoku.lastTheme')).toBe('hlm');
  });

  it('编码不存在时点名那个编码，并给出两条能走的路', () => {
    render('/nope/maps');

    expect(text()).toContain('没有编码是');
    expect(text()).toContain('nope');
    expect(hrefs()).toEqual(expect.arrayContaining(['/settings/themes']));
    // 没有任何模块被渲染出来 —— 不能让作者以为自己在某个主题里。
    expect(text()).not.toContain('地图正文');
  });

  it('概览页也在同一个外壳里，导航第一项是它', () => {
    render('/hlm/overview');

    expect(text()).toContain('概览正文');
    // 概览不是「第六个内容模块」，而是这个空间自己的首页 —— 排在最前。
    const first = document.querySelector('nav a');
    expect(first?.textContent).toContain('概览');
    expect(first?.getAttribute('href')).toBe('/hlm/overview');
  });
});

describe('AppShell · config（v0.8.0 §18）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';

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

  it('头部没有模块，只有「系统配置」字样与一条回工坊的路', () => {
    expect(text()).toContain('系统配置');
    expect(text()).toContain('主题列表正文');

    // 六个模块一个都不在。
    for (const label of ['概览', '资源', '地图', '角色', '谜题', '部署']) {
      const hit = Array.from(document.querySelectorAll('header a')).find(
        (node) => node.textContent?.trim() === label,
      );
      expect(hit, `配置页不该出现「${label}」`).toBeUndefined();
    }

    expect(text()).toContain('返回工坊');
    // 主题切换器属于工作空间，配置页没有它。
    expect(document.querySelector('[data-testid="theme-switcher"]')).toBeNull();
  });

  /**
   * v0.8.2：品牌后面不再挂一条 `/`。
   *
   * 斜杠是面包屑语法，说的是「右边这段挂在左边那段之下」；「系统配置」并不挂在
   * 「格物」之下，而品牌里的「· 格物」已经是分隔符 —— 一句话里不必打两个断。
   */
  it('品牌后面没有斜杠 —— 「系统配置」是它自己的名字，不是格物的下级', () => {
    const crumb = document.querySelector('[data-testid="config-crumb"]');
    expect(crumb?.textContent?.trim()).toBe('系统配置');
  });

  it('「返回工坊」在日夜开关之后 —— 右上角最后一位始终是「离开这一处」', () => {
    const toggle = document.querySelector('[data-testid="theme-toggle"]');
    const back = Array.from(document.querySelectorAll('header a')).find(
      (node) => node.textContent?.trim() === '返回工坊',
    );
    expect(toggle).not.toBeNull();
    expect(back).toBeDefined();
    // 日夜开关必须排在返回工坊**之前**（DOCUMENT_POSITION_FOLLOWING = 4）。
    expect(
      toggle?.compareDocumentPosition(back as Node) ?? 0,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
