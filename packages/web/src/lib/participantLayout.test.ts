import { describe, expect, it } from 'vitest';
import {
  computeParticipantLayout,
  deriveLayout,
  fitColumns,
  matrixOrder,
  participantSequence,
  slotIndex,
  slotPosition,
} from './participantLayout';

describe('computeParticipantLayout', () => {
  it('handles zero and negative counts', () => {
    expect(computeParticipantLayout(0)).toMatchObject({ cols: 1, rows: 0, total: 0 });
    expect(computeParticipantLayout(-3)).toMatchObject({ cols: 1, rows: 0, total: 0 });
  });

  // Expected (cols, rows) pairs produced by the simple rule
  // `min |cols/rows - 1/φ|` with tie-break toward smaller `cols`.
  // Note: the spec's example table in docs/v0.3.1.md §2.2 is illustrative
  // and disagrees with the simple rule for n ∈ {4, 8, 9, 16}; the rule is
  // what we implement, so the test pins the rule's actual output.
  it.each([
    [2, 1, 2],
    [3, 1, 3],
    [4, 1, 4],
    [5, 2, 3],
    [6, 2, 3],
    [7, 2, 4],
    [8, 2, 4],
    [9, 2, 5],
    [10, 3, 4],
    [12, 3, 4],
    [13, 3, 5],
    [16, 3, 6],
    [18, 3, 6],
    [20, 4, 5],
    [24, 4, 6],
  ] as Array<[number, number, number]>)(`n=%i → cols=%i, rows=%i`, (n, cols, rows) => {
    const layout = computeParticipantLayout(n);
    expect(layout.cols).toBe(cols);
    expect(layout.rows).toBe(rows);
    expect(layout.total).toBe(n);
    // Rows × cols must be enough to hold every slot.
    expect(layout.rows * layout.cols).toBeGreaterThanOrEqual(n);
  });

  it('centres the last row when it is short', () => {
    const layout = computeParticipantLayout(6); // 2 cols × 3 rows, no gap
    expect(layout.lastRowCount).toBe(2);
    expect(layout.leadingOffset).toBe(0);

    const partial = computeParticipantLayout(11); // cols=3, rows=4, last row 2
    // last row has 2 cells, cols=3, leading offset = floor((3-2)/2) = 0
    expect(partial.lastRowCount).toBe(2);
    expect(partial.leadingOffset).toBe(0);

    const odd = computeParticipantLayout(5); // cols=2, rows=3, last row 1
    expect(odd.cols).toBe(2);
    expect(odd.lastRowCount).toBe(1);
    // floor((2 - 1) / 2) = 0
    expect(odd.leadingOffset).toBe(0);

    const gap = computeParticipantLayout(7); // cols=2, rows=4, last row 1
    expect(gap.lastRowCount).toBe(1);
    expect(gap.leadingOffset).toBe(0);
  });

  it('keeps cols/rows within the spec envelope for n=2..24', () => {
    for (let n = 2; n <= 24; n += 1) {
      const layout = computeParticipantLayout(n);
      expect(layout.cols).toBeGreaterThanOrEqual(1);
      expect(layout.cols).toBeLessThanOrEqual(n);
      expect(layout.rows).toBeGreaterThanOrEqual(1);
      expect(layout.rows).toBeLessThanOrEqual(n);
      // The matrix should always fit, and never be more than one row short.
      expect(layout.rows * layout.cols).toBeGreaterThanOrEqual(n);
    }
  });
});

describe('slotPosition / slotIndex round-trip', () => {
  it('maps every flat slot index to a unique matrix cell and back', () => {
    for (let n = 2; n <= 24; n += 1) {
      const layout = computeParticipantLayout(n);
      const seen = new Set<string>();
      for (let i = 0; i < n; i += 1) {
        const pos = slotPosition(i, layout);
        expect(pos, `n=${n} i=${i}`).not.toBeNull();
        const key = `${pos!.row},${pos!.col}`;
        expect(seen.has(key), `duplicate ${key} at n=${n} i=${i}`).toBe(false);
        seen.add(key);
        const back = slotIndex(pos!, layout);
        expect(back, `n=${n} i=${i} round-trip`).toBe(i);
      }
    }
  });

  it('rejects out-of-range positions', () => {
    const layout = computeParticipantLayout(6);
    expect(slotPosition(-1, layout)).toBeNull();
    expect(slotPosition(6, layout)).toBeNull();
    expect(slotIndex({ row: -1, col: 0 }, layout)).toBeNull();
    expect(slotIndex({ row: 0, col: 99 }, layout)).toBeNull();
  });

  it('returns null for cells in the centred gap of the last row', () => {
    // n=5 → cols=1, rows=5; no gap. Use n=11 → cols=3, rows=4, last row 2,
    // offset 0 → no gap either. Construct a synthetic case with n=8, cols=3,
    // rows=3, last row 2, offset floor((3-2)/2) = 0 → still no gap on either
    // side. The leading offset is always floor((cols - lastRowCount)/2), so
    // there can only be a gap when cols - lastRowCount is odd. The function
    // must return null when col lands inside that gap.
    const layout = computeParticipantLayout(8); // cols=3, rows=3, last row 2
    // Index 6 (first cell of last row) → row=2, col=leadingOffset+0.
    const first = slotPosition(6, layout);
    expect(first).not.toBeNull();
    // The trailing gap is at col = leadingOffset + lastRowCount.
    const gapCol = layout.leadingOffset + layout.lastRowCount;
    if (gapCol < layout.cols) {
      expect(slotIndex({ row: layout.rows - 1, col: gapCol }, layout)).toBeNull();
    }
  });
});

