import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemesPage } from './ThemesPage';

/**
 * v0.8.2：系统配置 · 主题。
 *
 * 这一页只做一件事 —— 让你换一间工作台。所以钉四件事：
 *
 * 1. **当前**那间必须看得出来（没有上下文的 config 外壳里，只能读记住的编码）；
 * 2. 色带只在主题**有识别色**时画 —— 没设就整条不出现，不是留一条灰的；
 * 3. 取数失败 ≠ 没有主题：错误态要给重试，不能劝人「先建一个」；
 * 4. 卡片上的数字不重复说同一个「关」。
 */

const themesRef: {
  data: Theme[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} = { data: undefined, isLoading: false, isError: false, error: null, refetch: () => undefined };

vi.mock('@/hooks/useThemes', () => ({
  useThemes: () => themesRef,
  useCreateTheme: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
}));

function theme(code: string, name: string, overrides: Partial<Theme> = {}): Theme {
  return {
    code,
    name,
    description: `${name}的描述`,
    data: { version: 1 },
    counts: { assets: 51, maps: 8, characters: 32, puzzles: 8, games: 6 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ThemesPage（v0.8.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const card = (code: string): HTMLElement | null =>
    document.querySelector(`[data-testid="theme-card-${code}"]`);

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings/themes']}>
          <ThemesPage />
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
    window.localStorage.setItem('loredoku.lastTheme', 'hlm');
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('标出「当前」那一间，并且只有它带 aria-current', () => {
    render();

    expect(card('hlm')?.textContent).toContain('当前');
    expect(card('default')?.textContent).not.toContain('当前');
    expect(card('hlm')?.getAttribute('aria-current')).toBe('page');
    expect(card('default')?.getAttribute('aria-current')).toBeNull();
  });

  it('记不住当前主题时不瞎标（换过浏览器就是没有）', () => {
    window.localStorage.clear();
    render();

    expect(text()).not.toContain('当前');
    expect(document.querySelector('[aria-current="page"]')).toBeNull();
  });

  it('识别色只在设过的时候画成色带', () => {
    themesRef.data = [theme('hlm', '红楼梦', { data: { version: 1, accent: '#B93A32' } })];
    render();

    const band = card('hlm')?.querySelector('[data-testid="theme-accent-band"]') as HTMLElement | null;
    expect(band?.getAttribute('style')).toContain('background-color');
    expect(band?.className).toContain('h-2');
  });

  it('没设识别色就没有颜色 —— 但 8px 的位子还在，同排卡片的标题才不会错行', () => {
    render();

    const band = card('hlm')?.querySelector('[data-testid="theme-accent-band"]') as HTMLElement | null;
    expect(band).not.toBeNull();
    expect(band?.className).toContain('h-2');
    // 没有内联底色 = 只占位、不染色。
    expect(band?.getAttribute('style')).toBeNull();
  });

  it('取数失败不是空态：给的是重试，不是「先建一个」', () => {
    themesRef.data = undefined;
    themesRef.isError = true;
    themesRef.error = new Error('数据库连不上');
    render();

    expect(text()).toContain('主题列表没取到');
    expect(text()).toContain('数据库连不上');
    expect(text()).not.toContain('还没有主题');
  });

  it('真的没有主题时才说空话，并且空态里不再放第二个「新建」按钮', () => {
    themesRef.data = [];
    render();

    expect(text()).toContain('还没有主题');
    const createButtons = Array.from(document.querySelectorAll('button')).filter((node) =>
      node.textContent?.includes('新建主题'),
    );
    expect(createButtons).toHaveLength(1);
  });

  it('「几关在线」与库计数分成两块，不再出现「8 关 · 8 关在线」这种重复单位', () => {
    render();

    const body = card('hlm')?.textContent ?? '';
    expect(body).toContain('6');
    expect(body).toContain('关在线');
    expect(body).not.toContain('关 · ');
    expect(body).toContain('51 资源 · 8 地图');
  });
});
