import { DEFAULT_REGION_COLOR, STYLE_DEFAULT_REGION_OUTLINE_WIDTH } from '@loredoku/shared';

/** v0.7.0 §4：迁移 `20260101000030_v070_region_style` 的纯变换，放这里以便无库单测（knex 把 migrations 下每个文件都当迁移）；两个方向都返回新记录或 `null`。 */

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

/** v0.6.x → v0.7.0：去掉三元组，`borderWidth` 与地图默认不同才记成 `style.outline.width`；无三元组返回 `null`。 */
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

/** 还原三元组：`borderWidth` 取 `style.outline.width`，没有就取地图默认；`color`/`fillOpacity` 回旧默认（自定义填充不可逆）。 */
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
