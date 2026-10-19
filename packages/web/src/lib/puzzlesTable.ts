import type { PuzzleSummary } from '@loredoku/shared';

/**
 * SPEC-K02 (docs/v0.5.0.md §2.3): the puzzle table's filter / sort / page
 * model — the old `worksTable` logic, unchanged, reading `PuzzleSummary`.
 * Kept as pure functions so the table behaviour is unit-testable without a
 * DOM (this repo has no jsdom).
 */
export const PUZZLES_PAGE_SIZE_DEFAULT = 20;
export const PUZZLES_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export interface PuzzleFilters {
  /** 按地图筛选（下拉多选）— empty means "all maps". */
  mapIds: number[];
  /** 关键词搜索（谜题名 / 版本号 / 描述 / 地图名）. */
  keyword: string;
  /** 按时间范围筛选 — inclusive `YYYY-MM-DD` bounds, `null` = open. */
  from: string | null;
  to: string | null;
}

export const EMPTY_PUZZLE_FILTERS: PuzzleFilters = {
  mapIds: [],
  keyword: '',
  from: null,
  to: null,
};

/**
 * 默认排序：按发布时间倒序（最新在前）。The 发布时间 column reads the puzzle's
 * `created_at` (Q5: the header wording is deliberately unchanged).
 */
export function sortPuzzlesNewestFirst(puzzles: PuzzleSummary[]): PuzzleSummary[] {
  return [...puzzles].sort((a, b) => {
    const diff = b.createdAt.localeCompare(a.createdAt);
    if (diff !== 0) return diff;
    // Stable tie-break so the table doesn't jump between renders.
    return b.mapVersionNo - a.mapVersionNo;
  });
}

function matchesKeyword(puzzle: PuzzleSummary, keyword: string): boolean {
  if (!keyword) return true;
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  return (
    `v${puzzle.mapVersionNo}`.toLowerCase().includes(needle) ||
    String(puzzle.mapVersionNo) === needle ||
    puzzle.name.toLowerCase().includes(needle) ||
    puzzle.mapName.toLowerCase().includes(needle) ||
    (puzzle.description ?? '').toLowerCase().includes(needle)
  );
}

function matchesTimeRange(puzzle: PuzzleSummary, from: string | null, to: string | null): boolean {
  const created = new Date(puzzle.createdAt).getTime();
  if (Number.isNaN(created)) return true;
  if (from) {
    const start = new Date(`${from}T00:00:00`).getTime();
    if (!Number.isNaN(start) && created < start) return false;
  }
  if (to) {
    // Inclusive of the whole `to` day.
    const end = new Date(`${to}T23:59:59.999`).getTime();
    if (!Number.isNaN(end) && created > end) return false;
  }
  return true;
}

export function filterPuzzles(puzzles: PuzzleSummary[], filters: PuzzleFilters): PuzzleSummary[] {
  const mapFilter = new Set(filters.mapIds);
  return puzzles.filter((puzzle) => {
    if (mapFilter.size > 0 && !mapFilter.has(puzzle.mapId)) return false;
    if (!matchesKeyword(puzzle, filters.keyword)) return false;
    return matchesTimeRange(puzzle, filters.from, filters.to);
  });
}

export interface PuzzlesPageResult {
  rows: PuzzleSummary[];
  /** Clamped page number actually used. */
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** 分页：默认每页 20 条，支持切换每页条数. */
export function paginatePuzzles(
  puzzles: PuzzleSummary[],
  page: number,
  pageSize: number,
): PuzzlesPageResult {
  const size = Math.max(1, Math.floor(pageSize) || PUZZLES_PAGE_SIZE_DEFAULT);
  const total = puzzles.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    rows: puzzles.slice(start, start + size),
    page: safePage,
    pageSize: size,
    total,
    totalPages,
  };
}

/** Sorting + filtering + paging in one pass. */
export function buildPuzzlesTable(
  puzzles: PuzzleSummary[],
  filters: PuzzleFilters,
  page: number,
  pageSize: number,
): PuzzlesPageResult {
  return paginatePuzzles(filterPuzzles(sortPuzzlesNewestFirst(puzzles), filters), page, pageSize);
}

/** Distinct maps present in the puzzle list, ordered by name (for the filter). */
export function collectPuzzleMaps(
  puzzles: PuzzleSummary[],
): Array<{ id: number; name: string }> {
  const byId = new Map<number, string>();
  for (const puzzle of puzzles) {
    if (!byId.has(puzzle.mapId)) byId.set(puzzle.mapId, puzzle.mapName);
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}
