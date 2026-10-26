import {
  CHARACTER_GENDER_GLYPHS,
  CHARACTER_GENDER_LABELS,
  GENDER_SYMBOL_COLORS,
  type CharacterGender,
} from '@loredoku/shared';

interface GenderBadgeProps {
  gender: CharacterGender | undefined;
  /** Show the label text next to the glyph. */
  withLabel?: boolean;
}

/**
 * OPT-601 (docs/v0.3.1.md §2): the ♂/♀ glyph is tinted (male = light blue,
 * female = light pink). CLAR-601 guarantees a character always has a gender,
 * so there is no "unset" branch any more.
 */
export function GenderBadge({ gender, withLabel = false }: GenderBadgeProps): JSX.Element {
  // CLAR-601: missing values are normalised to `male` upstream, but we keep a
  // fallback so a transient `undefined` (e.g. while a query is loading) still
  // renders a glyph rather than nothing.
  const key: CharacterGender = gender ?? 'male';
  const glyph = CHARACTER_GENDER_GLYPHS[key];
  const label = CHARACTER_GENDER_LABELS[key];
  const color = GENDER_SYMBOL_COLORS[key];
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
      title={`性别：${label}`}
    >
      <span
        aria-hidden
        /* v0.7.9 §4：这是**符号的光学尺寸**，不是文字档位 —— 全站字号梯级里
           没有 13px，但 ♂ / ♀ 的字面高度比同号汉字矮一大截，12px 会缩成一个小点，
           14px 又会比旁边的徽标文字还抢眼。图钉在 13px + 700，等宽不参与梯级。 */
        className="text-[13px] leading-none"
        // v0.3.10 FIX-F06: the ♂ / ♀ glyph is drawn thin by default and reads
        // blurry at 13px, so it is explicitly bolded (colour unchanged).
        style={{ color, fontWeight: 700 }}
      >
        {glyph}
      </span>
      {withLabel ? <span>{label}</span> : null}
    </span>
  );
}
