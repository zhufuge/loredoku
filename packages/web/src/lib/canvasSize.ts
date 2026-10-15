import {
  BORDER_WIDTH,
  BOTTOM_BAR_RESERVE,
  CANVAS_PADDING,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  RULER_SIZE,
} from '@murdoku/shared';

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
 * OPT-A01 §1.3: the rendered width is `cellSize × zoom`, and zoom stays in
 * the 25%–400% range (see `clampZoom`).
 */
export function renderedCellSize(cellSize: number, zoom: number): number {
  return cellSize * zoom;
}

// ---- OPT-B02 §2.2: asymmetric viewport insets ----

export interface CanvasInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * OPT-B02 (docs/v0.3.6.md §2.2). The v0.3.5 pass used one symmetric padding,
 * which let the bottom toolbar cover the board. The inset is now per side:
 *
 * ```
 * availableH = 编辑器高度 - 底部工具条留白 72px - 顶部标尺 28px - 内边距 32px
 * ```
 */
export function canvasInsets(options: {
  /** Ruler strips sit inside the viewport along the top / left edges. */
  showRulers?: boolean;
  /** The editor's floating bottom toolbar reserves space under the board. */
  showBottomBar?: boolean;
  padding?: number;
} = {}): CanvasInsets {
  const { showRulers = false, showBottomBar = false, padding = CANVAS_PADDING } = options;
  const ruler = showRulers ? RULER_SIZE : 0;
  return {
    top: ruler + padding,
    right: padding,
    bottom: (showBottomBar ? BOTTOM_BAR_RESERVE : 0) + padding,
    left: ruler + padding,
  };
}

/** The area actually available to the board once the insets are removed. */
export function availableBox(
  rect: { width: number; height: number },
  insets: CanvasInsets,
): { width: number; height: number } {
  return {
    width: Math.max(0, rect.width - insets.left - insets.right),
    height: Math.max(0, rect.height - insets.top - insets.bottom),
  };
}

/** OPT-B02 §2.2 — the adaptive pass over the inset content area. */
export function computeCellSizeForInsets(input: {
  width: number;
  height: number;
  gridSize: number;
  insets: CanvasInsets;
  gap?: number;
  min?: number;
  max?: number;
}): number {
  const box = availableBox(input, input.insets);
  return computeCellSize({ ...input, availableWidth: box.width, availableHeight: box.height });
}

/**
 * Centres the board inside the inset content area (not the raw viewport), so
 * the reserved toolbar / ruler bands stay empty.
 */
export function centeredPan(
  rect: { width: number; height: number },
  insets: CanvasInsets,
  gridSize: number,
  cellSize: number,
  zoom = 1,
): { x: number; y: number } {
  const box = availableBox(rect, insets);
  const board = gridSize * cellSize * zoom;
  return {
    x: Math.round(insets.left + (box.width - board) / 2),
    y: Math.round(insets.top + (box.height - board) / 2),
  };
}
