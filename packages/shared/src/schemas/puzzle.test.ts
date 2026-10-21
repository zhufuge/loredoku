import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE_MAX,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
} from '../constants';
import {
  createPuzzleSchema,
  puzzleDraftSchema,
  savePuzzleDraftSchema,
  updatePuzzleSchema,
} from './puzzle';

const palette = [
  { key: 'red', label: '红', color: '#E5484D' },
  { key: 'blue', label: '蓝', color: '#3E63DD' },
];

const slot = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  characterId: 12,
  themeColor: '#FFFFFF',
  clue: '',
  linkages: [],
  ...extra,
});

const mapSnapshot = (gridSize = 6): Record<string, unknown> => ({
  mapId: 217,
  versionNo: 3,
  mapName: '午夜花园',
  data: { version: 7, gridSize, cells: {}, regions: [] },
});

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    map: mapSnapshot(),
    name: '午夜花园',
    description: '六人六格，注意花丛的位置条件。',
    linkageColors: palette,
    characterSlots: [slot(), null, null, null, null, null],
    ...extra,
  };
}

describe('puzzleDraftSchema —— v0.7.1 底图快照 + 名册结构', () => {
  it('accepts the documented payload shape', () => {
    const result = puzzleDraftSchema.safeParse(draft());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map).toEqual(mapSnapshot());
    expect(result.data.map.data.gridSize).toBe(6);
    expect(result.data.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
  });

  it('rejects unknown top-level keys (schema stays strict)', () => {
    expect(puzzleDraftSchema.safeParse(draft({ cells: {} })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ style: {} })).success).toBe(false);
  });

  it('rejects a map snapshot without a canvas (the v1 reference shape)', () => {
    // v1 payloads are readable only through `absorbLegacyPuzzleDraft`; a raw v1
    // object must not slip through the v2 schema.
    expect(
      puzzleDraftSchema.safeParse(draft({ map: { mapId: 217, versionNo: 3, gridSize: 6 } })).success,
    ).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ map: { mapId: 1, versionNo: 3 } })).success).toBe(false);
    expect(
      puzzleDraftSchema.safeParse(
        draft({ map: { ...mapSnapshot(), data: { version: 7, gridSize: 99, cells: {}, regions: [] } } }),
      ).success,
    ).toBe(false);
  });

  it('requires the palette (no silent default) and enforces 2 ~ 12 entries', () => {
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: undefined })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: [palette[0]] })).success).toBe(false);
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      key: `k${index}`,
      label: `k${index}`,
      color: '#123456',
    }));
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: twelve })).success).toBe(true);
    expect(
      puzzleDraftSchema.safeParse(
        draft({ linkageColors: [...twelve, { key: 'k13', label: 'x', color: '#123456' }] }),
      ).success,
    ).toBe(false);
  });

  it('caps the description and requires a non-empty name', () => {
    expect(
      puzzleDraftSchema.safeParse(draft({ description: 'x'.repeat(PUZZLE_DESCRIPTION_MAX_LENGTH + 1) }))
        .success,
    ).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ description: '' })).success).toBe(true);
    expect(puzzleDraftSchema.safeParse(draft({ name: '   ' })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ name: 'x'.repeat(PUZZLE_NAME_MAX_LENGTH + 1) })).success).toBe(
      false,
    );
  });

  it('does not constrain the roster length to gridSize', () => {
    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [] })).success).toBe(true);
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: Array.from({ length: 20 }, () => null) }))
        .success,
    ).toBe(true);
  });

  /**
   * v0.6.3 (docs/v0.6.3.md §3.1) — the roster's column count.
   *
   * The point of the field being optional: a puzzle saved before this version
   * has no such key and must still load, and it loads as 自动 — which is
   * exactly the layout it had. That is also why the JSON version stays put.
   */
  it('keeps the roster column count optional and bounded', () => {
    const older = puzzleDraftSchema.parse(draft());
    expect(older.rosterCols).toBeUndefined();

    expect(puzzleDraftSchema.safeParse(draft({ rosterCols: null })).success).toBe(true);
    expect(puzzleDraftSchema.parse(draft({ rosterCols: 3 })).rosterCols).toBe(3);
    // The board's own bound, not the roster's — a column count above the slot
    // count is clamped at render time, not refused here.
    expect(puzzleDraftSchema.safeParse(draft({ rosterCols: GRID_SIZE_MAX })).success).toBe(true);

    for (const bad of [0, -2, 2.5, GRID_SIZE_MAX + 1, '3'] as Array<unknown>) {
      expect(puzzleDraftSchema.safeParse(draft({ rosterCols: bad })).success, String(bad)).toBe(
        false,
      );
    }
  });

  /**
   * v0.6.4 (docs/v0.6.4.md §2) — the per-participant 编号展示 text.
   *
   * Same optional-field rule as `rosterCols`: a payload saved before this
   * version has no such key and still parses, and the badge then shows the
   * sequence number — which is what it always showed. Trimmed on the way in,
   * bounded, and `null` is accepted so "cleared" round-trips.
   */
  it('keeps the participant 编号展示 text optional, trimmed and bounded', () => {
    const older = puzzleDraftSchema.parse(draft());
    expect(older.characterSlots[0]).not.toHaveProperty('displayNumber');

    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: '甲' })] })).success).toBe(
      true,
    );
    expect(
      puzzleDraftSchema.parse(draft({ characterSlots: [slot({ displayNumber: '  7  ' })] }))
        .characterSlots[0],
    ).toMatchObject({ displayNumber: '7' });
    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: null })] })).success).toBe(
      true,
    );

    const tooLong = 'x'.repeat(PARTICIPANT_DISPLAY_NUMBER_MAX + 1);
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: tooLong })] })).success,
    ).toBe(false);
    for (const bad of [7, {}, []] as Array<unknown>) {
      expect(
        puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: bad })] })).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});

