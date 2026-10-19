import { describe, expect, it } from 'vitest';
import { PUZZLE_DESCRIPTION_MAX_LENGTH, PUZZLE_NAME_MAX_LENGTH } from '../constants';
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

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    map: { mapId: 217, versionNo: 3, gridSize: 6 },
    name: '午夜花园',
    description: '六人六格，注意花丛的位置条件。',
    linkageColors: palette,
    characterSlots: [slot(), null, null, null, null, null],
    ...extra,
  };
}

describe('puzzleDraftSchema —— v0.5.0 FEAT-K08 结构', () => {
  it('accepts the documented payload shape', () => {
    const result = puzzleDraftSchema.safeParse(draft());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map).toEqual({ mapId: 217, versionNo: 3, gridSize: 6 });
    expect(result.data.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
  });

  it('rejects unknown top-level keys (schema stays strict)', () => {
    expect(puzzleDraftSchema.safeParse(draft({ cells: {} })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ style: {} })).success).toBe(false);
  });

  it('rejects a map reference that is not a (mapId, versionNo, gridSize) triple', () => {
    expect(puzzleDraftSchema.safeParse(draft({ map: { mapId: 1, versionNo: 0, gridSize: 6 } })).success).toBe(
      false,
    );
    expect(puzzleDraftSchema.safeParse(draft({ map: { mapId: 1, gridSize: 6 } })).success).toBe(false);
    expect(
      puzzleDraftSchema.safeParse(draft({ map: { mapId: 1, versionNo: 1, gridSize: 99 } })).success,
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
