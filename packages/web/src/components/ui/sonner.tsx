import { Toaster as SonnerToaster } from 'sonner';
import { TOAST_OFFSET } from '@loredoku/shared';
import { useTheme } from '@/hooks/useTheme';

/**
 * v0.5.3 FIX-N01 (docs/v0.5.3.md §1): the toast stack sits **below** the 56px
 * header bar, whose right end holds 保存 / 发布 / 导入 / 导出. Stays `top-right`
 * — the side with the fewest controls.
 *
 * v0.5.7: the toast follows the app theme, not sonner's own `system` default —
 * a hand-picked dark theme on a light OS would otherwise pop white toasts.
 */
export function Toaster(): JSX.Element {
  const { resolved } = useTheme();

  return (
    <SonnerToaster
      position="top-right"
      offset={TOAST_OFFSET}
      theme={resolved}
      richColors
      closeButton
    />
  );
}
