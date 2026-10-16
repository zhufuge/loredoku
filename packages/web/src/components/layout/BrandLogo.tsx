import logoUrl from '@/assets/LOREDOKU-logo.svg';

interface BrandLogoProps {
  /** Rendered height in px; the mark keeps its 3344 × 560 aspect ratio. */
  height?: number;
  /** v0.5.3 FEAT-N02: append 「· 格物」 (the console header only). */
  withWordmark?: boolean;
  /**
   * v0.5.4 FEAT-O05 (docs/v0.5.4.md §4): a third segment — 「· 琢玉台」 —
   * appended on the module's own page, so the header reads
   * 「图标 · 格物 · 琢玉台」. Ignored unless `withWordmark` is set.
   */
  suffix?: string;
  className?: string;
}

/**
 * v0.5.3 FEAT-N02 / FEAT-N03 (docs/v0.5.3.md §2): the `LOREDOKU` mark, used by
 * the console header, the games home and the game page.
 *
 * The asset is a **wordmark** (roughly 6:1), so it is sized by height alone —
 * a fixed width would silently letterbox it. `withWordmark` is opt-in because
 * only the maker's console pairs the mark with 「格物」; the player-facing
 * surfaces show the mark by itself.
 */
export function BrandLogo({
  height = 20,
  withWordmark = false,
  suffix,
  className,
}: BrandLogoProps): JSX.Element {
  return (
    <span className={className ?? 'flex shrink-0 items-center gap-2'}>
      <img
        src={logoUrl}
        alt="LOREDOKU"
        draggable={false}
        style={{ height }}
        className="w-auto select-none"
        data-testid="brand-logo"
      />
      {withWordmark ? (
        <span className="font-semibold">
          · 格物{suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
