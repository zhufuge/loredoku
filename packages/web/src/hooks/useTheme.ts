import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  applyTheme,
  getSystemDark,
  getThemeMode,
  nextThemeMode,
  resolveTheme,
  setThemeMode,
  subscribeTheme,
  type ResolvedTheme,
  type ThemeMode,
} from '@/lib/theme';

export interface ThemeControls {
  /** 用户的选择，可能「跟随系统」。 */
  mode: ThemeMode;
  /** 实际生效的浅/深色 —— 图标、toast 配色都用它。 */
  resolved: ResolvedTheme;
  /** 浅色 → 深色 → 跟随系统 → 浅色。 */
  cycle: () => void;
  setMode: (mode: ThemeMode) => void;
}

/**
 * 订阅 `lib/theme.ts` 那份外部状态。
 *
 * 两个 `useSyncExternalStore` 共用同一个 subscribe：`mode` 变了要重渲染，
 * **系统外观变了（mode 仍是 `system`）也要重渲染** —— 只订阅 mode 的话，
 * 系统切到深色时图标不会变。
 *
 * 上色本身由 `setThemeMode` / storage / matchMedia 在 store 层同步完成，不放在
 * 这里；`useEffect` 只是兜底，保证「HTML 的内联脚本没跑」时也能自愈。
 */
export function useTheme(): ThemeControls {
  const mode = useSyncExternalStore(subscribeTheme, getThemeMode, () => 'system' as ThemeMode);
  const systemDark = useSyncExternalStore(subscribeTheme, getSystemDark, () => false);
  const resolved = resolveTheme(mode, systemDark);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const cycle = useCallback((): void => {
    setThemeMode(nextThemeMode(getThemeMode()));
  }, []);

  const setMode = useCallback((next: ThemeMode): void => {
    setThemeMode(next);
  }, []);

  return { mode, resolved, cycle, setMode };
}
