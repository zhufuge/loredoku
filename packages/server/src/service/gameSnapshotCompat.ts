import { DEFAULT_MAP_STYLE } from '@loredoku/shared';
import type { MapDraft, MapGameSnapshot } from '@loredoku/shared';
import {
  absorbLegacyMapDraft,
  readLegacyCharacterSlots,
  readLegacyLinkageColors,
} from './mapDraftCompat';

/**
 * v0.5.0 CONS-K16 (docs/v0.5.0.md §10.1 / §11.3) — normalises a stored
 * `map_games.snapshot` into the current `MapGameSnapshot` shape.
 *
 * Two shapes exist in the wild:
 *
 * - **v0.5.0+** — `{ map, puzzle }` (the roster and palette live on the puzzle);
 * - **v0.4.x** — the snapshot *is* the map draft, with `characterSlots` and
 *   `style.linkageColors` inside it.
 *
 * Legacy games must keep playing with **zero repair**, so the old roster and
 * palette are lifted out into `legacyCharacterSlots` / `legacyLinkageColors`
 * while the map part is absorbed into the v3 shape.
 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function isDraftLike(raw: unknown): boolean {
  const record = asRecord(raw);
  return record !== null && typeof record['gridSize'] === 'number';
}

/** `true` when the payload already uses the v0.5.0 `{ map, puzzle }` shape. */
export function isWrappedSnapshot(raw: unknown): boolean {
  return isDraftLike(asRecord(raw)?.['map']);
}

export function toGameSnapshot(raw: unknown): MapGameSnapshot {
  const record = asRecord(raw);

  if (record && isWrappedSnapshot(raw)) {
    const snapshot: MapGameSnapshot = {
      map: toMapDraft(record['map']),
      puzzle: (record['puzzle'] ?? null) as MapGameSnapshot['puzzle'],
    };
    const legacySlots = record['legacyCharacterSlots'];
    if (Array.isArray(legacySlots)) {
      snapshot.legacyCharacterSlots = readLegacyCharacterSlots({ characterSlots: legacySlots });
    }
    const legacyColors = record['legacyLinkageColors'];
    if (Array.isArray(legacyColors)) {
      snapshot.legacyLinkageColors = readLegacyLinkageColors({ style: { linkageColors: legacyColors } });
    }
    return snapshot;
  }

  // v0.4.x: the whole payload is the map draft, roster included.
  const snapshot: MapGameSnapshot = { map: toMapDraft(raw), puzzle: null };
  const slots = readLegacyCharacterSlots(raw);
  if (slots.length > 0) snapshot.legacyCharacterSlots = slots;
  const colors = readLegacyLinkageColors(raw);
  if (colors.length > 0) snapshot.legacyLinkageColors = colors;
  return snapshot;
}

/** Absorbs the v2 → v3 differences and fills a missing `style` block. */
function toMapDraft(raw: unknown): MapDraft {
  const absorbed = asRecord(absorbLegacyMapDraft(raw));
  if (!absorbed) {
    throw new Error('游戏快照的地图部分不是对象');
  }
  const draft = absorbed as unknown as MapDraft;
  return draft.style ? draft : { ...draft, style: { ...DEFAULT_MAP_STYLE } };
}
