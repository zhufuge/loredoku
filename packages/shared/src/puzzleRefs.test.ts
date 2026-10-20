import { describe, expect, it } from 'vitest';
import { validatePuzzleReferences } from './puzzleRefs';
import type { PuzzleDraft } from './types/domain';

const context = {
  cells: {
    '0,0': { item: { assetId: 12, w: 1, h: 1 } },
    '1,1': { item: { assetId: 34, w: 1, h: 1 } },
    '2,2': { background: { assetId: 5 } },
  },
  regions: [{ id: 'rg_a1b2c3', name: '森林区', cells: [[2, 2]] as Array<[number, number]> }],
};

function draft(slots: PuzzleDraft['characterSlots']): PuzzleDraft {
  return {
    version: 1,
    map: { mapId: 217, versionNo: 3, gridSize: 6 },
    name: '午夜花园',
    description: '',
    linkageColors: [
      { key: 'red', label: '红', color: '#E5484D' },
      { key: 'blue', label: '蓝', color: '#3E63DD' },
    ],
    characterSlots: slots,
  };
}

const slot = (linkages: NonNullable<PuzzleDraft['characterSlots'][number]>['linkages']): PuzzleDraft['characterSlots'][number] => ({
  characterId: 12,
  themeColor: '#FFFFFF',
  clue: '',
  linkages,
});

describe('validatePuzzleReferences (v0.5.0 §5.2)', () => {
  it('returns nothing when every asset / region target resolves', () => {
    const issues = validatePuzzleReferences(
      draft([
        slot([
          { type: 'asset', id: 12, scope: 'all', effect: 'highlight', color: 'red' },
          { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'blue' },
        ]),
      ]),
      context,
    );
    expect(issues).toEqual([]);
  });

  it('ignores character / cell targets — those are the schema\u2019s job', () => {
    const issues = validatePuzzleReferences(
      draft([
        slot([
          { type: 'character', id: 999, effect: 'highlight', color: 'red' },
          { type: 'cell', cells: [[99, 99]], effect: 'highlight', color: 'red' },
        ]),
      ]),
      context,
    );
    expect(issues).toEqual([]);
  });

  it('ignores an item-layer asset id that only exists as a background', () => {
    // Asset #5 sits on the background layer, so it is not an item anchor.
    const issues = validatePuzzleReferences(
      draft([slot([{ type: 'asset', id: 5, scope: 'all', effect: 'highlight', color: 'red' }])]),
      context,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain('联动目标资源 #5 不在地图中');
  });

  it('reports a missing asset target with the slot + target index', () => {
    const issues = validatePuzzleReferences(
      draft([null, slot([{ type: 'asset', id: 999, scope: 'all', effect: 'highlight', color: 'red' }])]),
      context,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ slotIndex: 1, targetIndex: 0 });
    expect(issues[0]?.message).toBe('参与者框 2 的联动目标资源 #999 不在地图中');
  });

  it('reports a missing region target', () => {
    const issues = validatePuzzleReferences(
      draft([slot([{ type: 'region', id: 'nope', effect: 'highlight', color: 'red' }])]),
      context,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toBe('参与者框 1 的联动目标区域 nope 不在地图中');
  });

  it('collects every issue in roster order', () => {
    const issues = validatePuzzleReferences(
      draft([
        slot([
          { type: 'asset', id: 999, scope: 'all', effect: 'highlight', color: 'red' },
          { type: 'region', id: 'nope', effect: 'highlight', color: 'red' },
        ]),
        slot([{ type: 'asset', id: 998, scope: 'all', effect: 'highlight', color: 'red' }]),
      ]),
      context,
    );
    expect(issues.map((issue) => [issue.slotIndex, issue.targetIndex])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });

  it('treats an empty roster / bare canvas as valid', () => {
    expect(validatePuzzleReferences(draft([]), { cells: {}, regions: [] })).toEqual([]);
    expect(validatePuzzleReferences(draft([null, null]), { cells: {}, regions: [] })).toEqual([]);
  });

  it('rejects every asset / region target when the referenced map has no canvas', () => {
    const issues = validatePuzzleReferences(
      draft([
        slot([
          { type: 'asset', id: 12, scope: 'all', effect: 'highlight', color: 'red' },
          { type: 'region', id: 'rg_a1b2c3', effect: 'highlight', color: 'red' },
        ]),
      ]),
      { cells: {}, regions: [] },
    );
    expect(issues).toHaveLength(2);
  });
});
