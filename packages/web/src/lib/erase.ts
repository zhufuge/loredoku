import type { DraftCell } from '@loredoku/shared';
import { cellKey, type CellMap } from './hitTest';

export type EraseLayer = 'object' | 'background';

export interface EraseTarget {
  layer: EraseLayer;
  /** Key of the cell to mutate — the anchor cell for multi-cell objects. */
  key: string;
  x: number;
  y: number;
}

/**
 * Eraser resolution order: object layer → background layer (top-most visual
 * layer first). `activeLayer` is deliberately ignored.
 *
 * CLAR-603: participants no longer occupy cells, so there is no character
 * layer to clear.
 */
export function resolveEraseTarget(
  cells: CellMap,
  x: number,
  y: number,
): EraseTarget | null {
  const key = cellKey(x, y);

  const cell = cells.get(key);
  if (cell?.object) return { layer: 'object', key, x, y };

  // Inside a multi-cell footprint but not the anchor cell.
  for (const [anchorKey, candidate] of cells.entries()) {
    const anchor = candidate.object;
    if (!anchor) continue;
    const [ax, ay] = anchorKey.split(',').map(Number) as [number, number];
    if (x >= ax && y >= ay && x < ax + anchor.w && y < ay + anchor.h) {
      return { layer: 'object', key: anchorKey, x: ax, y: ay };
    }
  }

  if (cell?.background) return { layer: 'background', key, x, y };
  return null;
}

/** Cells that belong to an object anchor's footprint, including empty placeholders. */
export function objectFootprintKeys(anchor: { w: number; h: number }, x: number, y: number): string[] {
  const keys: string[] = [];
  for (let dy = 0; dy < anchor.h; dy += 1) {
    for (let dx = 0; dx < anchor.w; dx += 1) {
      keys.push(cellKey(x + dx, y + dy));
    }
  }
  return keys;
}

export function isEmptyCell(cell: DraftCell | undefined): boolean {
  if (!cell) return true;
  return !cell.background && !cell.object && !cell.objectRef;
}
