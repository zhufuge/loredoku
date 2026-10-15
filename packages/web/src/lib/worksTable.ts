import type { WorkSummary } from '@murdoku/shared';

/**
 * OPT-905 (docs/v0.3.4.md §5.3): the works table filter / sort / page model.
 * Kept as pure functions so the table behaviour is unit-testable without a
 * DOM (this repo has no jsdom).
 */
export const WORKS_PAGE_SIZE_DEFAULT = 20;
export const WORKS_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export interface WorksFilters {
  /** §5.3 按地图筛选（下拉多选）— empty means "all maps". */
  projectIds: number[];
  /** §5.3 关键词搜索（作品编号 / 备注 / 地图名）. */
  keyword: string;
  /** §5.3 按时间范围筛选 — inclusive `YYYY-MM-DD` bounds, `null` = open. */
  from: string | null;
  to: string | null;
}

export const EMPTY_WORKS_FILTERS: WorksFilters = {
  projectIds: [],
  keyword: '',
  from: null,
  to: null,
};

/** §5.3 默认排序：按发布时间倒序（最新在前）. */
export function sortWorksNewestFirst(works: WorkSummary[]): WorkSummary[] {
  return [...works].sort((a, b) => {
    const diff = b.publishedAt.localeCompare(a.publishedAt);
    if (diff !== 0) return diff;
    // Stable tie-break so the table doesn't jump between renders.
    return b.versionNo - a.versionNo;
  });
}

function matchesKeyword(work: WorkSummary, keyword: string): boolean {
  if (!keyword) return true;
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  return (
    `v${work.versionNo}`.toLowerCase().includes(needle) ||
    String(work.versionNo) === needle ||
    work.projectName.toLowerCase().includes(needle) ||
    (work.notes ?? '').toLowerCase().includes(needle)
  );
}

function matchesTimeRange(work: WorkSummary, from: string | null, to: string | null): boolean {
  const published = new Date(work.publishedAt).getTime();
  if (Number.isNaN(published)) return true;
  if (from) {
    const start = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(start) && published < start) return false;
  }
  if (to) {
    // Inclusive of the whole `to` day.
    const end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && published > end) return false;
  }
  return true;
}

export function filterWorks(works: WorkSummary[], filters: WorksFilters): WorkSummary[] {
  const projectFilter = new Set(filters.projectIds);
  return works.filter((work) => {
    if (projectFilter.size > 0 && !projectFilter.has(work.projectId)) return false;
    if (!matchesKeyword(work, filters.keyword)) return false;
    return matchesTimeRange(work, filters.from, filters.to);
  });
}

export interface WorksPageResult {
  rows: WorkSummary[];
  /** Clamped page number actually used. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** §5.3 分页：默认每页 20 条，支持切换每页条数. */
export function paginateWorks(
  works: WorkSummary[],
  page: number,
  pageSize: number,
): WorksPageResult {
  const size = Math.max(1, Math.floor(pageSize) || WORKS_PAGE_SIZE_DEFAULT);
  const total = works.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    rows: works.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
  };
}

/** §5.3 — sorting + filtering + paging in one pass. */
export function buildWorksTable(
  works: WorkSummary[],
  filters: WorksFilters,
  page: number,
  pageSize: number,
): WorksPageResult {
  return paginateWorks(filterWorks(sortWorksNewestFirst(works), filters), page, pageSize);
}

/** Distinct maps present in the work list, ordered by name (for the filter). */
export function collectWorkProjects(
  works: WorkSummary[],
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const work of works) {
    if (!byId.has(work.projectId)) byId.set(work.projectId, work.projectName);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
