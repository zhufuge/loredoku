import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemeSwitcher } from './ThemeSwitcher';

/**
 * v0.8.0 §18：顶栏的主题切换器。
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：只留**路由与非空行为** —— 换主题保留当前
 * 模块、认不出模块落概览、出口通向系统配置、没有工作空间上下文就整块不渲染。
 *
 * 触发器上的文字、那颗识别色圆点、菜单里标出当前项这些是观感，界面还要大改，
 * 钉在这里只会每天早上叫一次；观感交给 `docs/design-system.md` 与真实页面。
 */

const workspaceRef: { value: ReturnType<typeof workspace> | null } = { value: null };

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));

/** §19：主题在接口上只有编码，没有 id、没有 isDefault。 */
function theme(code: string, name: string): Theme {
  return {
    code,
    name,
    description: null,
    data: { version: 1 },
    counts: { assets: 0, maps: 0, characters: 0, puzzles: 0, games: 0 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function workspace(): {
  theme: Theme;
  themes: Theme[];
  themeCode: string;
  href: (module: string) => string;
} {
  const themes = [theme('default', '默认主题'), theme('hlm', '红楼梦')];
  return {
    theme: themes[1]!,
    themes,
    themeCode: 'hlm',
    href: (module: string) => `/hlm/${module}`,
  };
}

function PathProbe(): JSX.Element {
  const location = useLocation();
  return <p data-testid="path">{location.pathname}</p>;
}

describe('ThemeSwitcher（v0.8.0 §18）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let initialPath = '/hlm/puzzles';

  const path = (): string => document.querySelector('[data-testid="path"]')?.textContent ?? '';
  const trigger = (): HTMLButtonElement =>
    document.querySelector('[data-testid="theme-switcher"]') as HTMLButtonElement;
  const menuItem = (label: string): HTMLElement | undefined =>
    Array.from(document.querySelectorAll('[role="menu"] [role="menuitemradio"], [role="menu"] [role="menuitem"]')).find(
      (node) => node.textContent?.includes(label) === true,
    ) as HTMLElement | undefined;

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={[initialPath]}>
          <ThemeSwitcher />
          <Routes>
            <Route path="*" element={<PathProbe />} />
          </Routes>
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    workspaceRef.value = workspace();
    initialPath = '/hlm/puzzles';
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

  it('换主题保留当前模块 —— 在谜题页换，就还落在谜题页', () => {
    render();
    act(() => trigger().click());
    act(() => menuItem('默认主题')?.click());

    expect(path()).toBe('/default/puzzles');
    // 记住了：旧地址 `/maps` 与全屏页面（编辑器）靠它回到同一个世界。
    expect(window.localStorage.getItem('loredoku.lastTheme')).toBe('default');
  });

  /**
   * v0.8.2：认不出模块（`/hlm` 本身、或一个不存在的段）时落**概览**。
   *
   * 原来落 `maps` —— 等于在一个不认识的地址上，还替作者挑定了一间房。概览才是
   * 这个空间的首页，也是导航第一项。
   */
  it('认不出模块时落概览 —— 不在陌生地址上替作者挑一间房', () => {
    initialPath = '/hlm/nope';
    render();
    act(() => trigger().click());
    act(() => menuItem('默认主题')?.click());

    expect(path()).toBe('/default/overview');
  });

  it('【主题配置】是出口 —— 通向系统配置页，不是第三个主题', () => {
    render();
    act(() => trigger().click());

    const entry = menuItem('主题配置');
    expect(entry).toBeDefined();
    expect(entry?.getAttribute('href')).toBe('/settings/themes');
    expect(entry?.getAttribute('role')).toBe('menuitem');
  });

  it('没有工作空间上下文时整块不渲染（全屏页 / 系统配置页不该有它）', () => {
    workspaceRef.value = null;
    render();
    expect(trigger()).toBeNull();
  });
});
