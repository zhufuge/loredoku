/**
 * CLAR-602 (docs/v0.3.1.md §2.2): matrix layout for the participant panel.
 *
 * Given `n` slots, find the integer `cols ∈ [1, n]` minimising
 * `|cols / rows - 1 / φ|` where `rows = ceil(n / cols)` and
 * `φ ≈ 1.618`. Ties break toward the smaller `cols` (taller panel,
 * better fit for a left side column).
 *
 * The last row may be short; the spec asks for it to be centred rather
 * than left-aligned, so we expose `leadingOffset(count, cols, lastRowCount)`
 * returning how many leading empty cells the last row needs.
 */

export interface ParticipantLayout {
  /** Number of columns the matrix uses. */
  cols: number;
  /** Number of rows the matrix uses. */
  rows: number;
  /** Total slot count, kept for convenience. */
  total: number;
  /**
   * Number of cells the last row occupies. Equal to `total % cols` when not
   * zero, otherwise `cols` (i.e. the matrix is full).
   */
  lastRowCount: number;
  /**
   * Leading offset (in cells) to centre the last row when it is short.
   * Callers should render `leadingOffset` empty placeholders before the
   * actual last-row slots.
   */
  leadingOffset: number;
}

const GOLDEN_RATIO = 1.618;
const TARGET_ASPECT = 1 / GOLDEN_RATIO; // ≈ 0.618

/** Builds a layout for `n` slots forced into exactly `cols` columns. */
export function deriveLayout(n: number, cols: number): ParticipantLayout {
  if (!Number.isFinite(n) || n <= 0) {
    return { cols: 1, rows: 0, total: 0, lastRowCount: 0, leadingOffset: 0 };
  }
  const safeCols = Math.max(1, Math.min(n, Math.floor(cols) || 1));
  const rows = Math.ceil(n / safeCols);
  const lastRowCount = n % safeCols === 0 ? safeCols : n % safeCols;
  const leadingOffset = lastRowCount === safeCols ? 0 : Math.floor((safeCols - lastRowCount) / 2);
  return {
    cols: safeCols,
    rows,
    total: n,
    lastRowCount,
    leadingOffset,
  };
}

/**
 * MOD-803: the widest column count ≤ `maxCols` whose cells still fit into
 * `width` (`cols * cell + (cols - 1) * gap`). Falls back to 1 column — the
 * caller then scrolls vertically (spec §MOD-803 布局自适应).
 */
export function fitColumns(
  width: number,
  maxCols: number,
  cell: number,
  gap: number,
): number {
  const upper = Math.max(1, Math.floor(maxCols) || 1);
  for (let cols = upper; cols >= 1; cols -= 1) {
    const required = cols * cell + (cols - 1) * gap;
    if (required <= width) return cols;
  }
  return 1;
}

/**
 * Pick the column count minimising `|cols/rows - TARGET_ASPECT|`.
 * Iterates every `cols ∈ [1, n]`, ties broken by smaller `cols`.
 */
export function computeParticipantLayout(n: number): ParticipantLayout {
  if (!Number.isFinite(n) || n <= 0) {
    return { cols: 1, rows: 0, total: 0, lastRowCount: 0, leadingOffset: 0 };
  }
  let bestCols = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    const aspect = cols / rows;
    const delta = Math.abs(aspect - TARGET_ASPECT);
    // Strict `<` keeps the first (smaller cols) winner on ties.
    if (delta < bestDelta) {
      bestDelta = delta;
      bestCols = cols;
    }
  }
  return deriveLayout(n, bestCols);
}

/**
 * OPT-B06 (docs/v0.3.6.md §6.3): the sequence badge shown in a cell's
 * top-left corner. The number matches `characterSlots` order, which is the
 * row-major order {@link slotIndex} produces.
 */
export function participantSequence(index: number): number {
  return index + 1;
}

/**
 * OPT-B06 §6.3: the order the matrix renders slots in — top to bottom, then
 * left to right. Returns `[0 … n-1]`; the centred gap of a short last row is
 * skipped without disturbing the order.
 */
export function matrixOrder(layout: ParticipantLayout): number[] {
  const order: number[] = [];
  for (let row = 0; row < layout.rows; row += 1) {
    for (let col = 0; col < layout.cols; col += 1) {
      const index = slotIndex({ row, col }, layout);
      if (index !== null) order.push(index);
    }
  }
  return order;
}

/**
 * Maps a flat index (0..n-1) to a `{ row, col }` position inside the matrix.
 * The last row is centred, so its first cell sits at `col = leadingOffset`.
 */
export function slotPosition(
  index: number,
  layout: ParticipantLayout,
): { row: number; col: number } | null {
  if (index < 0 || index >= layout.total) return null;
  // Index of the first cell in the last row.
  const lastRowStart = (layout.rows - 1) * layout.cols;
  if (index >= lastRowStart) {
    return {
      row: layout.rows - 1,
      col: layout.leadingOffset + (index - lastRowStart),
    };
  }
  return {
    row: Math.floor(index / layout.cols),
    col: index % layout.cols,
  };
}

/**
 * Inverse of {@link slotPosition}: given `{ row, col }` (with col measured
 * from the matrix's left edge, before applying `leadingOffset`), return the
 * flat slot index. Returns `null` when the cell sits in the centred gap of
 * the last row or outside the matrix.
 */
export function slotIndex(
  position: { row: number; col: number },
  layout: ParticipantLayout,
): number | null {
  const { row, col } = position;
  if (row < 0 || row >= layout.rows) return null;
  if (col < 0 || col >= layout.cols) return null;
  const lastRowStart = (layout.rows - 1) * layout.cols;
  if (row === layout.rows - 1) {
    const adjustedCol = col - layout.leadingOffset;
    if (adjustedCol < 0 || adjustedCol >= layout.lastRowCount) return null;
    return lastRowStart + adjustedCol;
  }
  return row * layout.cols + col;
}
