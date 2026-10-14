import type { DraftCell } from '@murdoku/shared';
import type { Selection } from '@/stores/editorStore';

export type CellMap = Map<string, DraftCell>;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Selections the canvas can produce from a cell click. */
export type CellSelection = Extract<Selection, { type: 'cell' }>;

/**
 * Resolves the anchor cell of the object covering `(x, y)`.
 * Multi-cell objects only store their anchor at the origin cell, covered cells
 * are plain placeholders, so any of them must hit-test back to the anchor.
 */
export function resolveObjectAnchor(cells: CellMap, x: number, y: number): [number, number] | null {
  for (const [key, cell] of cells.entries()) {
    const anchor = cell.object;
    if (!anchor) continue;
    const [ax, ay] = key.split(',').map(Number) as [number, number];
    if (x >= ax && y >= ay && x < ax + anchor.w && y < ay + anchor.h) return [ax, ay];
  }
  return null;
}

export interface HitTestInput {
  x: number;
  y: number;
  gridSize: number;
  cells: CellMap;
}

/**
 * CLAR-603: characters no longer occupy cells, so the click hit-test only
 * returns the cell itself (or its object anchor).
 */
export function hitTestCell({ x, y, gridSize, cells }: HitTestInput): CellSelection | null {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return null;

  const anchor = resolveObjectAnchor(cells, x, y);
  if (anchor) return { type: 'cell', x: anchor[0], y: anchor[1] };

  return { type: 'cell', x, y };
}
