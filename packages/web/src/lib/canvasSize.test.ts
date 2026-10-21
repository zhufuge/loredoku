import { describe, expect, it } from 'vitest';
import {
  BORDER_WIDTH,
  BOTTOM_BAR_RESERVE,
  CANVAS_PADDING,
  EXTRA_MARGIN,
  DEFAULT_CELL_SIZE,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  RULER_SIZE,
} from '@loredoku/shared';
import {
  availableBox,
  canvasInsets,
  centeredPan,
  computeCellSize,
  computeCellSizeForInsets,
  renderedCellSize,
} from './canvasSize';

describe('computeCellSize (OPT-A01 §1.1)', () => {
  it('never leaves the 32–240px range', () => {
    expect(MIN_CELL_SIZE).toBe(32);
    expect(MAX_CELL_SIZE).toBe(240);
    expect(DEFAULT_CELL_SIZE).toBe(MIN_CELL_SIZE);

    // A tiny board would love a huge cell — clamped to the maximum.
    expect(
      computeCellSize({ availableWidth: 4000, availableHeight: 4000, gridSize: 2 }),
    ).toBe(MAX_CELL_SIZE);
    // A 24×24 board in a small viewport — clamped to the minimum.
    expect(
      computeCellSize({ availableWidth: 600, availableHeight: 600, gridSize: 24 }),
    ).toBe(MIN_CELL_SIZE);
  });

  it('derives the ideal width from the tighter axis', () => {
    // Wide but short viewport: the height decides.
    const cell = computeCellSize({ availableWidth: 4000, availableHeight: 500, gridSize: 4 });
    // (500 - 3 * 2) / 4 = 123.5 → 124
    expect(cell).toBe(Math.round((500 - 3 * BORDER_WIDTH) / 4));
  });

  it('accounts for the shared Border between neighbours', () => {
    // Without the gap the ideal would be exactly 100; the two 2px borders
    // shared by three neighbours push it to 98.5 → 99.
    const cell = computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4 });
    expect(cell).toBe(Math.round((400 - 3 * BORDER_WIDTH) / 4));
    expect(cell).toBe(99);
  });

  it('covers every grid size from 2 to 24 without leaving the range', () => {
    for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
      const cell = computeCellSize({
        availableWidth: 1440,
        availableHeight: 900,
        gridSize,
      });
      expect(cell).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
      expect(cell).toBeLessThanOrEqual(MAX_CELL_SIZE);
      expect(Number.isInteger(cell)).toBe(true);
    }
  });

  it('n = 2 approaches the maximum and n = 24 stays near the minimum', () => {
    const roomy = { availableWidth: 1440, availableHeight: 900 };
    expect(computeCellSize({ ...roomy, gridSize: 2 })).toBe(MAX_CELL_SIZE);
    // 24×24 在 1440×900 里是 36 —— **不再被下限夹住**（这正是下限放到 32 的目的），
    // 所以只要求它明显小于中等板子、且不低于下限。
    const dense = computeCellSize({ ...roomy, gridSize: 24 });
    expect(dense).toBeGreaterThanOrEqual(MIN_CELL_SIZE);
    expect(dense).toBeLessThan(computeCellSize({ ...roomy, gridSize: 6 }));
    // Monotonic: more cells never means wider cells.
    let previous = Number.POSITIVE_INFINITY;
    for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
      const cell = computeCellSize({ ...roomy, gridSize });
      expect(cell).toBeLessThanOrEqual(previous);
      previous = cell;
    }
  });

  it('falls back to the minimum for degenerate input', () => {
    expect(computeCellSize({ availableWidth: 900, availableHeight: 900, gridSize: 0 })).toBe(
      MIN_CELL_SIZE,
    );
    expect(
      computeCellSize({ availableWidth: Number.NaN, availableHeight: 900, gridSize: 6 }),
    ).toBe(MIN_CELL_SIZE);
  });

  it('honours custom bounds and gap', () => {
    expect(
      computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4, gap: 0 }),
    ).toBe(100);
    expect(
      computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4, max: 60 }),
    ).toBe(60);
  });
});

describe('renderedCellSize (OPT-A01 §1.3)', () => {
  it('scales the base cell size by the zoom factor', () => {
    expect(renderedCellSize(120, 1)).toBe(120);
    expect(renderedCellSize(120, 2)).toBe(240);
    expect(renderedCellSize(120, 0.25)).toBe(30);
  });
});

