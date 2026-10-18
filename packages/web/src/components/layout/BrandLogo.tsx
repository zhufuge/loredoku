import logoUrl from '@/assets/LOREDOKU-logo.svg';

interface BrandLogoProps {
  /** Rendered height in px; the mark keeps its 3344 × 560 aspect ratio. */
  height?: number;
  /** v0.5.3 FEAT-N02: append 「· 格物」 (the console header only). */
  withWordmark?: boolean;
  /**
   * v0.5.4 FEAT-O05 (docs/v0.5.4.md §4): a third segment — 「· 工坊」 —
   * appended on the module's own page, so the header reads
   * 「图标 · 格物 · 工坊」. Ignored unless `withWordmark` is set.
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
        // 资产是黑 + 深红双色墨迹，在深色页面上几乎看不见。
        // `invert` 把黑色翻成白色；`hue-rotate(180deg)` 再把色相转回来，
        // 于是深红变成亮红而不是青色 —— 只反亮度，不毁品牌色。
        className="w-auto select-none dark:invert dark:hue-rotate-180"
        data-testid="brand-logo"
      />
      {withWordmark ? (
        // 字号与行高都跟着 mark 走。实测 logo 资产在 box 内上下各留约
        // 13%（22px 框里墨迹 16.2px），而 CJK 墨迹约等于 1em —— 取 0.82×height
        // 让「格物」的上下沿与 logo 墨迹齐平（22→18px / 20→16px）。lineHeight:1
        // 是必须的：默认 1.5 会把墨迹挤出 box 中线，看起来比 logo 低半格。
        // 字重 normal —— 品牌行靠 logo 立骨架，不加粗。
        <span
          style={{ fontSize: Math.round(height * 0.82), lineHeight: 1 }}
          data-testid="brand-wordmark"
        >
          · 格物{suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
