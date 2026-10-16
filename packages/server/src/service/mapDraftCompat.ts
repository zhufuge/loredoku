import { MAP_JSON_VERSION } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';

/**
 * v0.5.0 FEAT-K14 (docs/v0.5.0.md §8.3) — the absorption layer for stored map
 * drafts.
 *
 * Until v0.4.3 a map draft owned the roster (`characterSlots`) and the linkage
 * palette (`style.linkageColors`). Both moved to the puzzle, and the v3 schemas
 * are `.strict()`, so a v2 payload read back from `map_projects.draft_data` /
 * `map_versions.data` would fail to parse. Rather than rewriting the database
 * (which would make the v0.5.0 migration irreversible), every read path passes
 * the raw JSON through `absorbLegacyMapDraft` first.
 *
 * The old fields are **not deleted from the database** — they are simply no
 * longer read. `readLegacyCharacterSlots` / `readLegacyLinkageColors` are the
 * two accessors that still look at them, for the backfill migration and the
 * game snapshot upgrade.
 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/**
 * The v2 roster, or `[]` for a v3 / missing payload. Slots keep whatever shape
 * they had — they were already valid `CharacterSlotEntry` objects, and the
 * migration copies them verbatim into the puzzle seed.
 */
export function readLegacyCharacterSlots(raw: unknown): Array<CharacterSlotEntry | null> {
  const record = asRecord(raw);
  const slots = record?.['characterSlots'];
  if (!Array.isArray(slots)) return [];
  return slots.map((slot) => (asRecord(slot) ? (slot as CharacterSlotEntry) : null));
}

/** The v2 palette (`style.linkageColors`), or `[]` when absent / malformed. */
export function readLegacyLinkageColors(raw: unknown): MapLinkageColor[] {
  const style = asRecord(asRecord(raw)?.['style']);
  const colors = style?.['linkageColors'];
  if (!Array.isArray(colors)) return [];
  return colors.filter((entry): entry is MapLinkageColor => {
    const record = asRecord(entry);
    return (
      record !== null &&
      typeof record['key'] === 'string' &&
      typeof record['label'] === 'string' &&
      typeof record['color'] === 'string'
    );
  });
}

/**
 * Rewrites a v2 payload into the v3 shape: drops `characterSlots`, drops
 * `style.linkageColors`, and stamps `version = MAP_JSON_VERSION`. Every other
 * field is passed through untouched.
 *
 * **Idempotent**: a payload that is already v3 (nothing to strip, version
 * matches) is returned as the **same reference**, so re-running this on every
 * read costs nothing.
 */
export function absorbLegacyMapDraft(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return raw;

  const hasSlots = 'characterSlots' in record;
  const style = asRecord(record['style']);
  const hasStylePalette = style !== null && 'linkageColors' in style;
  const versionMatches = record['version'] === MAP_JSON_VERSION;

  if (!hasSlots && !hasStylePalette && versionMatches) return raw;

  const next: Record<string, unknown> = { ...record, version: MAP_JSON_VERSION };
  delete next['characterSlots'];
  if (hasStylePalette && style) {
    const nextStyle: Record<string, unknown> = { ...style };
    delete nextStyle['linkageColors'];
    next['style'] = nextStyle;
  }
  return next;
}
