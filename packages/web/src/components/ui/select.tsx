import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * Thin wrapper around the native `<select>` so dialogs can offer dropdowns
 * without pulling in a heavy popover primitive.
 *
 * v0.7.8 §3：高度与焦点环对齐 `Input`（`h-10` / `ring-2` + offset）。原来是
 * `h-9` / `ring-1`，与它并排的搜索框底边差 4px，同一行看起来"错位"。
 * 需要按内容收窄时在调用处加 `w-auto`（默认 `w-full`）。
 */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
