import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import { THEME_STORAGE_KEY } from '@/lib/theme';
import { ThemeToggle } from './ThemeToggle';

/**
 * v0.5.7：切换按钮只做一件事 —— 把三态推进一格，并且**立刻**落盘 + 上色。
 * 断言走 `data-*` 属性（而不是图标），这样换图标库不会让用例变哑。
 */

let media: MatchMediaStub;

beforeAll(() => {
  media = installMatchMedia(false);
});

afterAll(() => {
  media.restore();
});

describe('ThemeToggle', () => {
  let container: HTMLDivElement;
  let root: Root;

  const button = (): HTMLButtonElement =>
    document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]') as HTMLButtonElement;

  function render(): void {
    act(() => {
      root.render(<ThemeToggle />);
    });
  }

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
    media.setDark(false);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('starts on system — the documented default', () => {
    expect(button().getAttribute('data-theme-mode')).toBe('system');
    expect(button().getAttribute('data-theme-resolved')).toBe('light');
    expect(button().getAttribute('title')).toContain('跟随系统');
  });

  it('walks the ring system → light → dark → system on repeated clicks', () => {
    act(() => button().click());
    expect(button().getAttribute('data-theme-mode')).toBe('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');

    act(() => button().click());
    expect(button().getAttribute('data-theme-mode')).toBe('dark');
    expect(button().getAttribute('data-theme-resolved')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    act(() => button().click());
    expect(button().getAttribute('data-theme-mode')).toBe('system');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('system');
    // 系统是浅色，所以回到浅色。
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('re-renders when the OS flips while following the system', () => {
    expect(button().getAttribute('data-theme-resolved')).toBe('light');
    act(() => media.setDark(true));
    expect(button().getAttribute('data-theme-mode')).toBe('system');
    expect(button().getAttribute('data-theme-resolved')).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('keeps a hand-picked light theme when the OS goes dark', () => {
    act(() => button().click()); // system → light
    act(() => media.setDark(true));
    expect(button().getAttribute('data-theme-mode')).toBe('light');
    expect(button().getAttribute('data-theme-resolved')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('labels the button for screen readers with the current mode', () => {
    expect(button().getAttribute('aria-label')).toBe('主题：跟随系统（点击切换）');
    act(() => button().click());
    expect(button().getAttribute('aria-label')).toBe('主题：浅色（点击切换）');
  });
});
