import { describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  FONT_SIZE_MIN,
  MAX_CELL_SIZE,
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
  rulerLabelWidth,
  rulerState,
  rulerStripSize,
  rulerStripStart,
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
    // 格宽下限 48px 时 17 × 0.4 = 6.8 会被 `FONT_SIZE_MIN` 兜住（见下一例），
    // 所以这里取基准格的 3/4 来验「真的按比例缩放」。
    const scale = cellScale(BASE_CELL * 0.75);
    expect(rulerFontSize('normal', scale)).toBeCloseTo(12.75, 6);
    expect(rulerFontSize('operation', scale)).toBeCloseTo(14.25, 6);
    // v0.5.2 FIX-M08: 17 × 2 = 34 / 19 × 2 = 38 — no 28px ceiling any more.
    expect(rulerFontSize('normal', cellScale(MAX_CELL_SIZE))).toBeCloseTo(34, 6);
    expect(rulerFontSize('operation', cellScale(MAX_CELL_SIZE))).toBeCloseTo(38, 6);
  });

  it('respects the font guard rails', () => {
    expect(rulerFontSize('normal', 0.1)).toBe(FONT_SIZE_MIN);
    // The upper bound is gone; only the lower rail remains.
    expect(rulerFontSize('operation', 50)).toBeCloseTo(950, 6);
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
    // v0.5.2 FIX-M08: 17 × 2 (cell scale) = 34 — **not** capped any more —
    // then × 3 for zoom.
    expect(
      buildRulerGlyphs({
        gridSize: 1,
        axis: 'row',
        hoverIndex: null,
        operationIndex: null,
        scale: 2,
        zoom: 3,
      })[0]!.fontSize,
    ).toBe(102);
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
    // v0.5.2 FIX-M08: 40 × 1 = 40 survives; the +2 active size follows.
    expect(rulerFontSize('normal', 1, 40)).toBe(40);
    expect(rulerFontSize('operation', 1, 40)).toBe(42);
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

  it('v0.7.0 fix: widens the strip for the label width (row strip)', () => {
    // 「R12」 at 24px ≈ 3 × 0.62 × 24 = 44.64 — wider than the 54px a
    // height-only strip would give (24 + 24 gap + 6), so the row strip
    // must grow or the strip's own overflow clips the text.
    const label = rulerLabelWidth(12, 24);
    expect(label).toBeCloseTo(44.64, 6);
    expect(rulerStripSize({ maxFontSize: 24, gap: 24, maxLabelWidth: label })).toBe(71);
    // Without the label width the old (clipping) size comes back.
    expect(rulerStripSize({ maxFontSize: 24, gap: 24 })).toBe(54);
  });

  it('v0.7.0 fix: the label width scales with the grid and the font', () => {
    expect(rulerLabelWidth(9, 24)).toBeCloseTo(2 * 0.62 * 24, 6);
    expect(rulerLabelWidth(24, 48)).toBeCloseTo(3 * 0.62 * 48, 6);
    expect(rulerLabelWidth(0, 24)).toBe(0);
    expect(rulerLabelWidth(Number.NaN, 24)).toBe(0);
  });

  it('tolerates degenerate input', () => {
    expect(rulerStripSize({ maxFontSize: Number.NaN, gap: Number.NaN })).toBe(28);
    expect(rulerStripSize({ maxFontSize: -10, gap: -10 })).toBe(28);
    expect(
      rulerStripSize({ maxFontSize: Number.NaN, gap: Number.NaN, maxLabelWidth: Number.NaN }),
    ).toBe(28);
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

// ---- v0.7.0 fix: 标尺薄轴贴边且文本完整（docs/v0.7.0.md §3 / §8） ----
describe('rulerStripStart', () => {
  it('hugs the board edge when the label fits between it and the viewport', () => {
    // Board edge comfortably inside; strip (and therefore the label, which is
    // anchored to the board side) sits just outside it.
    expect(rulerStripStart(200, 71, 44.64, 24)).toBe(129);
    expect(rulerStripStart(71, 71, 44.64, 24)).toBe(0);
    // Exactly enough room for the label → still hugging.
    expect(rulerStripStart(68.64, 71, 44.64, 24)).toBeCloseTo(-2.36, 9);
  });

  it('pins the strip inward so the label starts at the viewport edge', () => {
    // Board edge too close to fit the label: the strip slides right / down
    // until the label's open edge is at 0 — whole, overlapping the board a
    // little instead of being clipped mid-glyph.
    expect(rulerStripStart(10, 71, 44.64, 24)).toBeCloseTo(-2.36, 9);
    // Zoomed far in: board edge off-screen, label pinned at the edge.
    expect(rulerStripStart(-2000, 71, 44.64, 24)).toBeCloseTo(-2.36, 9);
  });

  it('keeps the label whole for every board edge', () => {
    const size = rulerStripSize({ maxFontSize: 24, gap: 24, maxLabelWidth: 44.64 });
    for (let edge = -500; edge <= 500; edge += 7) {
      const start = rulerStripStart(edge, size, 44.64, 24);
      const labelLeft = start + size - 24 - 44.64;
      // Either the strip hugs the board (label just outside its edge) or it is
      // pinned so the label starts at the viewport edge — never cut.
      const hugging = Math.abs(start - (edge - size)) < 1e-9;
      const pinned = Math.abs(labelLeft) < 1e-9;
      expect(labelLeft).toBeGreaterThanOrEqual(-1e-9);
      expect(hugging || pinned).toBe(true);
    }
  });

  it('treats a degenerate board edge as the viewport edge', () => {
    expect(rulerStripStart(Number.NaN, 71, 44.64, 24)).toBe(0);
  });
});
