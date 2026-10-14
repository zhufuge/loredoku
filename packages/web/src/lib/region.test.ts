import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '@murdoku/shared';
import type { DraftRegion } from '@murdoku/shared';
import { buildRegionEdges, computeLabelCell, contrastTextColor, coordKey, findOverlap, isConnected, polygonCells, rectCells, regionAt, regionCellSet } from './region';

function region(id: string, cells: Array<[number, number]>): DraftRegion {
  return { id, name: `R${id}`, color: '#3B82F6', borderWidth: 4, fillOpacity: 1, cells };
}

describe('coordKey', () => {
  it('joins coordinates into a stable key', () => {
    expect(coordKey(2, 7)).toBe('2,7');
  });
});

describe('rectCells', () => {
  it('returns every cell of a rectangle from two corners', () => {
    expect(rectCells([0, 0], [1, 1])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it('normalises reversed corners', () => {
    expect(rectCells([2, 2], [0, 0])).toHaveLength(9);
    expect(rectCells([2, 2], [0, 0])[0]).toEqual([0, 0]);
  });

  it('returns a single cell when corners match', () => {
    expect(rectCells([1, 1], [1, 1])).toEqual([[1, 1]]);
  });
});

describe('regionCellSet', () => {
  it('builds a membership set', () => {
    const set = regionCellSet(region('rg_1', [[0, 0], [1, 0]]));
    expect(set.has('0,0')).toBe(true);
    expect(set.has('2,0')).toBe(false);
  });
});

describe('buildRegionEdges', () => {
  it('emits four edges for a lone cell', () => {
    const edges = buildRegionEdges([[0, 0]]);
    expect(edges).toHaveLength(4);
    expect(edges).toContainEqual({ x1: 0, y1: 0, x2: CELL_SIZE, y2: 0 });
  });

  it('omits the shared edge between adjacent cells', () => {
    const edges = buildRegionEdges([
      [0, 0],
      [1, 0],
    ]);
    expect(edges).toHaveLength(6);
    expect(edges).not.toContainEqual({
      x1: CELL_SIZE,
      y1: 0,
      x2: CELL_SIZE,
      y2: CELL_SIZE,
    });
  });

  it('wraps an L-shape without inner separators', () => {
    const edges = buildRegionEdges([
      [0, 0],
      [0, 1],
      [1, 1],
    ]);
    expect(edges).toHaveLength(8);
  });
});

describe('findOverlap', () => {
  const regions = [region('rg_1', [[0, 0], [1, 1]]), region('rg_2', [[2, 2]])];

  it('returns candidate cells already owned by another region', () => {
    expect(findOverlap(regions, { id: 'rg_new', cells: [[1, 1], [3, 3]] })).toEqual([[1, 1]]);
  });

  it('ignores the region being edited', () => {
    expect(findOverlap(regions, { id: 'rg_1', cells: [[0, 0]] })).toEqual([]);
  });
});

describe('regionAt', () => {
  const regions = [region('rg_1', [[0, 0]]), region('rg_2', [[5, 5]])];

  it('finds the region containing a coordinate', () => {
    expect(regionAt(regions, 5, 5)?.id).toBe('rg_2');
  });

  it('returns undefined for an uncovered coordinate', () => {
    expect(regionAt(regions, 9, 9)).toBeUndefined();
  });
});

describe('isConnected', () => {
  it('accepts a single cell and an orthogonally connected blob', () => {
    expect(isConnected([[0, 0]])).toBe(true);
    expect(
      isConnected([
        [0, 0],
        [1, 0],
        [1, 1],
      ]),
    ).toBe(true);
  });

  it('rejects diagonally separated cells', () => {
    expect(
      isConnected([
        [0, 0],
        [1, 1],
      ]),
    ).toBe(false);
  });
});

describe('computeLabelCell', () => {
  it('anchors to the bottom row median', () => {
    expect(
      computeLabelCell([
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 2],
        [1, 2],
      ]),
    ).toEqual([1, 2]);
  });

  it('returns null for an empty region', () => {
    expect(computeLabelCell([])).toBeNull();
  });
});

describe('polygonCells', () => {
  it('covers the cells enclosed by a square outline', () => {
    expect(polygonCells([
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ])).toEqual([
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]);
  });

  it('returns nothing for fewer than three points', () => {
    expect(polygonCells([[0, 0], [1, 1]])).toEqual([]);
  });
});

describe('contrastTextColor', () => {
  it('uses dark text on light backgrounds', () => {
    expect(contrastTextColor('#FFFFFF')).toBe('#111827');
    expect(contrastTextColor('#F59E0B')).toBe('#111827');
  });

  it('uses white text on dark backgrounds', () => {
    expect(contrastTextColor('#000000')).toBe('#FFFFFF');
    expect(contrastTextColor('#3B82F6')).toBe('#FFFFFF');
  });

  it('expands short hex colors', () => {
    expect(contrastTextColor('#fff')).toBe('#111827');
  });
});
