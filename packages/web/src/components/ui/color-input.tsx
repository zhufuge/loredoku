import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * v0.3.10 FIX-F04: a borderless native colour picker.
 *
 * The raw `<input type="color">` ships with a near-black border (and browsers
 * draw their own swatch border), which reads as a heavy outline next to the
 * light-weight controls of the 「地图基本信息」drawer. This wrapper drops the
 * border entirely, keeps a rounded swatch and adds a single hairline ring in
 * the theme's border colour so a white / very light swatch stays visible.
 */
export interface ColorInputProps {
  id?: string;
  value: string;
  /** Receives an upper-cased `#RRGGBB` string. */
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(function ColorInput(
  { id, value, onChange, className, disabled, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      id={id}
      type="color"
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
      className={cn(
        'h-7 w-8 shrink-0 cursor-pointer rounded-md bg-transparent p-0',
        'border-0 ring-1 ring-inset ring-border',
        // Browsers draw their own swatch border — strip it so only our ring shows.
        '[&::-webkit-color-swatch-wrapper]:p-0',
        '[&::-webkit-color-swatch]:border-0',
        '[&::-webkit-color-swatch]:rounded',
        '[&::-moz-color-swatch]:border-0',
        className,
      )}
      {...rest}
    />
  );
});
