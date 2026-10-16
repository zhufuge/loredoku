import { describe, expect, it } from 'vitest';
import type { WorkSummary } from '@loredoku/shared';
import {
  buildWorksTable,
  collectWorkProjects,
  EMPTY_WORKS_FILTERS,
  filterWorks,
  paginateWorks,
  sortWorksNewestFirst,
  WORKS_PAGE_SIZE_DEFAULT,
} from './worksTable';

function work(overrides: Partial<WorkSummary> = {}): WorkSummary {
  return {
    id: 1,
    versionNo: 1,
    gridSize: 6,
    notes: null,
    publishedAt: '2026-01-01T00:00:00.000Z',
    participantCount: 1,
    regionCount: 0,
    itemCount: 0,
    projectId: 1,
    projectName: '地图一',
    deployed: false,
    ...overrides,
  };
}

const works: WorkSummary[] = [
  work({ id: 11, versionNo: 1, projectId: 1, projectName: '地图一', publishedAt: '2026-01-01T08:00:00.000Z', notes: '初版' }),
  work({ id: 12, versionNo: 2, projectId: 1, projectName: '地图一', publishedAt: '2026-03-05T09:30:00.000Z', notes: '修了线索' }),
  work({ id: 21, versionNo: 1, projectId: 2, projectName: '地图二', publishedAt: '2026-02-10T12:00:00.000Z', notes: null }),
  work({ id: 22, versionNo: 3, projectId: 2, projectName: '地图二', publishedAt: '2026-03-05T09:30:00.000Z', notes: '第三版' }),
];

describe('sortWorksNewestFirst (OPT-905 §5.3)', () => {
  it('orders by publishedAt descending by default', () => {
    expect(sortWorksNewestFirst(works).map((entry) => entry.id)).toEqual([22, 12, 21, 11]);
  });

  it('breaks ties on the version number so the table stays stable', () => {
    const tied = [
      work({ id: 1, versionNo: 1, publishedAt: '2026-03-05T09:30:00.000Z' }),
      work({ id: 2, versionNo: 9, publishedAt: '2026-03-05T09:30:00.000Z' }),
    ];
    expect(sortWorksNewestFirst(tied).map((entry) => entry.versionNo)).toEqual([9, 1]);
  });

  it('does not mutate the input', () => {
    const input = [...works];
    sortWorksNewestFirst(input);
    expect(input.map((entry) => entry.id)).toEqual([11, 12, 21, 22]);
  });
});

describe('filterWorks (OPT-905 §5.3)', () => {
  it('returns everything for empty filters', () => {
    expect(filterWorks(works, EMPTY_WORKS_FILTERS)).toHaveLength(4);
  });

  it('filters by one or several maps (multi-select)', () => {
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, projectIds: [2] }).map((entry) => entry.id),
    ).toEqual([21, 22]);
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, projectIds: [1, 2] }),
    ).toHaveLength(4);
    expect(filterWorks(works, { ...EMPTY_WORKS_FILTERS, projectIds: [99] })).toHaveLength(0);
  });

  it('searches the work number, the notes and the map name', () => {
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, keyword: 'v3' }).map((entry) => entry.id),
    ).toEqual([22]);
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, keyword: '线索' }).map((entry) => entry.id),
    ).toEqual([12]);
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, keyword: '地图二' }).map((entry) => entry.id),
    ).toEqual([21, 22]);
  });

  it('applies the time range inclusively on both ends', () => {
    const filtered = filterWorks(works, {
      ...EMPTY_WORKS_FILTERS,
      from: '2026-02-01',
      to: '2026-03-05',
    });
    // `filterWorks` keeps the incoming order; sorting is a separate concern.
    expect(filtered.map((entry) => entry.id).sort()).toEqual([12, 21, 22]);
    // A single day still matches items published during that day.
    expect(
      filterWorks(works, { ...EMPTY_WORKS_FILTERS, from: '2026-03-05', to: '2026-03-05' }),
    ).toHaveLength(2);
  });

  it('combines the map, keyword and time filters', () => {
    const filtered = filterWorks(works, {
      projectIds: [1],
      keyword: 'v2',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    expect(filtered.map((entry) => entry.id)).toEqual([12]);
  });
});

describe('paginateWorks (OPT-905 §5.3)', () => {
  const many = Array.from({ length: 45 }, (_, index) =>
    work({ id: index + 1, versionNo: index + 1, publishedAt: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z` }),
  );

  it('defaults to 20 rows per page', () => {
    expect(WORKS_PAGE_SIZE_DEFAULT).toBe(20);
    const result = paginateWorks(many, 1, WORKS_PAGE_SIZE_DEFAULT);
    expect(result.rows).toHaveLength(20);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
  });

  it('supports switching the page size', () => {
    const result = paginateWorks(many, 1, 50);
    expect(result.rows).toHaveLength(45);
    expect(result.totalPages).toBe(1);
  });

  it('returns the requested slice', () => {
    const result = paginateWorks(many, 3, 20);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]!.id).toBe(41);
  });

  it('clamps out-of-range pages instead of returning nothing', () => {
    expect(paginateWorks(many, 99, 20).page).toBe(3);
    expect(paginateWorks(many, 0, 20).page).toBe(1);
    expect(paginateWorks([], 5, 20)).toMatchObject({ page: 1, totalPages: 1, rows: [] });
  });
});

describe('buildWorksTable (OPT-905 §5.2/§5.3)', () => {
  it('sorts, filters and pages in one pass', () => {
    const result = buildWorksTable(works, { ...EMPTY_WORKS_FILTERS, projectIds: [2] }, 1, 20);
    expect(result.rows.map((entry) => entry.id)).toEqual([22, 21]);
    expect(result.total).toBe(2);
  });

  it('reports an empty result for filters that match nothing', () => {
    const result = buildWorksTable(works, { ...EMPTY_WORKS_FILTERS, keyword: '不存在' }, 1, 20);
    expect(result.rows).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});

describe('collectWorkProjects (OPT-905 §5.3 map filter)', () => {
  it('lists each map once, ordered by name', () => {
    expect(collectWorkProjects(works)).toEqual([
      { id: 2, name: '地图二' },
      { id: 1, name: '地图一' },
    ]);
  });

  it('returns an empty list when there are no works', () => {
    expect(collectWorkProjects([])).toEqual([]);
  });
});
