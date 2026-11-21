import { MAP_JSON_VERSION } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';
import {
  hasLegacyRegionStyle,
  upgradeRegionStyleDraft,
} from './regionStyleMigration';

/** v0.5.0 §8.3 / v0.7.0 §4 读取兼容层：旧字段留在库里但不再读，各读路径先过这里；迁移 `20260101000030` 会改写存量行。 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** The v2 roster, or `[]` for v3 / missing. Slots were already valid `CharacterSlotEntry`s. */
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
 * v2 → v3：去掉名单、老调色板与区域三元组，并写 `version = MAP_JSON_VERSION`；已合规时返回**同一引用**（幂等，每次读都能跑）。
 */
export function absorbLegacyMapDraft(raw: unknown): unknown {
  const record = asRecord(raw);
  if (!record) return raw;

  const hasSlots = 'characterSlots' in record;
  const style = asRecord(record['style']);
  const hasStylePalette = style !== null && 'linkageColors' in style;
  const hasLegacyRegions = hasLegacyRegionStyle(record['regions']);
  const versionMatches = record['version'] === MAP_JSON_VERSION;

  if (!hasSlots && !hasStylePalette && !hasLegacyRegions && versionMatches) return raw;

  const next: Record<string, unknown> = { ...record, version: MAP_JSON_VERSION };
  delete next['characterSlots'];
  if (hasStylePalette && style) {
    const nextStyle: Record<string, unknown> = { ...style };
    delete nextStyle['linkageColors'];
    next['style'] = nextStyle;
  }
  if (hasLegacyRegions) {
    // `next` is already a fresh shallow copy, but its `regions` array (and the
    // region objects inside) are shared with the caller's raw row — the
    // upgrade builds new ones instead of mutating those.
    const upgraded = upgradeRegionStyleDraft(next);
    if (upgraded) return upgraded;
  }
  return next;
}
