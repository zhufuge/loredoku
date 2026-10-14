import { CELL_SIZE } from '@murdoku/shared';
import type { CellCoord, RegionData } from '@murdoku/shared';

export function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function rectCells(a: CellCoord, b: CellCoord): CellCoord[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  const cells: CellCoord[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function regionCellSet(region: RegionData): Set<string> {
  return new Set(region.cells.map((cell) => coordKey(cell.x, cell.y)));
}

export function buildRegionEdges(
  cells: CellCoord[],
  size: number = CELL_SIZE,
): Array<[number, number, number, number]> {
  const set = new Set(cells.map((cell) => coordKey(cell.x, cell.y)));
  const has = (x: number, y: number): boolean => set.has(coordKey(x, y));
  const lines: Array<[number, number, number, number]> = [];
  for (const { x, y } of cells) {
    const left = x * size;
    const top = y * size;
    const right = left + size;
    const bottom = top + size;
    if (!has(x, y - 1)) lines.push([left, top, right, top]);
    if (!has(x, y + 1)) lines.push([left, bottom, right, bottom]);
    if (!has(x - 1, y)) lines.push([left, top, left, bottom]);
    if (!has(x + 1, y)) lines.push([right, top, right, bottom]);
  }
  return lines;
}

export function findConflicts(
  cells: CellCoord[],
  regions: RegionData[],
  excludeRegionId?: number,
): CellCoord[] {
  const owner = new Map<string, number>();
  for (const region of regions) {
    if (region.id === excludeRegionId) continue;
    for (const cell of region.cells) owner.set(coordKey(cell.x, cell.y), region.id);
  }
  return cells.filter((cell) => owner.has(coordKey(cell.x, cell.y)));
}

export function regionAt(
  regions: RegionData[],
  coord: CellCoord,
): RegionData | undefined {
  const key = coordKey(coord.x, coord.y);
  return regions.find((region) => region.cells.some((cell) => coordKey(cell.x, cell.y) === key));
}
