import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemeSwitcher } from './ThemeSwitcher';

/**
 * v0.8.0 §18：顶栏的主题切换器。
 *
 * 钉三件事：
 *
 * 1. 触发器上写着**当前主题名** —— 顶栏里始终有一句「你在哪个世界」；
 * 2. 换主题**保留当前模块**（`/hlm/puzzles` → `/default/puzzles`），并且记住这次
 *    选择（旧地址 `/maps` 靠它兜底）；
 * 3. 【主题配置】是一个**出口**，通向系统配置页，不是第三个主题。
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

  it('触发器上写着当前主题名 —— 不用展开也知道自己在哪', () => {
    render();
    expect(trigger().textContent).toContain('红楼梦');
  });

  /**
   * v0.8.2：文字前的图标换成这间工作台的**识别色**。
   *
   * 原来是一个通用的 `Layers` —— 每个主题长得一样，没说任何关于「这间」的事。
   * 现在是一枚 10px 圆点，颜色就是 `theme.data.accent`；没设过就画灰点，
   * 不拿模板色顶上。
   */
  it('文字前是这间的识别色，不是通用图标', () => {
    const base = workspace();
    base.theme = { ...base.theme, data: { version: 1, accent: '#9E3D3D' } };
    workspaceRef.value = base;
    render();

    const dot = document.querySelector('[data-testid="theme-switcher-accent"]') as HTMLElement | null;
    expect(dot).not.toBeNull();
    expect(dot?.getAttribute('style')).toMatch(/background/);
    expect(dot?.className).toContain('rounded-full');
    // 图标没了：触发器里只剩圆点 + 主题名 + 箭头。
    expect(trigger().querySelector('svg.lucide-layers')).toBeNull();
  });

  it('没设识别色时是一颗灰点 —— 不伪造一个颜色', () => {
    render();

    const dot = document.querySelector('[data-testid="theme-switcher-accent"]') as HTMLElement | null;
    expect(dot?.getAttribute('style')).toBeNull();
    expect(dot?.className).toContain('bg-muted-foreground/30');
  });

  it('展开后列出全部主题，并标出当前那个', () => {
    render();
    act(() => trigger().click());

    expect(menuItem('默认主题')).toBeDefined();
    expect(menuItem('红楼梦')?.getAttribute('aria-checked')).toBe('true');
    expect(menuItem('默认主题')?.getAttribute('aria-checked')).toBe('false');
  });

  /**
   * v0.8.2：菜单里每一行也带自己的识别色。
   *
   * 触发器那颗点只说「你现在在哪」；换主题时要判断的却是「另一间长什么样」，
   * 光看名字和编码，两行是同一个东西。色点按**各自**的主题取色，不是抄触发器。
   */
  it('菜单里每行带自己的识别色 —— 没设的那间是灰点', () => {
    const base = workspace();
    base.themes = [
      theme('default', '默认主题'),
      { ...theme('hlm', '红楼梦'), data: { version: 1, accent: '#9E3D3D' } },
    ];
    base.theme = base.themes[1]!;
    workspaceRef.value = base;
    render();
    act(() => trigger().click());

    const dots = document.querySelectorAll('[data-testid="theme-menu-accent"]');
    expect(dots).toHaveLength(2);

    const [plain, colored] = Array.from(dots) as HTMLElement[];
    // 「默认主题」没挑色：灰点，不伪造。
    expect(plain?.getAttribute('style')).toBeNull();
    expect(plain?.className).toContain('bg-muted-foreground/30');
    // 「红楼梦」用自己那份 accent（jsdom 会把 hex 归一成 rgb）。
    expect(colored?.getAttribute('style')).toMatch(/background/);
    expect(colored?.getAttribute('style')).toContain('rgb(158, 61, 61)');
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
    // 它在分隔线之后，与主题项分属两件事。
    expect(entry?.getAttribute('role')).toBe('menuitem');
    // v0.8.2：出口不再挂副标题。原来那行「新建、改名、删除」解释的是一个入口，
    // 而这一项本身就是入口 —— 菜单里只剩它自己的名字。
    expect(entry?.textContent).toBe('主题配置');
  });

  it('没有工作空间上下文时整块不渲染（全屏页 / 系统配置页不该有它）', () => {
    workspaceRef.value = null;
    render();
    expect(trigger()).toBeNull();
  });
});
