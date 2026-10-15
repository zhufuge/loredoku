/**
 * MOD-801 (docs/v0.3.3.md §1.1.3): pure helpers behind the linkage dialog's
 * cell matrix picker. All operations return a new set so React state updates
 * stay immutable, and every branch can be unit tested without a DOM.
 */

export type CellSelection = Set<string>;

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function parseCellKey(key: string): [number, number] {
  const [x, y] = key.split(',').map(Number) as [number, number];
  return [x, y];
}

/** Sorted `[x, y]` tuples for a selection (stable output for assertions). */
export function selectionToCoords(selection: CellSelection): Array<[number, number]> {
  return [...selection]
    .map(parseCellKey)
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
}

/** Toggles one cell (free click). */
export function toggleCell(selected: CellSelection, x: number, y: number): CellSelection {
  const next = new Set(selected);
  const key = cellKey(x, y);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/** Adds every cell of row `y` (quick select, unions with the selection). */
export function selectRow(selected: CellSelection, y: number, gridSize: number): CellSelection {
  const next = new Set(selected);
  for (let x = 0; x < gridSize; x += 1) next.add(cellKey(x, y));
  return next;
}

/** Adds every cell of column `x` (quick select, unions with the selection). */
export function selectColumn(selected: CellSelection, x: number, gridSize: number): CellSelection {
  const next = new Set(selected);
  for (let y = 0; y < gridSize; y += 1) next.add(cellKey(x, y));
  return next;
}

/** Adds the rectangle between two corners (quick select, unions). */
export function selectRectangle(
  selected: CellSelection,
  a: [number, number],
  b: [number, number],
): CellSelection {
  const next = new Set(selected);
  const [x1, y1] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
  const [x2, y2] = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      next.add(cellKey(x, y));
    }
  }
  return next;
}

export function selectAllCells(gridSize: number): CellSelection {
  const next = new Set<string>();
  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      next.add(cellKey(x, y));
    }
  }
  return next;
}

export function clearCells(): CellSelection {
  return new Set<string>();
}

/**
 * Rectangle quick-select state machine: the first click stores the anchor,
 * the second click applies the rectangle and clears the anchor.
 * Returns the next selection plus the (possibly unchanged) anchor.
 */
export function applyRectClick(
  selected: CellSelection,
  anchor: [number, number] | null,
  cell: [number, number],
): { selection: CellSelection; anchor: [number, number] | null } {
  if (anchor === null) {
    return { selection: selected, anchor: cell };
  }
  if (anchor[0] === cell[0] && anchor[1] === cell[1]) {
    // Same corner clicked twice → treat as a single-cell toggle.
    return { selection: toggleCell(selected, cell[0], cell[1]), anchor: null };
  }
  return { selection: selectRectangle(selected, anchor, cell), anchor: null };
}
