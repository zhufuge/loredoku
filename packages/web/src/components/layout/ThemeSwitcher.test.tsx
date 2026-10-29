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

  const text = (): string => document.body.textContent ?? '';
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

  it('展开后列出全部主题，并标出当前那个', () => {
    render();
    act(() => trigger().click());

    expect(menuItem('默认主题')).toBeDefined();
    expect(menuItem('红楼梦')?.getAttribute('aria-checked')).toBe('true');
    expect(menuItem('默认主题')?.getAttribute('aria-checked')).toBe('false');
  });

  it('换主题保留当前模块 —— 在谜题页换，就还落在谜题页', () => {
    render();
    act(() => trigger().click());
    act(() => menuItem('默认主题')?.click());

    expect(path()).toBe('/default/puzzles');
    // 记住了：旧地址 `/maps` 与全屏页面（编辑器）靠它回到同一个世界。
    expect(window.localStorage.getItem('loredoku.lastTheme')).toBe('default');
  });

  it('【主题配置】是出口 —— 通向系统配置页，不是第三个主题', () => {
    render();
    act(() => trigger().click());

    const entry = menuItem('主题配置');
    expect(entry).toBeDefined();
    expect(entry?.getAttribute('href')).toBe('/settings/themes');
    // 它在分隔线之后，与主题项分属两件事。
    expect(entry?.getAttribute('role')).toBe('menuitem');
    expect(text()).toContain('新建、改名、删除');
  });

  it('没有工作空间上下文时整块不渲染（全屏页 / 系统配置页不该有它）', () => {
    workspaceRef.value = null;
    render();
    expect(trigger()).toBeNull();
  });
});
