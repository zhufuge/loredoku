import { GRID_SIZE_MAX, GRID_SIZE_MIN, MAP_JSON_VERSION, PUZZLE_JSON_VERSION } from './constants';
import type { MapDraft, PuzzleDraft } from './types/domain';

/**
 * 谜题草稿的两个纯函数（v0.7.1 §5.3）。放在 shared 是为了让「尺寸从哪来」
 * 只有一处答案 —— 列表、游戏摘要、名册长度校验、schema 全都走同一个入口。
 */

/** 画布尺寸的唯一真源：`data.map.data.gridSize`（高压线 4，没有列）。 */
export function puzzleGridSize(draft: PuzzleDraft): number {
  return draft.map.data.gridSize;
}

function clampGridSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isFinite(size)) return GRID_SIZE_MIN;
  return Math.min(GRID_SIZE_MAX, Math.max(GRID_SIZE_MIN, Math.trunc(size)));
}

/** 一份空画布 —— 旧数据的底图已经不可解析时用它兜底（schema 合法，编辑器能开）。 */
function emptyCanvas(gridSize: number): MapDraft {
  return { version: MAP_JSON_VERSION, gridSize, cells: {}, regions: [] };
}

/**
 * 把存量 `puzzles.data` 升到 v2。
 *
 * 迁移 `20260101000031` 已经把每一行改写成 v2（画布从引用版本复制进来），所以
 * 这里只兜两种边角：迁移之后才出现的脏数据，以及把 v1 payload 读进内存的场景。
 * v1 的 `{ mapId, versionNo, gridSize }` 里**没有画布**，无法凭空还原 ——
 * 给一份空画布，名册长度不变（否则参与者与格子对不上，编辑器会崩）。
 *
 * 返回 `null` = 这份 data 根本不是谜题草稿。
 */
export function absorbLegacyPuzzleDraft(raw: unknown): PuzzleDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record['characterSlots'])) return null;

  const map = record['map'];
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const snapshot = map as Record<string, unknown>;
    if (snapshot['data'] && typeof snapshot['data'] === 'object') {
      // 已经是 v2：只把 `version` 归一到当前值。
      return { ...(raw as PuzzleDraft), version: PUZZLE_JSON_VERSION };
    }
    // v1 引用式底图：没有画布可还原。
    const { map: _legacyMap, ...rest } = record as unknown as PuzzleDraft & { map: unknown };
    return {
      ...(rest as Omit<PuzzleDraft, 'map' | 'version'>),
      version: PUZZLE_JSON_VERSION,
      map: {
        // 这两个字段只用于展示 / 追溯，钳到正数以免写回时被 schema 拒。
        mapId: Math.max(1, Math.trunc(Number(snapshot['mapId'])) || 1),
        versionNo: Math.max(1, Math.trunc(Number(snapshot['versionNo'])) || 1),
        mapName: '',
        data: emptyCanvas(clampGridSize(snapshot['gridSize'])),
      },
    };
  }
  return null;
}
