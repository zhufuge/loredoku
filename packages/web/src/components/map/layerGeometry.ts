import type { CSSProperties } from 'react';

/**
 * Shared geometry for the map layer components (v0.5.6: split out of the old
 * `MapLayers.tsx`). Pixel rect for a cell — or a `w × h` footprint anchored at
 * `x, y`.
 */
export function cellRectStyle(
  x: number,
  y: number,
  cellSize: number,
  w = 1,
  h = 1,
): CSSProperties {
  return {
    left: x * cellSize,
    top: y * cellSize,
    width: w * cellSize,
    height: h * cellSize,
  };
}

/** `"x,y"` cell key → `[x, y]`. */
export function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}