// ---- OPT-B02 §2.2: asymmetric insets ----
describe('canvasInsets (OPT-B02 §2.2)', () => {
  it('reserves the ruler, the bottom toolbar, the padding and the extra margin', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    expect(RULER_SIZE).toBe(28);
    expect(BOTTOM_BAR_RESERVE).toBe(72);
    expect(CANVAS_PADDING).toBe(16);
    expect(EXTRA_MARGIN).toBe(24);
    // base = 16 + 24 = 40 → top/left 28+40, bottom 72+40, right 40.
    expect(insets).toEqual({ top: 68, right: 40, bottom: 112, left: 68 });
  });

  it('drops the ruler / toolbar bands when they are hidden', () => {
    expect(canvasInsets()).toEqual({ top: 40, right: 40, bottom: 40, left: 40 });
    expect(canvasInsets({ showRulers: true })).toEqual({
      top: 68,
      right: 40,
      bottom: 40,
      left: 68,
    });
    expect(canvasInsets({ showBottomBar: true })).toEqual({
      top: 40,
      right: 40,
      bottom: 112,
      left: 40,
    });
  });

  it('OPT-C01: EXTRA_MARGIN is added to every side', () => {
    const without = canvasInsets({ showRulers: true, showBottomBar: true, extraMargin: 0 });
    const with24 = canvasInsets({ showRulers: true, showBottomBar: true });
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(with24[side] - without[side]).toBe(EXTRA_MARGIN);
    }
  });

  it('§2.2 + OPT-C01: availableH = 高度 - 72 - 28 - 32 - 48', () => {
    const height = 900;
    const box = availableBox(
      { width: 1200, height },
      canvasInsets({ showRulers: true, showBottomBar: true }),
    );
    expect(box.height).toBe(
      height - BOTTOM_BAR_RESERVE - RULER_SIZE - CANVAS_PADDING * 2 - EXTRA_MARGIN * 2,
    );
    expect(box.width).toBe(1200 - RULER_SIZE - CANVAS_PADDING * 2 - EXTRA_MARGIN * 2);
  });

  it('never reports a negative content box', () => {
    const box = availableBox(
      { width: 10, height: 10 },
      canvasInsets({ showRulers: true, showBottomBar: true }),
    );
    expect(box).toEqual({ width: 0, height: 0 });
  });
});

describe('computeCellSizeForInsets (§2.2)', () => {
  it('is the plain computation over the inset content area', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    const box = availableBox({ width: 1280, height: 860 }, insets);
    expect(
      computeCellSizeForInsets({ width: 1280, height: 860, gridSize: 6, insets }),
    ).toBe(computeCellSize({ availableWidth: box.width, availableHeight: box.height, gridSize: 6 }));
  });

  it('§2.3: the bottom reserve can push the cell down to the minimum', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    // 24 cells in a short viewport → clamped to the minimum, and the board scrolls.
    expect(computeCellSizeForInsets({ width: 700, height: 600, gridSize: 24, insets })).toBe(
      MIN_CELL_SIZE,
    );
    // A roomy viewport still reaches the maximum.
    expect(computeCellSizeForInsets({ width: 3000, height: 3000, gridSize: 2, insets })).toBe(
      MAX_CELL_SIZE,
    );
  });
});

describe('centeredPan (OPT-B02 §2.2)', () => {
  it('centres the board inside the content box, not the raw viewport', () => {
    const insets = canvasInsets({ showRulers: true, showBottomBar: true });
    const rect = { width: 1000, height: 800 };
    const cellSize = 100;
    const pan = centeredPan(rect, insets, 6, cellSize);
    // Board = 600px; content box = (1000-68-40) × (800-68-112) = 892 × 620.
    const box = availableBox(rect, insets);
    expect(box).toEqual({ width: 892, height: 620 });
    expect(pan.x).toBe(Math.round(insets.left + (box.width - 600) / 2));
    expect(pan.y).toBe(Math.round(insets.top + (box.height - 600) / 2));
    expect(pan).toEqual({ x: 214, y: 78 });
    // The board never intrudes into the reserved bands.
    expect(pan.x).toBeGreaterThanOrEqual(insets.left);
    expect(pan.y).toBeGreaterThanOrEqual(insets.top);
    expect(pan.y + 6 * cellSize).toBeLessThanOrEqual(800 - insets.bottom);
  });

  it('scales the board with zoom before centring', () => {
    const insets = canvasInsets();
    const rect = { width: 600, height: 600 };
    const pan = centeredPan(rect, insets, 2, 100, 2);
    // Board = 2 × 100 × 2 = 400 → (600 - 40 - 40 - 400) / 2 = 60
    expect(pan).toEqual({ x: 40 + 60, y: 40 + 60 });
  });
});
