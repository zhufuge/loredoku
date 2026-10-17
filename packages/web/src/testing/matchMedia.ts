import { DARK_MEDIA_QUERY } from '@/lib/theme';

export interface MatchMediaStub {
  /** 模拟系统外观变化：改 `matches` 并通知所有监听者。 */
  setDark: (dark: boolean) => void;
  /** 恢复安装前的 `window.matchMedia`（原本可能不存在）。 */
  restore: () => void;
}

/**
 * v0.5.7: jsdom 没有 `matchMedia`，而主题的三态逻辑完全建立在
 * `(prefers-color-scheme: dark)` 之上。测试里必须在**任何订阅之前**装好它 ——
 * `lib/theme.ts` 的全局监听只在第一次 subscribe 时注册一次。
 */
export function installMatchMedia(initialDark = false): MatchMediaStub {
  const original = window.matchMedia;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let dark = initialDark;

  const stub = ((query: string) => ({
    matches: dark,
    media: query,
    onchange: null,
    addEventListener: (type: string, listener: (event: MediaQueryListEvent) => void): void => {
      if (type === 'change') listeners.add(listener);
    },
    removeEventListener: (type: string, listener: (event: MediaQueryListEvent) => void): void => {
      listeners.delete(listener);
    },
    addListener: (): void => undefined,
    removeListener: (): void => undefined,
    dispatchEvent: (): boolean => false,
  })) as unknown as typeof window.matchMedia;

  window.matchMedia = stub;

  return {
    setDark(next: boolean): void {
      dark = next;
      const event = { matches: next, media: DARK_MEDIA_QUERY } as MediaQueryListEvent;
      for (const listener of listeners) listener(event);
    },
    restore(): void {
      if (original) window.matchMedia = original;
      else delete (window as { matchMedia?: unknown }).matchMedia;
      listeners.clear();
    },
  };
}
