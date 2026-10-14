import { CELL_SIZE } from '@murdoku/shared';
import type { DraftRegion } from '@murdoku/shared';

export type Coord = [number, number];

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function rectCells(a: Coord, b: Coord): Coord[] {
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  const cells: Coord[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push([x, y]);
    }
  }
  return cells;
}

export function regionCellSet(region: DraftRegion): Set<string> {
  return new Set(region.cells.map(([x, y]) => coordKey(x, y)));
}

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function buildRegionEdges(cells: Coord[], size = CELL_SIZE): Edge[] {
  const set = new Set(cells.map(([x, y]) => coordKey(x, y)));
  const has = (x: number, y: number): boolean => set.has(coordKey(x, y));
  const edges: Edge[] = [];
  for (const [x, y] of cells) {
    const px = x * size;
    const py = y * size;
    if (!has(x - 1, y)) edges.push({ x1: px, y1: py, x2: px, y2: py + size });
    if (!has(x + 1, y)) edges.push({ x1: px + size, y1: py, x2: px + size, y2: py + size });
    if (!has(x, y - 1)) edges.push({ x1: px, y1: py, x2: px + size, y2: py });
    if (!has(x, y + 1)) edges.push({ x1: px, y1: py + size, x2: px + size, y2: py + size });
  }
  return edges;
}

export function findOverlap(
  regions: DraftRegion[],
  candidate: { id: string; cells: Coord[] },
): Coord[] {
  const owned = new Set<string>();
  for (const region of regions) {
    if (region.id === candidate.id) continue;
    for (const [x, y] of region.cells) owned.add(coordKey(x, y));
  }
  return candidate.cells.filter(([x, y]) => owned.has(coordKey(x, y)));
}

export function regionAt(regions: DraftRegion[], x: number, y: number): DraftRegion | undefined {
  const key = coordKey(x, y);
  return regions.find((region) => region.cells.some(([cx, cy]) => coordKey(cx, cy) === key));
}

/**
 * 4-neighbour connectivity check: every cell must be reachable from any other.
 */
export function isConnected(cells: Coord[]): boolean {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map(([x, y]) => coordKey(x, y)));
  const [first] = cells;
  if (!first) return false;
  const queue: Coord[] = [first];
  const seen = new Set<string>([coordKey(first[0], first[1])]);
  while (queue.length > 0) {
    const [x, y] = queue.pop()!;
    const neighbors: Coord[] = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      const key = coordKey(nx, ny);
      if (set.has(key) && !seen.has(key)) {
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size === set.size;
}

/**
 * Label anchor (see docs/v0.2.1.md §2.1.3): bottom-most row, then the cell at
 * the median x of that row.
 */
export function computeLabelCell(cells: Coord[]): Coord | null {
  if (cells.length === 0) return null;
  const maxY = Math.max(...cells.map(([, y]) => y));
  const row = cells.filter(([, y]) => y === maxY).map(([x]) => x).sort((a, b) => a - b);
  const middle = row[Math.floor(row.length / 2)];
  if (middle === undefined) return null;
  return [middle, maxY];
}

export function contrastTextColor(hex: string): string {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((char) => char + char)
          .join('')
      : normalized;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#111827' : '#FFFFFF';
}

