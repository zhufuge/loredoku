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
  const rows = Math.ceil(n / bestCols);
  const lastRowCount = n % bestCols === 0 ? bestCols : n % bestCols;
  const leadingOffset = lastRowCount === bestCols ? 0 : Math.floor((bestCols - lastRowCount) / 2);
  return {
    cols: bestCols,
    rows,
    total: n,
    lastRowCount,
    leadingOffset,
  };
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
