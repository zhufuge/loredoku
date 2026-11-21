import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** v0.8.5 §5：焦点环贴着描边，不带 `ring-offset`。 `ring-2 + ring-offset-2` 的焦点态是 2px 靛蓝环 → 2px 页面底色空隙 → 1px 灰 描边，三层。 空隙填的是 `--background`（L* 96.9），而输入框多半坐在 `bg-card` （99.3）里 —— 聚焦时框外先浮出一圈比纸面暗的缝，再是蓝环，像描了两道边。 环宽是 `ring-2`。 高度是 `h-10`（与 `Select` 对齐，见 `select.tsx`）。 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
