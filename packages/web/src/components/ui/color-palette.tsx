import { THEME_COLOR_PALETTE } from '@loredoku/shared';
import { cn } from '@/lib/utils';

interface ColorPaletteProps {
  /** The currently selected colour (`#RRGGBB`, any case). */
  value: string;
  onSelect: (color: string) => void;
  className?: string;
  /** Accessible group label — several palettes can share one surface. */
  'aria-label'?: string;
}

/**
 * v0.5.3 FEAT-N09 (docs/v0.5.3.md §6.2): one swatch grid for every colour the
 * user is asked to pick.
 *
 * It used to live inline inside `ThemeColorDialog` only — the puzzle's 联动主题
 * palette had nothing but a native colour input, so every colour there had to
 * be typed as hex. Both surfaces now render the same `THEME_COLOR_PALETTE`, so
 * a colour chosen for a participant and one chosen for a linkage read the same
 * way. A colour outside the palette is still reachable (the hex input stays);
 * it simply matches no swatch, which is why the comparison is case-insensitive.
 */
export function ColorPalette({
  value,
  onSelect,
  className,
  'aria-label': ariaLabel = '调色板',
}: ColorPaletteProps): JSX.Element {
  const current = value.trim().toUpperCase();
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-testid="color-palette"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {THEME_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          title={color}
          aria-label={`颜色 ${color}`}
          aria-pressed={current === color.toUpperCase()}
          onClick={() => onSelect(color)}
          className={cn(
            'h-7 w-7 rounded-full border-2 transition-transform',
            current === color.toUpperCase()
              ? 'scale-110 border-primary'
              : 'border-border hover:border-primary',
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}
