import { describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  RULER_COLOR,
  RULER_COLOR_HOVER,
  RULER_FONT_SIZE,
  RULER_FONT_SIZE_ACTIVE,
} from '@loredoku/shared';
import { cellScale } from './canvasScale';
import {
  buildRulerGlyphs,
  rulerColor,
  rulerFontSize,
  rulerState,
  rulerStripSize,
} from './ruler';

describe('rulerState (OPT-B05 §5.4)', () => {
  it('defaults to normal', () => {
    expect(RULER_COLOR).toBe('#9CA3AF');
    expect(RULER_COLOR_HOVER).toBe('#374151');
    expect(rulerState(2, null, null)).toBe('normal');
    expect(rulerState(2, 5, 7)).toBe('normal');
  });

  it('marks the hovered row / column', () => {
    expect(rulerState(3, 3, null)).toBe('hover');
  });

  it('marks the operation row / column', () => {
    expect(rulerState(3, null, 3)).toBe('operation');
  });

  it('§5.4: the operation box wins when both apply', () => {
    expect(rulerState(3, 3, 3)).toBe('operation');
  });

  it('only ever highlights a single index', () => {
    for (let index = 0; index < 6; index += 1) {
      expect(['normal', 'hover', 'operation']).toContain(rulerState(index, 3, 3));
    }
  });
});

