import { BORDER_WIDTH, MAX_CELL_SIZE, MIN_CELL_SIZE } from '@murdoku/shared';

/**
 * OPT-A01 (docs/v0.3.5.md §1.1): the board fills the editor's available area.
 *
 * ```
 * cellByW = (availableW - (gridSize-1) * borderGap) / gridSize
 * cellByH = (availableH - (gridSize-1) * borderGap) / gridSize
 * idealCell = min(cellByW, cellByH)
 * finalCell = clamp(idealCell, 90, 240)
 * ```
 *
 * `borderGap` is the shared Border width between adjacent cells (2px) — see
 * OPT-A04. When the ideal cell would fall below the minimum the board
 * overflows and the editor scrolls (i.e. panning); when it would exceed the
 * maximum the board is centred with whitespace instead of stretching.
 */
export interface CellSizeInput {
  availableWidth: number;
  availableHeight: number;
  gridSize: number;
  /** Shared border width between neighbours; defaults to the Border width. */
  gap?: number;
  min?: number;
  max?: number;
}

export function computeCellSize(input: CellSizeInput): number {
  const {
    availableWidth,
    availableHeight,
    gridSize,
    gap = BORDER_WIDTH,
    min = MIN_CELL_SIZE,
    max = MAX_CELL_SIZE,
  } = input;
  if (!Number.isFinite(gridSize) || gridSize < 1) return min;

  const share = (available: number): number => (available - (gridSize - 1) * gap) / gridSize;
  const ideal = Math.min(share(availableWidth), share(availableHeight));
  if (!Number.isFinite(ideal)) return min;
  return Math.round(Math.min(max, Math.max(min, ideal)));
}

/**
 * OPT-A01 §1.1/§1.2: how much room the board gets. The editor insets its
 * viewport by `padding` on every side before the cell size is derived.
 */
export function computeCellSizeForViewport(input: {
  width: number;
  height: number;
  gridSize: number;
  padding: number;
  gap?: number;
  min?: number;
  max?: number;
}): number {
  return computeCellSize({
    ...input,
    availableWidth: input.width - input.padding * 2,
    availableHeight: input.height - input.padding * 2,
  });
}

/**
 * OPT-A01 §1.3: the rendered width is `cellSize × zoom`, and zoom stays in
 * the 25%–400% range (see `clampZoom`).
 */
export function renderedCellSize(cellSize: number, zoom: number): number {
  return cellSize * zoom;
}
