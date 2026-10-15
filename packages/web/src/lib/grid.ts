import type { CellCoord } from '@murdoku/shared';

export const ZOOM_MIN = 0.25;
/** docs/v0.3.5.md §1.3: the zoom range stays 25% ~ 400%. */
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;
export const DRAG_THRESHOLD = 4;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(zoom.toFixed(3))));
}

export interface ViewTransform {
  rect: DOMRect;
  pan: { x: number; y: number };
  zoom: number;
  /**
   * OPT-A01: the adaptive cell width at 100% zoom. The rendered cell is
   * `cellSize × zoom` (§1.3).
   */
  cellSize: number;
}

export function clientToCell(clientX: number, clientY: number, view: ViewTransform): CellCoord {
  const scale = view.cellSize * view.zoom;
  return {
    x: Math.floor((clientX - view.rect.left - view.pan.x) / scale),
    y: Math.floor((clientY - view.rect.top - view.pan.y) / scale),
  };
}

export function isInBounds(coord: CellCoord, gridSize: number): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < gridSize && coord.y < gridSize;
}

export function boardSize(gridSize: number, cellSize: number, zoom = 1): number {
  return gridSize * cellSize * zoom;
}

export function centerPan(
  rect: { width: number; height: number },
  gridSize: number,
  cellSize: number,
  zoom = 1,
): { x: number; y: number } {
  const board = boardSize(gridSize, cellSize, zoom);
  return {
    x: Math.round((rect.width - board) / 2),
    y: Math.round((rect.height - board) / 2),
  };
}

export function zoomAtPoint(
  pointer: { x: number; y: number },
  rect: DOMRect,
  pan: { x: number; y: number },
  nextZoom: number,
  prevZoom: number,
): { x: number; y: number } {
  const localX = pointer.x - rect.left;
  const localY = pointer.y - rect.top;
  const ratio = nextZoom / prevZoom;
  return {
    x: localX - (localX - pan.x) * ratio,
    y: localY - (localY - pan.y) * ratio,
  };
}
