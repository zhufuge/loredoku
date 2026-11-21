import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Thin wrapper around the native `<select>` so dialogs can offer dropdowns
 * without pulling in a heavy popover primitive.
 *
 * v0.7.8 §3：高度与焦点环对齐 `Input`（`h-10` / `ring-2`），与并排的搜索框
 * 底边齐平，同一行不会看起来"错位"。
 * v0.8.5 §5：环贴着描边，不再隔一层底色（与 `Input` 一致）。
 * 环宽是 `ring-2`、高度是 `h-10`。
 * 需要按内容收窄时在调用处加 `w-auto`（默认 `w-full`）。
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      >
        {children}
      </select>
    );
  },
);
