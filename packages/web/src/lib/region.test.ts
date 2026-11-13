import { describe, expect, it } from 'vitest';
import { DEFAULT_CELL_SIZE } from '@loredoku/shared';
import type { DraftRegion } from '@loredoku/shared';
import { buildRegionEdges, buildRegionHighlightPaths, brushStrokeErases, computeLabelCell, contrastTextColor, coordKey, findOverlap, isConnected, regionAt, regionCellSet } from './region';

function region(id: string, cells: Array<[number, number]>): DraftRegion {
  return { id, name: `R${id}`, cells };
}

describe('coordKey', () => {
  it('joins coordinates into a stable key', () => {
    expect(coordKey(2, 7)).toBe('2,7');
  });
});

describe('brushStrokeErases', () => {
  it('adds when the stroke starts on an unselected cell', () => {
    expect(brushStrokeErases(false, false)).toBe(false);
  });

  it('removes when the stroke starts on an already selected cell', () => {
    expect(brushStrokeErases(true, false)).toBe(true);
  });

  it('Alt always removes, whatever the start cell', () => {
    expect(brushStrokeErases(false, true)).toBe(true);
    expect(brushStrokeErases(true, true)).toBe(true);
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
    const edges = buildRegionEdges([[0, 0]], DEFAULT_CELL_SIZE);
    expect(edges).toHaveLength(4);
    expect(edges).toContainEqual({ x1: 0, y1: 0, x2: DEFAULT_CELL_SIZE, y2: 0 });
  });

  it('omits the shared edge between adjacent cells', () => {
    const edges = buildRegionEdges(
      [
        [0, 0],
        [1, 0],
      ],
      DEFAULT_CELL_SIZE,
    );
    expect(edges).toHaveLength(6);
    expect(edges).not.toContainEqual({
      x1: DEFAULT_CELL_SIZE,
      y1: 0,
      x2: DEFAULT_CELL_SIZE,
      y2: DEFAULT_CELL_SIZE,
    });
  });

  it('wraps an L-shape without inner separators', () => {
    const edges = buildRegionEdges(
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      DEFAULT_CELL_SIZE,
    );
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

  it('v0.10.7: defaultLabelCell 优先于自动计算的底部行中央', () => {
    // 区域横跨 (0,0)(1,0)(0,2)(1,2)，自动计算会落到 (1,2)，但指定了 defaultLabelCell (3, 1)。
    expect(computeLabelCell([[0, 0], [1, 0], [0, 2], [1, 2]], [3, 1])).toEqual([3, 1]);
  });

  it('v0.10.7: defaultLabelCell 为空时退回底部行中央', () => {
    expect(
      computeLabelCell(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [0, 2],
          [1, 2],
        ],
        null,
      ),
    ).toEqual([1, 2]);
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

// ---- FIX-E02 (docs/v0.3.9.md §2): the inset region highlight outline ----
describe('buildRegionHighlightPaths', () => {
  const SHAPES: Array<{ name: string; cells: Array<[number, number]> }> = [
    { name: '单格', cells: [[0, 0]] },
    {
      name: '矩形',
      cells: [
        [1, 1],
        [2, 1],
        [1, 2],
        [2, 2],
      ],
    },
    {
      name: 'L 形',
      cells: [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
    {
      name: '十字形',
      cells: [
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [1, 2],
      ],
    },
    {
      name: '回字形（带洞）',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [2, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
    },
    {
      name: '蛇形',
      cells: [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 2],
      ],
    },
  ];

  /** Parses a `M x y L x y … Z` path back into its vertices. */
  function vertices(d: string): Array<[number, number]> {
    const tokens = d.replace(/[MLZ]/g, ' ').trim().split(/\s+/).map(Number);
    const points: Array<[number, number]> = [];
    for (let index = 0; index + 1 < tokens.length; index += 2) {
      points.push([tokens[index]!, tokens[index + 1]!]);
    }
    return points;
  }

  it('FIX-E02 验收: every loop is a closed, gap-free rectilinear outline', () => {
    for (const cellSize of [90, 102, 120, 240]) {
      const inset = 6 * (cellSize / 120) / 2 + 4 * (cellSize / 120) / 2;
      for (const shape of SHAPES) {
        const paths = buildRegionHighlightPaths(shape.cells, cellSize, inset);
        expect(paths.length, shape.name).toBeGreaterThan(0);
        for (const path of paths) {
          expect(path.d.endsWith(' Z'), shape.name).toBe(true);
          const points = vertices(path.d);
          expect(points.length, shape.name).toBe(path.vertices);
          expect(path.vertices, shape.name).toBeGreaterThanOrEqual(4);
          // Consecutive vertices always share an axis → the loop is connected.
          for (let index = 0; index < points.length; index += 1) {
            const a = points[index]!;
            const b = points[(index + 1) % points.length]!;
            expect(
              a[0] === b[0] || a[1] === b[1],
              `${shape.name} ${JSON.stringify(a)}->${JSON.stringify(b)}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('insets a single cell on all four sides', () => {
    const [path] = buildRegionHighlightPaths([[0, 0]], 100, 10);
    expect(path?.d).toBe('M 10 10 L 90 10 L 90 90 L 10 90 Z');
    expect(path?.vertices).toBe(4);
  });

  it('keeps a straight run connected (one loop, no gap at cell borders)', () => {
    const paths = buildRegionHighlightPaths(
      [
        [0, 0],
        [1, 0],
      ],
      100,
      5,
    );
    expect(paths).toHaveLength(1);
    const points = vertices(paths[0]!.d);
    // The shared cell border at x = 100 stays on the outline, so the top edge
    // is one unbroken run from x = 5 to x = 195.
    expect(points).toContainEqual([100, 5]);
    expect(points).toContainEqual([5, 5]);
    expect(points).toContainEqual([195, 5]);
  });

  it('closes the corners of a concave (L-shaped) outline', () => {
    const paths = buildRegionHighlightPaths(
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 2],
      ],
      100,
      5,
    );
    expect(paths).toHaveLength(1);
    const points = vertices(paths[0]!.d);
    // Inner corner of the L: the vertical run ends exactly where the
    // horizontal run starts, at (95, 205).
    expect(points).toContainEqual([95, 205]);
    expect(
      points.filter(([x, y]) => x === 95 && y === 205),
    ).toHaveLength(1);
  });

  it('emits one loop per boundary (a hole becomes its own loop)', () => {
    const ring: Array<[number, number]> = [
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ];
    const paths = buildRegionHighlightPaths(ring, 100, 5);
    expect(paths).toHaveLength(2);
    // The inner loop hugs the hole from the inside.
    expect(paths.map((path) => path.d).some((d) => d.includes('M 205 95'))).toBe(true);
  });

  it('clamps an over-large inset so the shape never inverts', () => {
    for (const path of buildRegionHighlightPaths([[0, 0]], 100, 500)) {
      expect(path.vertices).toBe(4);
      for (const [x, y] of vertices(path.d)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
  });

  it('returns nothing for an empty region', () => {
    expect(buildRegionHighlightPaths([], 100, 4)).toEqual([]);
  });

  it('accepts a zero inset (degenerate but valid)', () => {
    const [path] = buildRegionHighlightPaths([[0, 0]], 100, 0);
    expect(path?.d).toBe('M 0 0 L 100 0 L 100 100 L 0 100 Z');
  });
});