describe('puzzleDraftSchema 自洽引用校验 (§5.2 第一半)', () => {
  it('accepts character / cell / color references that resolve', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [
          slot({
            characterId: 12,
            linkages: [
              { type: 'character', id: 34, effect: 'highlight', color: 'red' },
              { type: 'cell', cells: [[3, 4]], effect: 'highlight', color: 'blue' },
            ],
          }),
          slot({ characterId: 34 }),
          null,
          null,
          null,
          null,
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a dangling character target', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'character', id: 999, effect: 'highlight', color: 'red' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('不在参与者中'))).toBe(true);
  });

  it('rejects a cell target outside the referenced gridSize', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'cell', cells: [[99, 0]], effect: 'highlight', color: 'red' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('超出画布范围'))).toBe(true);
  });

  it('rejects a linkage colour missing from the puzzle palette', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'green' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('green'))).toBe(true);
  });

  it('rejects a position condition outside the referenced gridSize', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({ characterSlots: [slot({ positionConditions: [{ x: 6, y: 0 }] })] }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('超出画布范围'))).toBe(true);
  });

  it('accepts an in-bounds position condition', () => {
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ positionConditions: [{ x: 5, y: 0 }] })] }))
        .success,
    ).toBe(true);
  });

  it('leaves asset / region targets to validatePuzzleReferences (§5.2 第二半)', () => {
    // The schema cannot see the map's canvas, so an unresolvable asset target
    // is accepted here — `validatePuzzleReferences` rejects it.
    expect(
      puzzleDraftSchema.safeParse(
        draft({
          characterSlots: [
            slot({ linkages: [{ type: 'asset', id: 999, scope: 'all', effect: 'highlight', color: 'red' }] }),
          ],
        }),
      ).success,
    ).toBe(true);
  });
});

describe('谜题的三个写入 schema', () => {
  it('createPuzzleSchema requires name + mapId + mapVersionNo', () => {
    expect(createPuzzleSchema.safeParse({ name: '午夜花园', mapId: 217, mapVersionNo: 3 }).success).toBe(
      true,
    );
    expect(createPuzzleSchema.safeParse({ name: '午夜花园', mapId: 217 }).success).toBe(false);
    expect(createPuzzleSchema.safeParse({ name: '午夜花园', mapVersionNo: 3 }).success).toBe(false);
    const parsed = createPuzzleSchema.parse({ name: ' 午夜花园 ', mapId: 217, mapVersionNo: 3 });
    expect(parsed.name).toBe('午夜花园');
    expect(parsed.description).toBeUndefined();
  });

  it('savePuzzleDraftSchema wraps data + optional updatedAt', () => {
    expect(savePuzzleDraftSchema.safeParse({ data: draft() }).success).toBe(true);
    expect(
      savePuzzleDraftSchema.safeParse({ data: draft(), updatedAt: '2026-10-16T00:00:00.000Z' }).success,
    ).toBe(true);
    expect(savePuzzleDraftSchema.safeParse({ data: draft({ name: '' }) }).success).toBe(false);
  });

  it('updatePuzzleSchema allows a rename / description edit', () => {
    expect(updatePuzzleSchema.safeParse({ name: '新名字' }).success).toBe(true);
    expect(updatePuzzleSchema.safeParse({ description: '' }).success).toBe(true);
    expect(updatePuzzleSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(updatePuzzleSchema.safeParse({}).success).toBe(true);
  });
});
