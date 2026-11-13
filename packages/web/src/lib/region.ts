import type { DraftRegion } from '@loredoku/shared';

export type Coord = [number, number];

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function regionCellSet(region: DraftRegion): Set<string> {
  return new Set(region.cells.map(([x, y]) => coordKey(x, y)));
}

/**
 * v0.7.0: 区域自由笔刷这一笔是「添加」还是「清除」。
 *
 * 矩形模式退役后，纠正单个错格不能再靠「再点一次取消」——规则改成看**起点
 * 格**：起点格已在选区里，整笔就是清除；`Alt` 永远强制清除。一笔之内方向固
 * 定，不会出现画到一半反过来把刚抹上的又擦掉。
 */
export function brushStrokeErases(startSelected: boolean, alt: boolean): boolean {
  return alt || startSelected;
}

export interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * FIX-E02 (docs/v0.3.9.md §2): the region highlight must be a **continuous**
 * outline — the v0.3.7/v0.3.8 implementation drew one independently inset
 * segment per cell edge, which left a `2 × inset` gap at every cell boundary
 * along a straight run and a gap at every concave corner.
 *
 * This builds the region's boundary as closed rectilinear loops and offsets
 * each loop **inward by `inset`** in one shot:
 *
 * 1. every cell edge that is not shared with another region cell becomes a
 *    **directed** edge (travel direction chosen so the region interior is on
 *    the right — a clockwise loop in screen coordinates);
 * 2. the directed edges are chained into loops;
 * 3. each edge's supporting line is shifted inward by `inset` along its own
 *    inward normal, and the new vertices are the intersections of consecutive
 *    shifted lines.
 *
 * Because consecutive edges of a rectilinear loop are perpendicular, the
 * shifted lines always intersect in exactly one point, so the offset outline is
 * gap-free and every corner closes. `d` is capped at `size / 2` so a one-cell
 * region can never invert.
 */
export interface RegionHighlightPath {
  /** SVG path data — a closed rectilinear loop, already inset. */
  d: string;
  /** Number of vertices in the loop (4 for a single cell). */
  vertices: number;
}

/** Rounds to 2 decimals and normalises `-0`. */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

interface BoundaryEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Inward normal — one of (±1, 0) / (0, ±1). */
  nx: number;
  ny: number;
  dx: number;
  dy: number;
}

const DIR_ORDER: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

/**
 * Ranks a candidate direction by how tightly it turns **right** relative to the
 * incoming direction. A boundary that touches itself at a single point (a
 * "pinch") has two outgoing edges at that vertex; always taking the tightest
 * right turn keeps the interior on the right, which is what separates the
 * loops correctly.
 */
function turnRank(dir: [number, number], candidate: [number, number]): number {
  const [dx, dy] = dir;
  const right: [number, number] = [-dy, dx];
  const left: [number, number] = [dy, -dx];
  const back: [number, number] = [-dx, -dy];
  const key = (value: [number, number]): string => `${value[0]},${value[1]}`;
  const table = [key(right), key(dir), key(left), key(back)];
  const rank = table.indexOf(key(candidate));
  return rank === -1 ? table.length : rank;
}

export function buildRegionHighlightPaths(
  cells: Coord[],
  size: number,
  inset: number,
): RegionHighlightPath[] {
  if (cells.length === 0 || !Number.isFinite(size) || size <= 0) return [];
  const d = Math.max(0, Math.min(Number.isFinite(inset) ? inset : 0, size / 2 - 0.5));

  const set = new Set(cells.map(([x, y]) => coordKey(x, y)));
  const has = (x: number, y: number): boolean => set.has(coordKey(x, y));

  // 1. Directed boundary edges, interior on the right (clockwise loop).
  const edges: BoundaryEdge[] = [];
  for (const [x, y] of cells) {
    const px = x * size;
    const py = y * size;
    const right = px + size;
    const bottom = py + size;
    if (!has(x, y - 1)) {
      edges.push({ x1: px, y1: py, x2: right, y2: py, nx: 0, ny: 1, dx: 1, dy: 0 });
    }
    if (!has(x + 1, y)) {
      edges.push({ x1: right, y1: py, x2: right, y2: bottom, nx: -1, ny: 0, dx: 0, dy: 1 });
    }
    if (!has(x, y + 1)) {
      edges.push({ x1: right, y1: bottom, x2: px, y2: bottom, nx: 0, ny: -1, dx: -1, dy: 0 });
    }
    if (!has(x - 1, y)) {
      edges.push({ x1: px, y1: bottom, x2: px, y2: py, nx: 1, ny: 0, dx: 0, dy: -1 });
    }
  }
  if (edges.length === 0) return [];

  // 2. Chain the directed edges into loops.
  const startsAt = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = coordKey(edge.x1, edge.y1);
    const bucket = startsAt.get(key);
    if (bucket) bucket.push(index);
    else startsAt.set(key, [index]);
  });

  const used = new Array<boolean>(edges.length).fill(false);
  const paths: RegionHighlightPath[] = [];

  for (let seed = 0; seed < edges.length; seed += 1) {
    if (used[seed]) continue;
    const loop: number[] = [];
    let current = seed;
    // A region boundary always closes; the guard is only a safety net.
    for (let guard = 0; guard <= edges.length; guard += 1) {
      used[current] = true;
      loop.push(current);
      const edge = edges[current]!;
      const candidates = (startsAt.get(coordKey(edge.x2, edge.y2)) ?? []).filter(
        (index) => !used[index],
      );
      if (candidates.length === 0) break;
      const next = candidates.reduce((best, index) => {
        const a = edges[index]!;
        const b = edges[best]!;
        return turnRank([edge.dx, edge.dy], [a.dx, a.dy]) <
          turnRank([edge.dx, edge.dy], [b.dx, b.dy])
          ? index
          : best;
      }, candidates[0]!);
      current = next;
    }
    if (loop.length < 4) continue;

    // 3. Offset each supporting line inward and rebuild the vertices.
    //
    //    A vertex is the shared corner of two consecutive edges. Each edge that
    //    is perpendicular to an axis fixes that axis (its offset line); when
    //    the two edges are **collinear** — a straight run across a cell border
    //    — neither offsets the varying axis, so the vertex keeps its original
    //    coordinate there and the run simply stays straight.
    const points: Array<[number, number]> = [];
    for (let index = 0; index < loop.length; index += 1) {
      const previous = edges[loop[(index - 1 + loop.length) % loop.length]!]!;
      const edge = edges[loop[index]!]!;
      const sharedX = edge.x1;
      const sharedY = edge.y1;
      const sourceX = previous.nx !== 0 ? previous : edge.nx !== 0 ? edge : null;
      const sourceY = previous.ny !== 0 ? previous : edge.ny !== 0 ? edge : null;
      points.push([
        round2(sourceX ? sourceX.x1 + sourceX.nx * d : sharedX),
        round2(sourceY ? sourceY.y1 + sourceY.ny * d : sharedY),
      ]);
    }

    const d0 = points
      .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`)
      .join(' ');
    paths.push({ d: `${d0} Z`, vertices: points.length });
  }

  return paths;
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
 *
 * v0.10.7: if `defaultLabelCell` is provided, it takes precedence — this lets
 * authors pin the title to a specific cell after adding a region, instead of
 * always falling back to the computed bottom-row median.
 */
export function computeLabelCell(
  cells: Coord[],
  defaultLabelCell?: Coord | null,
): Coord | null {
  if (cells.length === 0) return null;
  if (defaultLabelCell) return defaultLabelCell;
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

