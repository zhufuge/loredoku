import { Toaster as SonnerToaster } from 'sonner';
import { TOAST_OFFSET } from '@loredoku/shared';

/**
 * v0.5.3 FIX-N01 (docs/v0.5.3.md §1): the toast stack is pushed **below** the
 * header bar.
 *
 * Every page has a 56px bar along the top (the console's `AppShell` header, the
 * editor / puzzle-editor toolbar) whose right end is exactly where the buttons
 * live — 保存 / 发布 / 导入 / 导出 / 基本信息. A toast pinned to the viewport's
 * top-right corner covered them, so 「保存成功」 literally blocked the next
 * 保存. `TOAST_OFFSET` (64px) clears the bar; the side stays `top-right`
 * because that is the side with the fewest controls.
 */
export function Toaster(): JSX.Element {
  return <SonnerToaster position="top-right" offset={TOAST_OFFSET} richColors closeButton />;
}
