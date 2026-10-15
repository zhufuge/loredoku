import { describe, expect, it } from 'vitest';
import {
  applyRectClick,
  cellKey,
  clearCells,
  parseCellKey,
  selectAllCells,
  selectColumn,
  selectRectangle,
  selectRow,
  selectionToCoords,
  toggleCell,
} from './cellSelection';

describe('cellSelection helpers (MOD-801)', () => {
  it('toggles a single cell on and off', () => {
    const once = toggleCell(new Set(), 2, 3);
    expect([...once]).toEqual(['2,3']);
    expect([...toggleCell(once, 2, 3)]).toEqual([]);
    // Other cells are untouched (insertion order: '2,3' first, then '0,0').
    expect([...toggleCell(once, 0, 0)].sort()).toEqual(['0,0', '2,3']);
  });

  it('selects a whole row / column by union', () => {
    const row = selectRow(new Set(), 2, 4);
    expect(row.size).toBe(4);
    expect(selectionToCoords(row)).toEqual([
      [0, 2],
      [1, 2],
      [2, 2],
      [3, 2],
    ]);
    const col = selectColumn(new Set(), 1, 4);
    expect(selectionToCoords(col)).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [1, 3],
    ]);
    // Union keeps earlier picks.
    expect(selectRow(col, 0, 4).size).toBe(4 + 3);
  });

  it('selects a rectangle between two corners (any order)', () => {
    const rect = selectRectangle(new Set(), [3, 3], [1, 1]);
    expect(rect.size).toBe(9);
    expect(selectionToCoords(rect)).toEqual([
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
    // Union with an existing pick outside the rectangle.
    const merged = selectRectangle(new Set([cellKey(0, 0)]), [1, 1], [2, 2]);
    expect(merged.size).toBe(5);
  });

  it('rectangle quick select: first click anchors, second applies', () => {
    const first = applyRectClick(new Set(), null, [1, 1]);
    expect(first.selection.size).toBe(0);
    expect(first.anchor).toEqual([1, 1]);
    const second = applyRectClick(first.selection, first.anchor, [2, 3]);
    expect(second.anchor).toBeNull();
    expect(second.selection.size).toBe(6);
  });

  it('rectangle quick select: same corner twice toggles one cell', () => {
    const result = applyRectClick(new Set(), [1, 1], [1, 1]);
    expect(result.anchor).toBeNull();
    expect([...result.selection]).toEqual(['1,1']);
  });

  it('select all / clear cover the whole board', () => {
    const all = selectAllCells(3);
    expect(all.size).toBe(9);
    expect(clearCells().size).toBe(0);
  });

  it('round-trips cell keys', () => {
    expect(cellKey(4, 5)).toBe('4,5');
    expect(parseCellKey('4,5')).toEqual([4, 5]);
  });
});
