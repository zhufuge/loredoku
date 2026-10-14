import type { DraftCell, PlacedCharacter } from '@murdoku/shared';
import type { Selection } from '@/stores/editorStore';

export type CellMap = Map<string, DraftCell>;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Selections the canvas can produce from a cell click. */
export type CellSelection = Extract<Selection, { type: 'cell' } | { type: 'character' }>;

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
  placedCharacters: PlacedCharacter[];
}

/**
 * Top-most interactive content of a cell, used for click selection.
 * Characters win over items because they render above them.
 */
export function hitTestCell({
  x,
  y,
  gridSize,
  cells,
  placedCharacters,
}: HitTestInput): CellSelection | null {
  if (x < 0 || y < 0 || x >= gridSize || y >= gridSize) return null;

  const placed = placedCharacters.find((item) => item.x === x && item.y === y);
  if (placed) {
    return { type: 'character', characterId: placed.characterId, x, y };
  }

  const anchor = resolveObjectAnchor(cells, x, y);
  if (anchor) return { type: 'cell', x: anchor[0], y: anchor[1] };

  return { type: 'cell', x, y };
}
