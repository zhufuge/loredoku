import { DEFAULT_REGION_COLOR, STYLE_DEFAULT_REGION_OUTLINE_WIDTH } from '@loredoku/shared';

/**
 * v0.7.0 (docs/v0.7.0.md §4) — pure draft transform behind migration
 * `20260101000030_v070_region_style`, and the absorption half of
 * `mapDraftCompat.ts`.
 *
 * Kept out of the migration directory so the transform can be unit tested
 * without a database (knex treats every file in `db/migrations` as a
 * migration and requires `up` / `down` exports).
 *
 * A region's flat `color` / `borderWidth` / `fillOpacity` trio is replaced by
 * `style`, a deep partial over the map-level defaults:
 *
 * - `borderWidth` survives only when it **disagreed** with the map-level
 *   `regionOutline.width`, recorded as `style.outline.width`. A region that
 *   matched the default records nothing and renders from the default.
 * - `color` only ever drove the (now retired) fill and the list dot, and
 *   `fillOpacity` is gone with the fill — neither crosses over.
 *
 * Both directions return a **new** draft record (or `null` when there is
 * nothing to do), never mutating the input: `mapDraftCompat` runs the upgrade
 * on JSON shared with the caller's raw row.
 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The map-level outline width a region's old `borderWidth` is measured against. */
function mapDefaultOutlineWidth(style: Record<string, unknown> | null): number {
  const outline = asRecord(style?.['regionOutline']);
  const width = outline?.['width'];
  return typeof width === 'number' && Number.isFinite(width) ? width : STYLE_DEFAULT_REGION_OUTLINE_WIDTH;
}

/** `true` when any region still carries the retired v0.6.x trio. */
export function hasLegacyRegionStyle(regions: unknown): boolean {
  if (!Array.isArray(regions)) return false;
  return regions.some((region) => {
    const record = asRecord(region);
    return (
      record !== null &&
      ('color' in record || 'borderWidth' in record || 'fillOpacity' in record)
    );
  });
}

/**
 * v0.6.x → v0.7.0: strips the trio and records `style.outline.width` when the
 * old `borderWidth` disagreed with the map-level default. Returns `null` when
 * no region carries the trio (idempotent).
 */
export function upgradeRegionStyleDraft(
  draft: Record<string, unknown>,
): Record<string, unknown> | null {
  const regions = draft['regions'];
  if (!hasLegacyRegionStyle(regions)) return null;

  const defaultWidth = mapDefaultOutlineWidth(asRecord(draft['style']));
  const nextRegions = (regions as unknown[]).map((raw) => {
    const region = asRecord(raw);
    if (!region) return raw;
    const next: Record<string, unknown> = { ...region };
    const legacyWidth = next['borderWidth'];
    delete next['color'];
    delete next['fillOpacity'];
    delete next['borderWidth'];
    if (
      typeof legacyWidth === 'number' &&
      Number.isFinite(legacyWidth) &&
      legacyWidth !== defaultWidth
    ) {
      const style = asRecord(next['style']) ?? {};
      const outline = asRecord(style['outline']) ?? {};
      next['style'] = { ...style, outline: { ...outline, width: legacyWidth } };
    }
    return next;
  });

  return {
    ...draft,
    regions: nextRegions,
    version: draft['version'] === 6 ? 7 : draft['version'],
  };
}

/**
 * v0.7.0 → v0.6.x: restores the flat trio. `borderWidth` comes back from
 * `style.outline.width` when the region recorded one, otherwise from the
 * map-level default — the exact inverse of {@link upgradeRegionStyleDraft}.
 * `color` / `fillOpacity` return as their old defaults (`#000000` / `0`); a
 * custom fill is unrecoverable because the field is gone. Returns `null` when
 * every region is already v0.6.x-shaped (idempotent).
 */
export function downgradeRegionStyleDraft(
  draft: Record<string, unknown>,
): Record<string, unknown> | null {
  const regions = draft['regions'];
  if (!Array.isArray(regions)) return null;

  const defaultWidth = mapDefaultOutlineWidth(asRecord(draft['style']));
  let changed = false;
  const nextRegions = regions.map((raw) => {
    const region = asRecord(raw);
    if (!region) return raw;
    if ('color' in region || 'borderWidth' in region || 'fillOpacity' in region) return raw;
    changed = true;
    const outline = asRecord(asRecord(region['style'])?.['outline']);
    const width = outline?.['width'];
    const next: Record<string, unknown> = { ...region };
    delete next['style'];
    next['color'] = DEFAULT_REGION_COLOR;
    next['borderWidth'] =
      typeof width === 'number' && Number.isFinite(width) ? width : defaultWidth;
    next['fillOpacity'] = 0;
    return next;
  });

  if (!changed) return null;
  return {
    ...draft,
    regions: nextRegions,
    version: draft['version'] === 7 ? 6 : draft['version'],
  };
}
