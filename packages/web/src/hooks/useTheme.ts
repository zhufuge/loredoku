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
 * 订阅 `lib/theme.ts` 那份外部状态。两个 `useSyncExternalStore` 共用同一个 subscribe：**系统外观在 `mode === 'system'` 时变了也必须重渲染** —— 只订阅 mode 的话，系统切深色时图标不会变。上色由 store 层同步完成，这里的 `useEffect` 只是兜底（HTML 内联脚本没跑时自愈）。
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
