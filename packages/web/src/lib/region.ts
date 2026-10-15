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

export interface RegionPointerUpResult {
  toAdd: Coord[];
  toRemove: Coord[];
  /** Next click-anchor: set after a lone click, cleared once a rectangle is committed. */
  anchor: Coord | null;
}

/**
 * Resolve what a region-tool pointerup should do (see docs/v0.2.4.md FIX-302).
 *
 * - First click (no anchor, no movement): toggles the cell in and remembers it as
 *   an anchor so the next click forms a rectangle.
 * - Second click / drag: expands `[anchor..end]` and appends it. `Alt` removes.
 * - Double-click on the same cell removes it (toggle off).
 */
export function resolveRegionPointerUp(input: {
  anchor: Coord;
  end: Coord;
  moved: boolean;
  alt: boolean;
  anchored: boolean;
}): RegionPointerUpResult {
  const { anchor, end, moved, alt, anchored } = input;
  const same = anchor[0] === end[0] && anchor[1] === end[1];

  if (!anchored && !moved) {
    return alt
      ? { toAdd: [], toRemove: [anchor], anchor }
      : { toAdd: [anchor], toRemove: [], anchor };
  }

  if (anchored && !moved && same) {
    return { toAdd: [], toRemove: [anchor], anchor: null };
  }

  const rect = rectCells(anchor, end);
  return alt
    ? { toAdd: [], toRemove: rect, anchor: null }
    : { toAdd: rect, toRemove: [], anchor: null };
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

/**
 * FIX-C01 (docs/v0.3.7.md §1): the region **highlight** outline — the same
 * contour as {@link buildRegionEdges}, moved to the inside of the region
 * boundary and shrunk along the edge.
 *
 * Each edge is handled as two independent steps:
 *
 * - **normal** (the axis that is constant along the edge): shifted toward the
 *   region interior by `inset`, with **both ends taking the same value**;
 * - **tangential** (the axis that varies): shrunk by `inset` at **both** ends
 *   so neighbouring inset edges meet at the corners.
 *
 * The interior direction comes straight from the `has()` test that decided the
 * edge exists at all — there is no need to derive a normal vector, and the old
 * bug (shifting a constant axis on one end only, which gave every edge a slope
 * of `inset / 边长`) cannot recur. Unit tests assert `x1 === x2 || y1 === y2`
 * for every returned edge.
 */
export function buildRegionInnerEdges(cells: Coord[], size: number, inset: number): Edge[] {
  const d = Math.max(0, Math.min(inset, size / 2));
  const set = new Set(cells.map(([x, y]) => coordKey(x, y)));
  const has = (x: number, y: number): boolean => set.has(coordKey(x, y));
  const edges: Edge[] = [];
  for (const [x, y] of cells) {
    const px = x * size;
    const py = y * size;
    const far = px + size - d;
    const bottom = py + size - d;
    // 上边：法向 +y
    if (!has(x, y - 1)) edges.push({ x1: px + d, y1: py + d, x2: far, y2: py + d });
    // 下边：法向 -y
    if (!has(x, y + 1)) edges.push({ x1: px + d, y1: bottom, x2: far, y2: bottom });
    // 左边：法向 +x
    if (!has(x - 1, y)) edges.push({ x1: px + d, y1: py + d, x2: px + d, y2: bottom });
    // 右边：法向 -x
    if (!has(x + 1, y)) edges.push({ x1: far, y1: py + d, x2: far, y2: bottom });
  }
  return edges;
}

/**
 * OPT-A04 (docs/v0.3.5.md §3.3.2): the region outline is a **Border-type**
 * stroke drawn around the outer contour of the region's cells, wider than the
 * grid Border. `size` is the adaptive cell width (OPT-A01) and is required so
 * the outline can never silently drift from the renderer.
 */
export function buildRegionEdges(cells: Coord[], size: number): Edge[] {
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

