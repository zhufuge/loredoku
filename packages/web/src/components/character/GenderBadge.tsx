import {
  CHARACTER_GENDER_GLYPHS,
  CHARACTER_GENDER_LABELS,
  type CharacterGender,
} from '@murdoku/shared';

interface GenderBadgeProps {
  gender: CharacterGender | undefined;
  /** Show the label text next to the glyph (used in the participant dialog). */
  withLabel?: boolean;
}

/** FEAT-501: `♂` / `♀` / `⚧`, nothing at all when unset. */
export function GenderBadge({ gender, withLabel = false }: GenderBadgeProps): JSX.Element | null {
  const key = gender ?? 'unknown';
  const glyph = CHARACTER_GENDER_GLYPHS[key];
  if (!glyph && !withLabel) return null;
  const label = CHARACTER_GENDER_LABELS[key];
  return (
    <span
      className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
      title={`性别：${label}`}
    >
      {glyph ? (
        <span aria-hidden className="text-[11px] leading-none">
          {glyph}
        </span>
      ) : null}
      {withLabel ? label : null}
    </span>
  );
}
