import { describe, expect, it } from 'vitest';
import { BORDER_WIDTH, DEFAULT_CELL_SIZE, MAX_CELL_SIZE, MIN_CELL_SIZE } from '@murdoku/shared';
import {
  computeCellSize,
  computeCellSizeForViewport,
  renderedCellSize,
} from './canvasSize';

describe('computeCellSize (OPT-A01 §1.1)', () => {
  it('never leaves the 90–240px range', () => {
    expect(MIN_CELL_SIZE).toBe(90);
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

  it('n = 2 approaches the maximum and n = 24 the minimum', () => {
    const roomy = { availableWidth: 1440, availableHeight: 900 };
    expect(computeCellSize({ ...roomy, gridSize: 2 })).toBe(MAX_CELL_SIZE);
    expect(computeCellSize({ ...roomy, gridSize: 24 })).toBe(MIN_CELL_SIZE);
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

describe('computeCellSizeForViewport (OPT-A01 §1.1/§1.2)', () => {
  it('removes the canvas padding from both axes first', () => {
    const withPadding = computeCellSizeForViewport({
      width: 432,
      height: 432,
      gridSize: 4,
      padding: 16,
    });
    // (432 - 32 - 6) / 4 = 98.5 → 99, same as passing the inset area directly.
    expect(withPadding).toBe(
      computeCellSize({ availableWidth: 400, availableHeight: 400, gridSize: 4 }),
    );
  });
});

describe('renderedCellSize (OPT-A01 §1.3)', () => {
  it('scales the base cell size by the zoom factor', () => {
    expect(renderedCellSize(120, 1)).toBe(120);
    expect(renderedCellSize(120, 2)).toBe(240);
    expect(renderedCellSize(120, 0.25)).toBe(30);
  });
});
