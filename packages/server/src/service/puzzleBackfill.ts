import { DEFAULT_LINKAGE_COLORS } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';
import { readLegacyCharacterSlots, readLegacyLinkageColors } from './mapDraftCompat';

/**
 * v0.5.0 §11.2：puzzle 回填迁移的数据半边，保持纯函数以便无库单测（knex 把 migrations 下每个文件当迁移）；每个有版本的图建一条 puzzle，取**最高版本**的名单，旧 JSON 不动（读者在 `mapDraftCompat.ts` 吸收）。
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

/** 名单按 `gridSize` 补齐 / 截断，缺失的补 `null`（puzzle 槽位长度约定）。 */
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

/** 版本自带调色板优先，否则内置红 / 蓝默认；条目浅拷贝，不把常量引用发出去。 */
export function linkageColorsFromLegacyDraft(raw: unknown): MapLinkageColor[] {
  const legacy = readLegacyLinkageColors(raw);
  if (legacy.length > 0) return legacy.map((entry) => ({ ...entry }));
  return DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
}

/**
 * 迁移 `00016` 写进的历史形状：v1 引用式底图；`version: 1` 刻意写死，迁移产物不随 `PUZZLE_JSON_VERSION` 漂移（`00031` 再升 v2 补画布副本）。
 */
export interface PuzzleSeedDraft {
  version: 1;
  map: { mapId: number; versionNo: number; gridSize: number };
  name: string;
  description: string;
  linkageColors: MapLinkageColor[];
  characterSlots: Array<CharacterSlotEntry | null>;
}

/** 没有已发布版本返 `null`（无画布的 puzzle 不存在），名单留在原处可读、不展示。 */
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
