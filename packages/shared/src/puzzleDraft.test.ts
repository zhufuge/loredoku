import { describe, expect, it } from 'vitest';
import { PUZZLE_JSON_VERSION } from './constants';
import { absorbLegacyPuzzleDraft, puzzleGridSize } from './puzzleDraft';
import type { PuzzleDraft } from './types/domain';

const palette = [
  { key: 'red', label: '红', color: '#E5484D' },
  { key: 'blue', label: '蓝', color: '#3E63DD' },
];

function v2(gridSize = 6): PuzzleDraft {
  return {
    version: PUZZLE_JSON_VERSION,
    map: {
      mapId: 217,
      versionNo: 3,
      mapName: '午夜花园',
      data: { version: 7, gridSize, cells: { '0,0': { background: { assetId: 5 } } }, regions: [] },
    },
    name: '午夜花园',
    description: '',
    linkageColors: palette,
    characterSlots: Array.from({ length: gridSize }, () => null),
  };
}

/** The pre-v0.7.1 shape: a reference, no canvas. */
function v1(gridSize = 6): Record<string, unknown> {
  return {
    version: 1,
    map: { mapId: 217, versionNo: 3, gridSize },
    name: '午夜花园',
    description: '',
    linkageColors: palette,
    characterSlots: Array.from({ length: gridSize }, () => null),
  };
}

describe('puzzleGridSize (v0.7.1 §5.3)', () => {
  it('reads the one and only truth — the copied canvas', () => {
    expect(puzzleGridSize(v2(9))).toBe(9);
  });
});

describe('absorbLegacyPuzzleDraft (v0.7.1 §5.3)', () => {
  it('passes a v2 draft through and normalises the JSON version', () => {
    const absorbed = absorbLegacyPuzzleDraft({ ...v2(), version: 99 });
    expect(absorbed?.version).toBe(PUZZLE_JSON_VERSION);
    expect(absorbed?.map.data.gridSize).toBe(6);
    expect(puzzleGridSize(absorbed!)).toBe(6);
  });

  it('gives a v1 row an empty canvas of the same size instead of failing', () => {
    const absorbed = absorbLegacyPuzzleDraft(v1(7));
    expect(absorbed).not.toBeNull();
    expect(absorbed!.version).toBe(PUZZLE_JSON_VERSION);
    // Roster length must still line up with the board, or the editor breaks.
    expect(absorbed!.map.data.gridSize).toBe(7);
    expect(absorbed!.characterSlots).toHaveLength(7);
    expect(absorbed!.map.data.cells).toEqual({});
    // Source info survives so the header can still say where it came from.
    expect(absorbed!.map.mapId).toBe(217);
    expect(absorbed!.map.versionNo).toBe(3);
  });

  it('clamps a nonsense grid size from an old row', () => {
    const absorbed = absorbLegacyPuzzleDraft({ ...v1(0), map: { mapId: 1, versionNo: 1, gridSize: 0 } });
    expect(absorbed!.map.data.gridSize).toBeGreaterThan(0);
  });

  it('returns null for anything that is not a puzzle draft', () => {
    expect(absorbLegacyPuzzleDraft(null)).toBeNull();
    expect(absorbLegacyPuzzleDraft('nope')).toBeNull();
    expect(absorbLegacyPuzzleDraft({ name: '没有名册' })).toBeNull();
    expect(absorbLegacyPuzzleDraft({ name: '没有底图', characterSlots: [] })).toBeNull();
  });
});
