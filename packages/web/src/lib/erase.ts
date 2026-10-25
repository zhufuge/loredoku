import type { DraftCell } from '@loredoku/shared';
import { cellKey, type CellMap } from './hitTest';

export type EraseLayer = 'item' | 'background';

export interface EraseTarget {
  layer: EraseLayer;
  /** Key of the cell to mutate — the anchor cell for multi-cell objects. */
  key: string;
  x: number;
  y: number;
}

export interface ItemAnchorHit {
  /** Key of the anchor cell. */
  key: string;
  x: number;
  y: number;
  item: NonNullable<DraftCell['item']>;
}

/**
 * The item anchor covering `x, y`, whether the coordinate is the anchor itself
 * or a cell inside a multi-cell footprint.
 *
 * v0.7.5: the item's info box edits the anchor (`scale` / offsets), and the user
 * may well have selected a cell in the middle of a 3×3 footprint — the anchor is
 * the only cell that carries the item, so every edit has to resolve it first.
 */
export function findItemAnchor(
  cells: CellMap,
  x: number,
  y: number,
): ItemAnchorHit | null {
  const own = cells.get(cellKey(x, y))?.item;
  if (own) return { key: cellKey(x, y), x, y, item: own };

  for (const [anchorKey, candidate] of cells.entries()) {
    const anchor = candidate.item;
    if (!anchor) continue;
    const [ax, ay] = anchorKey.split(',').map(Number) as [number, number];
    if (x >= ax && y >= ay && x < ax + anchor.w && y < ay + anchor.h) {
      return { key: anchorKey, x: ax, y: ay, item: anchor };
    }
  }
  return null;
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

  const item = findItemAnchor(cells, x, y);
  if (item) return { layer: 'item', key: item.key, x: item.x, y: item.y };

  if (cells.get(key)?.background) return { layer: 'background', key, x, y };
  return null;
}

/** Cells that belong to an object anchor's footprint, including empty placeholders. */
export function itemFootprintKeys(anchor: { w: number; h: number }, x: number, y: number): string[] {
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
  return !cell.background && !cell.item && !cell.itemRef;
}
