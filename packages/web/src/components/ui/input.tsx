import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * v0.8.5 §5：焦点环去掉 `ring-offset`，从「框外另画一圈」改成「贴着描边」。
 *
 * 原来是 `ring-2 + ring-offset-2`（2023 年那版 shadcn 模板）：焦点时是
 * 2px 靛蓝环 → 2px 页面底色空隙 → 1px 灰描边，三层。空隙填的是
 * `--background`（L* 96.9），而输入框多半坐在 `bg-card`（99.3）里 —— 聚焦时
 * 框外先浮出一圈比纸面暗的缝，再是蓝环，像描了两道边。
 *
 * 只删 offset，环宽仍是 `ring-2`。**没有跟着上游一起改成 1px + 把描边染成
 * `--ring`**：边色在这套界面里是语义通道（7 处用 `border-destructive` 标
 * 「这一格填错了」），而「聚焦时给描边上色」那条规则的优先级会把它盖掉 ——
 * 用户在错误字段里继续打字时，红边会变蓝。
 * 高度仍是 `h-10`（与 `Select` 对齐，见 `select.tsx`），没有跟着改成 `h-9`。
 */
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
