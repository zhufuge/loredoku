import { cn } from '@/lib/utils';

/**
 * v0.5.4 FEAT-O11 (docs/v0.5.4.md §5.4): a `<select>` turned into **buttons**.
 *
 * The item category has two or three values and is picked constantly, so a
 * dropdown costs two clicks and a scroll; buttons cost one. Visually this is
 * the same segmented control `AppearanceField` already uses for 外观, so the
 * whole form reads as one family.
 *
 * It is a real radio group for assistive tech (`role="radiogroup"` +
 * `role="radio"` + `aria-checked`), not just a row of buttons.
 */
export interface SegmentedRadioOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedRadioProps<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedRadioOption<T>>;
  onChange: (value: T) => void;
  /** Accessible name for the group (no visible label is rendered). */
  ariaLabel: string;
  /** Optional id, so a `<Label htmlFor>` can point at the group. */
  id?: string;
  className?: string;
}

export function SegmentedRadio<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  id,
  className,
}: SegmentedRadioProps<T>): JSX.Element {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      data-testid="segmented-radio"
      className={cn('inline-flex overflow-hidden rounded-md border', className)}
      style={{ width: 'max-content' }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={
              'px-3 py-1.5 text-sm transition-colors ' +
              (selected
                ? 'bg-secondary text-secondary-foreground'
                : 'bg-background text-muted-foreground hover:bg-accent')
            }
            style={{ minWidth: 56 }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
