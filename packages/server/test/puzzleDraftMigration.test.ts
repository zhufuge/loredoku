import { describe, expect, it } from 'vitest';
import { MAP_JSON_VERSION } from '@loredoku/shared';
import {
  buildPuzzleDraftV2,
  puzzleDraftToLegacy,
  type PuzzleCanvasSource,
} from '../src/service/puzzleDraftMigration';

/**
 * v0.7.1 §5.3 / §5.4：谜题 JSON v1 ⇄ v2 的纯转换，`up()` / `down()` 共用同一
 * 组函数（往返必须对得上，所以这里钉住往返本身）。
 */

/** v1：引用式底图，画布靠 join —— 迁移前的存量形状。 */
function legacyDraft(gridSize = 4): Record<string, unknown> {
  return {
    version: 1,
    map: { mapId: 77, versionNo: 3, gridSize },
    name: '旧谜题',
    description: '一份没有画布的谜题',
    linkageColors: [
      { key: 'red', label: '红', color: '#ff0000' },
      { key: 'blue', label: '蓝', color: '#0000ff' },
    ],
    characterSlots: Array.from({ length: gridSize }, () => null),
    rosterCols: null,
  };
}

/** 一份 v6 存量画布 —— 迁移时要顺带升到当前版本。 */
function storedCanvas(gridSize = 4): Record<string, unknown> {
  return {
    version: MAP_JSON_VERSION,
    gridSize,
    cells: { '0,0': { background: { assetId: 3, formId: 9 } } },
    regions: [],
  };
}

function source(overrides: Partial<PuzzleCanvasSource> = {}): PuzzleCanvasSource {
  return { mapId: 77, versionNo: 3, mapName: '大宅', data: storedCanvas(), ...overrides };
}

describe('buildPuzzleDraftV2', () => {
  it('copies the canvas in and stamps v2', () => {
    const draft = buildPuzzleDraftV2(legacyDraft(), source(), 4);
    expect(draft).not.toBeNull();
    expect(draft!.version).toBe(2);
    expect(draft!.map.mapId).toBe(77);
    expect(draft!.map.versionNo).toBe(3);
    expect(draft!.map.mapName).toBe('大宅');
    expect(draft!.map.data.gridSize).toBe(4);
    expect(draft!.map.data.cells['0,0']?.background?.assetId).toBe(3);
    // 名册、调色板、名称都原样搬过去。
    expect(draft!.characterSlots).toHaveLength(4);
    expect(draft!.name).toBe('旧谜题');
    expect(draft!.linkageColors).toHaveLength(2);
  });

  it('upgrades an older canvas to the current JSON version', () => {
    const draft = buildPuzzleDraftV2(
      legacyDraft(6),
      source({ data: { version: 3, gridSize: 6, cells: {}, regions: [] } }),
      6,
    );
    expect(draft!.map.data.version).toBe(MAP_JSON_VERSION);
  });

  it('falls back to an empty canvas when the source version is gone', () => {
    // 引用的版本行被硬删过 —— 画布无从还原，但 schema 必须合法、名册长度不变。
    const draft = buildPuzzleDraftV2(legacyDraft(5), source({ data: null }), 5);
    expect(draft!.map.data.gridSize).toBe(5);
    expect(draft!.map.data.cells).toEqual({});
    expect(draft!.characterSlots).toHaveLength(5);
  });

  it('uses the legacy grid_size column when the map block has no size', () => {
    const legacy = legacyDraft();
    legacy['map'] = { mapId: 77, versionNo: 3 };
    const draft = buildPuzzleDraftV2(legacy, source({ data: null }), 7);
    expect(draft!.map.data.gridSize).toBe(7);
  });

  it('returns null for a payload that is not a puzzle draft', () => {
    expect(buildPuzzleDraftV2({ version: 1 }, source(), 4)).toBeNull();
    expect(buildPuzzleDraftV2(null, source(), 4)).toBeNull();
  });
});

describe('puzzleDraftToLegacy', () => {
  it('round-trips v1 → v2 → v1 without losing the source info', () => {
    const legacy = legacyDraft();
    const v2 = buildPuzzleDraftV2(legacy, source(), 4)!;
    const back = puzzleDraftToLegacy(v2)!;

    expect(back.mapId).toBe(77);
    expect(back.versionNo).toBe(3);
    expect(back.gridSize).toBe(4);
    expect(back.data['version']).toBe(1);
    expect(back.data['map']).toEqual({ mapId: 77, versionNo: 3, gridSize: 4 });
    expect(back.data['name']).toBe('旧谜题');
    expect(back.data['characterSlots']).toHaveLength(4);
    // 画布被丢弃（down 之后又能从 `maps` 的版本行 join 到）。
    expect((back.data['map'] as Record<string, unknown>)['data']).toBeUndefined();
  });

  it('derives gridSize from the canvas, not from a column', () => {
    const v2 = buildPuzzleDraftV2(legacyDraft(4), source({ data: storedCanvas(9) }), 4)!;
    // 画布是唯一真源：名册还是 4 个槽，尺寸却是 9（脏数据也不会崩）。
    expect(puzzleDraftToLegacy(v2)!.gridSize).toBe(9);
  });

  it('returns null for a payload that is not a puzzle draft', () => {
    expect(puzzleDraftToLegacy({ version: 2 })).toBeNull();
  });
});