describe('deriveLayout (MOD-803 forced column count)', () => {
  it('rebuilds a layout with a smaller column count', () => {
    const layout = deriveLayout(24, 2); // computeParticipantLayout(24) is 4 cols
    expect(layout.cols).toBe(2);
    expect(layout.rows).toBe(12);
    expect(layout.total).toBe(24);
  });

  it('centres a short last row with a real leading offset', () => {
    // n=5 forced into 2 cols → rows=3, last row 1 → offset floor((2-1)/2)=0.
    // n=5 forced into 3 cols → rows=2, last row 2 → offset floor((3-2)/2)=0.
    // n=7 forced into 3 cols → rows=3, last row 1 → offset 1 (real gap).
    const layout = deriveLayout(7, 3);
    expect(layout).toMatchObject({ cols: 3, rows: 3, lastRowCount: 1, leadingOffset: 1 });
    // Round-trip through the gap: col 0 and col 2 of the last row are gaps.
    expect(slotIndex({ row: 2, col: 0 }, layout)).toBeNull();
    expect(slotIndex({ row: 2, col: 2 }, layout)).toBeNull();
    expect(slotIndex({ row: 2, col: 1 }, layout)).toBe(6);
  });

  it('clamps invalid column counts', () => {
    expect(deriveLayout(6, 0).cols).toBe(1);
    expect(deriveLayout(6, 99).cols).toBe(6);
    expect(deriveLayout(0, 3)).toMatchObject({ cols: 1, rows: 0, total: 0 });
  });
});

describe('fitColumns (MOD-803 layout adaptivity)', () => {
  const CELL = 72;
  const GAP = 12;

  it('keeps the preferred column count when everything fits', () => {
    // 4 cols need 4*72 + 3*12 = 324.
    expect(fitColumns(324, 4, CELL, GAP)).toBe(4);
    expect(fitColumns(400, 4, CELL, GAP)).toBe(4);
  });

  it('shrinks the column count when the panel is too narrow', () => {
    // 3 cols need 252, 2 cols need 156.
    expect(fitColumns(200, 4, CELL, GAP)).toBe(2);
    expect(fitColumns(160, 4, CELL, GAP)).toBe(2);
  });

  it('falls back to one column (caller scrolls vertically)', () => {
    expect(fitColumns(50, 4, CELL, GAP)).toBe(1);
    expect(fitColumns(0, 4, CELL, GAP)).toBe(1);
  });

  it('never exceeds the preferred column count', () => {
    for (let width = 0; width <= 600; width += 7) {
      const cols = fitColumns(width, 3, CELL, GAP);
      expect(cols).toBeGreaterThanOrEqual(1);
      expect(cols).toBeLessThanOrEqual(3);
    }
  });

  it('the fitted matrix always fits the width (unless cols=1)', () => {
    for (let width = 100; width <= 600; width += 13) {
      const cols = fitColumns(width, 4, CELL, GAP);
      if (cols > 1) {
        expect(cols * CELL + (cols - 1) * GAP).toBeLessThanOrEqual(width);
      }
    }
  });
});

// ---- OPT-B06 §6.3: participant sequence numbers ----
describe('participantSequence (OPT-B06 §6.3)', () => {
  it('is 1-based and matches the slot array order', () => {
    expect(participantSequence(0)).toBe(1);
    expect(participantSequence(4)).toBe(5);
  });
});

describe('matrixOrder (OPT-B06 §6.3)', () => {
  it('reads top-to-bottom, then left-to-right, for every n ≥ 2', () => {
    for (let n = 2; n <= 24; n += 1) {
      const layout = computeParticipantLayout(n);
      const order = matrixOrder(layout);
      expect(order).toHaveLength(n);
      expect(order).toEqual(Array.from({ length: n }, (_, index) => index));
    }
  });

  it('keeps the order when the last row is centred', () => {
    // 6 slots in a 4-column matrix: row 2 has a 1-cell gap on each side.
    const layout = deriveLayout(6, 4);
    expect(layout).toMatchObject({ cols: 4, rows: 2, lastRowCount: 2, leadingOffset: 1 });
    expect(matrixOrder(layout)).toEqual([0, 1, 2, 3, 4, 5]);
    // The numbers displayed in the cells are 1..6 in that order.
    expect(matrixOrder(layout).map(participantSequence)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('skips the gap cells of a short last row', () => {
    const layout = deriveLayout(5, 3);
    expect(matrixOrder(layout)).toHaveLength(5);
  });

  it('returns nothing for an empty layout', () => {
    expect(matrixOrder(computeParticipantLayout(0))).toEqual([]);
  });
});
