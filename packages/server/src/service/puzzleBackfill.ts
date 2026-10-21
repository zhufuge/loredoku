import { DEFAULT_LINKAGE_COLORS } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';
import { readLegacyCharacterSlots, readLegacyLinkageColors } from './mapDraftCompat';

/**
 * v0.5.0 §11.2 (docs/v0.5.0.md) — the data half of the puzzle backfill
 * migration, kept pure so it can be unit tested without a database (knex treats
 * every file in `db/migrations` as a migration, so helpers live here instead).
 *
 * Before v0.5.0 a map's participants sat inside `draft_data` / `map_versions.data`.
 * They now belong to a puzzle, and a puzzle **must** reference a published
 * version. So the migration gives every map that has at least one version a
 * puzzle holding the **highest** version's roster, and leaves the old JSON
 * untouched (the reader absorbs it — see `mapDraftCompat.ts`).
 */

export interface PuzzleSeedMap {
  id: number;
  name: string;
  description: string | null;
  gridSize: number;
}

export interface PuzzleSeedVersion {
  versionNo: number;
  gridSize: number;
  /** Raw `map_versions.data` — the v2 shape, with the roster inside. */
  data: unknown;
}

/**
 * Pads / truncates a legacy roster to `gridSize`, the puzzle's slot-length
 * convention. A missing roster becomes an all-`null` array of the right length.
 */
export function slotsFromLegacyDraft(
  raw: unknown,
  gridSize: number,
): Array<CharacterSlotEntry | null> {
  const legacy = readLegacyCharacterSlots(raw);
  const slots: Array<CharacterSlotEntry | null> = [];
  for (let index = 0; index < gridSize; index += 1) {
    slots.push(legacy[index] ?? null);
  }
  return slots;
}

/**
 * The palette the seed puzzle should carry: the version's own palette when it
 * had one, otherwise the shipped red / blue default. Copies the entries so the
 * constant is never handed out by reference.
 */
export function linkageColorsFromLegacyDraft(raw: unknown): MapLinkageColor[] {
  const legacy = readLegacyLinkageColors(raw);
  if (legacy.length > 0) return legacy.map((entry) => ({ ...entry }));
  return DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
}

/**
 * 迁移 `00016` 写进行里的**历史形状**：v1 的引用式底图（`{ mapId, versionNo,
 * gridSize }`，画布不复制）。迁移 `00031` 会把每一行升成 v2 并补齐画布副本，
 * 所以这里刻意写死 `version: 1` —— 迁移产物必须与 `PUZZLE_JSON_VERSION` 当前
 * 取值无关，否则重放一段历史迁移的结果会随版本号漂移。
 */
export interface PuzzleSeedDraft {
  version: 1;
  map: { mapId: number; versionNo: number; gridSize: number };
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
}

/**
 * Builds the puzzle row a map's participants should move into. Returns `null`
 * when the map has **no published version**: a puzzle without a canvas cannot
 * exist, so the roster stays where it is (readable, just not shown).
 */
export function buildPuzzleSeedFromMap(
  mapRow: PuzzleSeedMap,
  version: PuzzleSeedVersion | null,
  seedName: string,
): PuzzleSeedDraft | null {
  if (!version) return null;

  const gridSize = version.gridSize;
  const description = mapRow.description ?? '';
  return {
    version: 1,
    map: { mapId: mapRow.id, versionNo: version.versionNo, gridSize },
    name: seedName,
    description,
    linkageColors: linkageColorsFromLegacyDraft(version.data),
    characterSlots: slotsFromLegacyDraft(version.data, gridSize),
  };
}
