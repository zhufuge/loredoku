import { MAP_JSON_VERSION, PUZZLE_JSON_VERSION } from '@loredoku/shared';
import type { MapDraft, PuzzleDraft } from '@loredoku/shared';
import { absorbLegacyMapDraft } from './mapDraftCompat';

/** 谜题 JSON v1 ⇄ v2 的纯转换（v0.7.1 §5.4）：`up()` 换成自带画布、`down()` 拆回来源 id，共用以保证往返一致。
 *  v1 是 `map: { mapId, versionNo, gridSize }`（docs/v0.5.0.md §5.1），v2 多 `mapName` 与画布 `data`（docs/v0.7.1.md §5.3）；不碰 DB。 */

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

/** 旧列 / 旧 JSON 里的数字都可能是字符串，统一钳到正整数（不合法就给 1）。 */
function positive(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

/** 一份空画布 —— 引用的地图版本已经被硬删时只能这么兜（schema 合法、编辑器能开）。 */
function emptyCanvas(gridSize: number): MapDraft {
  return { version: MAP_JSON_VERSION, gridSize, cells: {}, regions: [] };
}

/** v1 的 `map` 块里读尺寸；读不出就退回旧的 `puzzles.grid_size` 列。 */
function legacyGridSize(legacyMap: Record<string, unknown> | null, fallback: number): number {
  const size = Number(legacyMap?.['gridSize'] ?? fallback);
  return Number.isFinite(size) && size > 0 ? Math.trunc(size) : fallback;
}

export interface PuzzleCanvasSource {
  /** 源地图条目 id（展示 / 追溯用，无 FK）。 */
  mapId: number;
  /** 源版本号。 */
  versionNo: number;
  /** 源版本的名字快照。 */
  mapName: string;
  /** 源版本的画布（任意历史版本，内部过 `absorbLegacyMapDraft` 升到当前）。 */
  data: unknown;
}

/** 把存量谜题 `data` 升成 v2，画布从 {@link PuzzleCanvasSource} 复制；无画布给空画布，尺寸取 v1 `map.gridSize` 再退 `fallbackGridSize`。
 *  名册长度必须不变（否则编辑器一开就崩）；返回 null = 不是谜题草稿（无 `characterSlots`）。 */
export function buildPuzzleDraftV2(
  raw: unknown,
  source: PuzzleCanvasSource,
  fallbackGridSize: number,
): PuzzleDraft | null {
  const record = asRecord(raw);
  if (!record || !Array.isArray(record['characterSlots'])) return null;

  const legacyMap = asRecord(record['map']);
  const gridSize = legacyGridSize(legacyMap, fallbackGridSize);
  const canvas = absorbLegacyMapDraft(source.data) as MapDraft | null;
  const data =
    canvas && typeof canvas === 'object' && typeof canvas.gridSize === 'number'
      ? canvas
      : emptyCanvas(gridSize);

  const { map: _discarded, ...rest } = record;
  return {
    ...(rest as unknown as Omit<PuzzleDraft, 'map' | 'version'>),
    version: PUZZLE_JSON_VERSION,
    map: {
      mapId: source.mapId,
      versionNo: source.versionNo,
      mapName: source.mapName,
      data,
    },
  };
}

/** `down()` 回填旧列要用的四个数 + 拆回 v1 的 `data`。 */
export interface LegacyPuzzleRecord {
  data: Record<string, unknown>;
  mapId: number;
  versionNo: number;
  gridSize: number;
}

/** v2 → v1：`map` 只剩 `{ mapId, versionNo, gridSize }`，画布丢弃（`down` 之后画布又能从 `maps` 的版本行 join 到，所以这不丢信息）。来源字段从 v2 的 `map` 块读出，正是 `up()` 当时写进去的那三个。 返回 `null` = 不是谜题草稿。 */
export function puzzleDraftToLegacy(raw: unknown): LegacyPuzzleRecord | null {
  const record = asRecord(raw);
  if (!record || !Array.isArray(record['characterSlots'])) return null;

  const snapshot = asRecord(record['map']);
  const canvas = asRecord(snapshot?.['data']);
  const rawSize = canvas ? canvas['gridSize'] : snapshot?.['gridSize'] ?? record['gridSize'];
  const rawMapId = snapshot?.['mapId'] ?? record['map_project_id'];
  const rawVersionNo = snapshot?.['versionNo'] ?? record['map_version_no'];

  const gridSize = positive(rawSize);
  const mapId = positive(rawMapId);
  const versionNo = positive(rawVersionNo);

  const { map: _canvas, ...rest } = record;
  return {
    data: {
      ...rest,
      version: 1,
      map: { mapId, versionNo, gridSize },
    },
    mapId,
    versionNo,
    gridSize,
  };
}
