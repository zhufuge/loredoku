import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { installMatchMedia, type MatchMediaStub } from '@/testing/matchMedia';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  getSystemDark,
  getThemeMode,
  isThemeMode,
  nextThemeMode,
  readStoredTheme,
  resolveTheme,
  setThemeMode,
  subscribeTheme,
} from './theme';

/**
 * 日夜主题的三态规则。这些用例钉的是**规则**，不是实现：
 * 非法存储值不能把页面钉死在某个主题上、`system` 必须跟着操作系统走、
 * `applyTheme` 必须同时写 class 与 `color-scheme`。
 */

let media: MatchMediaStub;

beforeAll(() => {
  // 必须在任何 subscribe 之前 —— 全局监听只注册一次。
  media = installMatchMedia(false);
});

afterAll(() => {
  media.restore();
});

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  media.setDark(false);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('theme mode vocabulary', () => {
  it('accepts exactly the three modes', () => {
    expect(isThemeMode('system')).toBe(true);
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    for (const bad of ['', 'Dark', 'auto', null, undefined, 0, {}]) {
      expect(isThemeMode(bad)).toBe(false);
    }
  });

  it('cycles light → dark → system → light', () => {
    expect(nextThemeMode('light')).toBe('dark');
    expect(nextThemeMode('dark')).toBe('system');
    expect(nextThemeMode('system')).toBe('light');
  });
});

describe('readStoredTheme — 默认与坏数据', () => {
  it('falls back to system when nothing is stored', () => {
    expect(readStoredTheme()).toBe('system');
  });

  it('reads back every valid mode verbatim', () => {
    for (const mode of ['light', 'dark', 'system'] as const) {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      expect(readStoredTheme()).toBe(mode);
    }
  });

  it('treats an unknown stored value as system instead of pinning a theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    expect(readStoredTheme()).toBe('system');
  });

  it('survives a localStorage that throws (private mode / blocked storage)', () => {
    const original = window.localStorage.getItem;
    window.localStorage.getItem = () => {
      throw new Error('SecurityError');
    };
    try {
      expect(readStoredTheme()).toBe('system');
    } finally {
      window.localStorage.getItem = original;
    }
  });
});

describe('resolveTheme', () => {
  it('maps the four combinations', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('reports the OS preference through matchMedia', () => {
    expect(getSystemDark()).toBe(false);
    media.setDark(true);
    expect(getSystemDark()).toBe(true);
  });
});

describe('applyTheme', () => {
  it('toggles .dark and sets color-scheme together', () => {
    applyTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');

    applyTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});

describe('setThemeMode', () => {
  it('persists the choice and applies it synchronously', () => {
    setThemeMode('dark');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(getThemeMode()).toBe('dark');

    setThemeMode('light');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('still applies when the write is rejected', () => {
    const original = window.localStorage.setItem;
    window.localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    try {
      setThemeMode('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    } finally {
      window.localStorage.setItem = original;
    }
  });

  it('notifies subscribers', () => {
    let calls = 0;
    const unsubscribe = subscribeTheme(() => {
      calls += 1;
    });
    setThemeMode('dark');
    expect(calls).toBe(1);
    unsubscribe();
    setThemeMode('light');
    expect(calls).toBe(1);
  });
});

describe('subscribing to the OS', () => {
  it('follows the system only while in system mode', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'system');
    const seen: string[] = [];
    const unsubscribe = subscribeTheme(() => seen.push(document.documentElement.className));

    media.setDark(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(seen).toHaveLength(1);

    media.setDark(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(seen).toHaveLength(2);

    unsubscribe();
  });

  it('does not let the OS override a hand-picked theme', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
    const unsubscribe = subscribeTheme(() => undefined);

    media.setDark(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe('light');

    unsubscribe();
  });
});

