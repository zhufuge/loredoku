import type { ReactNode } from 'react';
import {
  APPEARANCE_MODE_LABELS,
  APPEARANCE_MODES,
  DEFAULT_BG_COLOR,
  type AppearanceMode,
} from '@loredoku/shared';
import { Label } from '@/components/ui/label';
import { ColorField } from '@/components/ui/color-input';
import { cn } from '@/lib/utils';

interface AppearanceFieldProps {
  id?: string;
  /** Current mode: uploaded image or colour block. */
  mode: AppearanceMode;
  onModeChange: (mode: AppearanceMode) => void;
  /** Colour-block colour; only meaningful when `mode === 'color'`. */
  bgColor: string;
  onBgColorChange: (value: string) => void;
  /**
   * The uploader (or any image-mode content). Rendered only in image mode; a
   * colour block hides it, but the uploaded file itself is **kept** so
   * switching back restores it (docs/v0.5.1.md §1.2).
   */
  children?: ReactNode;
  className?: string;
}

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — the shared 「外观」 control for items and
 * characters.
 *
 * Two mutually exclusive modes:
 * - `image` — the pre-v0.5.1 behaviour; the caller's uploader is shown.
 * - `color` — a colour block: only a colour picker, **no upload needed**. The
 *   colour defaults to {@link DEFAULT_BG_COLOR} (white) and is required.
 */
export function AppearanceField({
  id,
  mode,
  onModeChange,
  bgColor,
  onBgColorChange,
  children,
  className,
}: AppearanceFieldProps): JSX.Element {
  const color = bgColor.trim() === '' ? DEFAULT_BG_COLOR : bgColor;

  return (
    <div className={cn('grid gap-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>外观</Label>
        <div
          id={id}
          role="radiogroup"
          aria-label="外观"
          className="inline-flex overflow-hidden rounded-md border"
          style={{ width: 'max-content' }}
        >
          {APPEARANCE_MODES.map((value) => {
            const selected = mode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                data-appearance-mode={value}
                onClick={() => onModeChange(value)}
                className={
                  'px-4 py-1.5 text-sm transition-colors ' +
                  (selected
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-accent')
                }
                style={{ minWidth: 60 }}
              >
                {APPEARANCE_MODE_LABELS[value]}
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'color' ? (
        /* v0.8.3：统一取色控件 —— 色块 + hex 输入。原来这里只有一个色块，
           右边那串 hex 是一行不能改的字。 */
        <ColorField
          label="纯色块颜色"
          value={color}
          commit={(value) => onBgColorChange(value.toUpperCase())}
        />
      ) : (
        children
      )}
    </div>
  );
}