describe('ruler glyph styling (§5.1~§5.3)', () => {
  it('uses the darker grey for hover and operation, never blue', () => {
    expect(rulerColor('normal')).toBe(RULER_COLOR);
    expect(rulerColor('hover')).toBe(RULER_COLOR_HOVER);
    expect(rulerColor('operation')).toBe(RULER_COLOR_HOVER);
    for (const state of ['normal', 'hover', 'operation'] as const) {
      expect(rulerColor(state)).not.toMatch(/^#(3B82F6|90CAF9|2563EB)$/);
    }
  });

  it('grows only the operated glyph, at the documented sizes', () => {
    expect(RULER_FONT_SIZE).toBe(17);
    expect(RULER_FONT_SIZE_ACTIVE).toBe(19);
    expect(rulerFontSize('normal', 1)).toBe(RULER_FONT_SIZE); // 17
    expect(rulerFontSize('hover', 1)).toBe(RULER_FONT_SIZE); // stays 17
    expect(rulerFontSize('operation', 1)).toBe(RULER_FONT_SIZE_ACTIVE); // 19
  });

  it('OPT-B03: multiplies both sizes by the cell scale', () => {
    expect(rulerFontSize('normal', cellScale(MIN_CELL_SIZE))).toBeCloseTo(12.75, 6);
    expect(rulerFontSize('operation', cellScale(MIN_CELL_SIZE))).toBeCloseTo(14.25, 6);
    expect(rulerFontSize('normal', cellScale(MAX_CELL_SIZE))).toBe(FONT_SIZE_MAX);
    expect(rulerFontSize('operation', cellScale(MAX_CELL_SIZE))).toBe(FONT_SIZE_MAX);
  });

  it('respects the font guard rails', () => {
    expect(rulerFontSize('normal', 0.1)).toBe(FONT_SIZE_MIN);
    expect(rulerFontSize('operation', 50)).toBe(FONT_SIZE_MAX);
  });
});

describe('buildRulerGlyphs', () => {
  it('builds 1-based C / R labels for every cell', () => {
    const columns = buildRulerGlyphs({
      gridSize: 4,
      axis: 'column',
      hoverIndex: null,
      operationIndex: null,
      scale: 1,
    });
    expect(columns.map((glyph) => glyph.label)).toEqual(['C1', 'C2', 'C3', 'C4']);
    expect(columns.map((glyph) => glyph.index)).toEqual([0, 1, 2, 3]);

    const rows = buildRulerGlyphs({
      gridSize: 3,
      axis: 'row',
      hoverIndex: null,
      operationIndex: null,
      scale: 1,
    });
    expect(rows.map((glyph) => glyph.label)).toEqual(['R1', 'R2', 'R3']);
  });

  it('applies the state machine per index', () => {
    const glyphs = buildRulerGlyphs({
      gridSize: 5,
      axis: 'column',
      hoverIndex: 1,
      operationIndex: 3,
      scale: 1,
    });
    expect(glyphs.map((glyph) => glyph.state)).toEqual([
      'normal',
      'hover',
      'normal',
      'operation',
      'normal',
    ]);
    expect(glyphs.map((glyph) => glyph.fontSize)).toEqual([17, 17, 17, 19, 17]);
  });

  it('returns nothing for a degenerate grid size', () => {
    expect(
      buildRulerGlyphs({
        gridSize: 0,
        axis: 'row',
        hoverIndex: null,
        operationIndex: null,
        scale: 1,
      }),
    ).toEqual([]);
    expect(
      buildRulerGlyphs({
        gridSize: Number.NaN,
        axis: 'row',
        hoverIndex: null,
        operationIndex: null,
        scale: 1,
      }),
    ).toEqual([]);
  });

  it('covers the whole documented grid range', () => {
    for (let gridSize = 2; gridSize <= 24; gridSize += 1) {
      const glyphs = buildRulerGlyphs({
        gridSize,
        axis: 'column',
        hoverIndex: null,
        operationIndex: null,
        scale: cellScale(BASE_CELL),
      });
      expect(glyphs).toHaveLength(gridSize);
      expect(glyphs[gridSize - 1]!.label).toBe(`C${gridSize}`);
    }
  });
});

describe('ruler zoom (§3.3)', () => {
  it('scales with the container so zooming never double-scales', () => {
    const base = buildRulerGlyphs({
      gridSize: 3,
      axis: 'column',
      hoverIndex: null,
      operationIndex: 1,
      scale: 1,
    });
    expect(base.map((glyph) => glyph.fontSize)).toEqual([17, 19, 17]);

    const zoomed = buildRulerGlyphs({
      gridSize: 3,
      axis: 'column',
      hoverIndex: null,
      operationIndex: 1,
      scale: 1,
      zoom: 2,
    });
    expect(zoomed.map((glyph) => glyph.fontSize)).toEqual([34, 38, 34]);
  });

  it('applies the guard rails before the zoom factor', () => {
    // 17 × 2 (cell scale) = 34 → capped at 28, then × 3 for zoom.
    expect(
      buildRulerGlyphs({
        gridSize: 1,
        axis: 'row',
        hoverIndex: null,
        operationIndex: null,
        scale: 2,
        zoom: 3,
      })[0]!.fontSize,
    ).toBe(84);
  });

  it('ignores a degenerate zoom', () => {
    expect(
      buildRulerGlyphs({
        gridSize: 1,
        axis: 'row',
        hoverIndex: null,
        operationIndex: null,
        scale: 1,
        zoom: 0,
      })[0]!.fontSize,
    ).toBe(17);
  });
});

// ---- v0.3.9 FEAT-E02: 可配置的文本大小与间距 ----
describe('ruler style config (FEAT-E02)', () => {
  it('keeps the +2 relationship for the operated row / column', () => {
    expect(rulerFontSize('normal', 1, 24)).toBe(24);
    expect(rulerFontSize('operation', 1, 24)).toBe(26);
    // The default base still reproduces v0.3.6 exactly.
    expect(rulerFontSize('normal', 1)).toBe(17);
    expect(rulerFontSize('operation', 1)).toBe(19);
  });

  it('clamps the configured base before applying the scale', () => {
    // 40 × 1 = 40 → capped at the 28px ceiling; the active size follows.
    expect(rulerFontSize('normal', 1, 40)).toBe(28);
    expect(rulerFontSize('operation', 1, 40)).toBe(28);
    // 6 × 1 = 6 → floored at 9.
    expect(rulerFontSize('normal', 1, 6)).toBe(9);
  });

  it('buildRulerGlyphs honours the configured size', () => {
    const glyphs = buildRulerGlyphs({
      gridSize: 3,
      axis: 'row',
      hoverIndex: null,
      operationIndex: 2,
      scale: 1,
      fontSize: 20,
    });
    expect(glyphs.map((glyph) => glyph.fontSize)).toEqual([20, 20, 22]);
  });

  it('sizes the strip so the text clears the board by `gap`', () => {
    // Comfortably above the minimum when the text is large.
    expect(rulerStripSize({ maxFontSize: 40, gap: 20 })).toBe(66);
    // Never smaller than the v0.3.6 strip.
    expect(rulerStripSize({ maxFontSize: 10, gap: 2 })).toBe(28);
    expect(rulerStripSize({ maxFontSize: 21, gap: 12 })).toBe(39);
  });

  it('tolerates degenerate input', () => {
    expect(rulerStripSize({ maxFontSize: Number.NaN, gap: Number.NaN })).toBe(28);
    expect(rulerStripSize({ maxFontSize: -10, gap: -10 })).toBe(28);
  });

  it('scales the strip with zoom through the glyph size', () => {
    const glyphs = buildRulerGlyphs({
      gridSize: 1,
      axis: 'column',
      hoverIndex: null,
      operationIndex: 0,
      scale: 1,
      zoom: 2,
      fontSize: 20,
    });
    const maxFont = Math.max(...glyphs.map((glyph) => glyph.fontSize));
    expect(maxFont).toBe(44);
    // 44 (text) + 6 (gap) + 6 (air above the text)
    expect(rulerStripSize({ maxFontSize: maxFont, gap: 6 })).toBe(56);
  });
});
