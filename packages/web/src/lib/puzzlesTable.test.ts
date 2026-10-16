import { describe, expect, it } from 'vitest';
import type { PuzzleSummary } from '@loredoku/shared';
import {
  buildPuzzlesTable,
  collectPuzzleMaps,
  EMPTY_PUZZLE_FILTERS,
  filterPuzzles,
  paginatePuzzles,
  PUZZLES_PAGE_SIZE_DEFAULT,
  sortPuzzlesNewestFirst,
} from './puzzlesTable';

/**
 * SPEC-K02 (docs/v0.5.0.md §2.3): the puzzle table keeps the old works-table
 * behaviour verbatim — only the values are the puzzle's now (版本 = the
 * **referenced map version**, 发布时间 = the puzzle's `created_at`).
 */
function puzzle(overrides: Partial<PuzzleSummary> = {}): PuzzleSummary {
  return {
    id: 1,
    name: '谜题一',
    description: null,
    mapVersionNo: 1,
    mapProjectId: 1,
    mapRootId: 1,
    mapName: '地图一',
    gridSize: 6,
    status: 'draft',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deployed: false,
    ...overrides,
  };
}

const puzzles: PuzzleSummary[] = [
  puzzle({ id: 11, mapVersionNo: 1, mapProjectId: 1, mapName: '地图一', createdAt: '2026-01-01T08:00:00.000Z', description: '初版' }),
  puzzle({ id: 12, mapVersionNo: 2, mapProjectId: 1, mapName: '地图一', createdAt: '2026-03-05T09:30:00.000Z', description: '修了线索' }),
  puzzle({ id: 21, mapVersionNo: 1, mapProjectId: 2, mapName: '地图二', createdAt: '2026-02-10T12:00:00.000Z', description: null }),
  puzzle({ id: 22, mapVersionNo: 3, mapProjectId: 2, mapName: '地图二', createdAt: '2026-03-05T09:30:00.000Z', description: '第三版' }),
];

describe('sortPuzzlesNewestFirst (SPEC-K02)', () => {
  it('orders by createdAt descending by default', () => {
    expect(sortPuzzlesNewestFirst(puzzles).map((entry) => entry.id)).toEqual([22, 12, 21, 11]);
  });

  it('breaks ties on the referenced version number so the table stays stable', () => {
    const tied = [
      puzzle({ id: 1, mapVersionNo: 1, createdAt: '2026-03-05T09:30:00.000Z' }),
      puzzle({ id: 2, mapVersionNo: 9, createdAt: '2026-03-05T09:30:00.000Z' }),
    ];
    expect(sortPuzzlesNewestFirst(tied).map((entry) => entry.mapVersionNo)).toEqual([9, 1]);
  });

  it('does not mutate the input', () => {
    const input = [...puzzles];
    sortPuzzlesNewestFirst(input);
    expect(input.map((entry) => entry.id)).toEqual([11, 12, 21, 22]);
  });
});

describe('filterPuzzles (SPEC-K02)', () => {
  it('returns everything for empty filters', () => {
    expect(filterPuzzles(puzzles, EMPTY_PUZZLE_FILTERS)).toHaveLength(4);
  });

  it('filters by one or several maps (multi-select)', () => {
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, mapProjectIds: [2] }).map((entry) => entry.id),
    ).toEqual([21, 22]);
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, mapProjectIds: [1, 2] }),
    ).toHaveLength(4);
    expect(filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, mapProjectIds: [99] })).toHaveLength(0);
  });

  it('searches the version number, the description and the map name', () => {
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, keyword: 'v3' }).map((entry) => entry.id),
    ).toEqual([22]);
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, keyword: '线索' }).map((entry) => entry.id),
    ).toEqual([12]);
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, keyword: '地图二' }).map((entry) => entry.id),
    ).toEqual([21, 22]);
  });

  it('searches the puzzle name too', () => {
    const named = [puzzle({ id: 7, name: '古堡疑云' }), puzzle({ id: 8, name: '花园谜案' })];
    expect(
      filterPuzzles(named, { ...EMPTY_PUZZLE_FILTERS, keyword: '古堡' }).map((entry) => entry.id),
    ).toEqual([7]);
  });

  it('applies the time range inclusively on both ends', () => {
    const filtered = filterPuzzles(puzzles, {
      ...EMPTY_PUZZLE_FILTERS,
      from: '2026-02-01',
      to: '2026-03-05',
    });
    expect(filtered.map((entry) => entry.id).sort()).toEqual([12, 21, 22]);
    expect(
      filterPuzzles(puzzles, { ...EMPTY_PUZZLE_FILTERS, from: '2026-03-05', to: '2026-03-05' }),
    ).toHaveLength(2);
  });

  it('combines the map, keyword and time filters', () => {
    const filtered = filterPuzzles(puzzles, {
      mapProjectIds: [1],
      keyword: 'v2',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(filtered.map((entry) => entry.id)).toEqual([12]);
  });
});

describe('paginatePuzzles (SPEC-K02)', () => {
  const many = Array.from({ length: 45 }, (_, index) =>
    puzzle({
      id: index + 1,
      mapVersionNo: index + 1,
      createdAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }),
  );

  it('defaults to 20 rows per page', () => {
    expect(PUZZLES_PAGE_SIZE_DEFAULT).toBe(20);
    const result = paginatePuzzles(many, 1, PUZZLES_PAGE_SIZE_DEFAULT);
    expect(result.rows).toHaveLength(20);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
  });

  it('supports switching the page size', () => {
    const result = paginatePuzzles(many, 1, 50);
    expect(result.rows).toHaveLength(45);
    expect(result.totalPages).toBe(1);
  });

  it('returns the requested slice', () => {
    const result = paginatePuzzles(many, 3, 20);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]!.id).toBe(41);
  });

  it('clamps out-of-range pages instead of returning nothing', () => {
    expect(paginatePuzzles(many, 99, 20).page).toBe(3);
    expect(paginatePuzzles(many, 0, 20).page).toBe(1);
    expect(paginatePuzzles([], 5, 20)).toMatchObject({ page: 1, totalPages: 1, rows: [] });
  });
});

describe('buildPuzzlesTable (SPEC-K02)', () => {
  it('sorts, filters and pages in one pass', () => {
    const result = buildPuzzlesTable(puzzles, { ...EMPTY_PUZZLE_FILTERS, mapProjectIds: [2] }, 1, 20);
    expect(result.rows.map((entry) => entry.id)).toEqual([22, 21]);
    expect(result.total).toBe(2);
  });

  it('reports an empty result for filters that match nothing', () => {
    const result = buildPuzzlesTable(puzzles, { ...EMPTY_PUZZLE_FILTERS, keyword: '不存在' }, 1, 20);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});

describe('collectPuzzleMaps (SPEC-K02 map filter)', () => {
  it('lists each map once, ordered by name', () => {
    expect(collectPuzzleMaps(puzzles)).toEqual([
      { id: 2, name: '地图二' },
      { id: 1, name: '地图一' },
    ]);
  });

  it('returns an empty list when there are no puzzles', () => {
    expect(collectPuzzleMaps([])).toEqual([]);
  });
});
