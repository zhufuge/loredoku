import { describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  BORDER_WIDTH,
  CANVAS_OUTER_BORDER_WIDTH,
  FONT_SIZE_MIN,
  INNER_LINE_WIDTH,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  REGION_HIGHLIGHT_WIDTH,
  REGION_LABEL_FONT_SIZE,
  REGION_LABEL_STROKE_WIDTH,
  STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
  STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE,
  RULER_FONT_SIZE,
  RULER_FONT_SIZE_ACTIVE,
  ITEM_PADDING_BASE,
  ITEM_PADDING_MAX,
  ITEM_PADDING_MIN,
} from '@loredoku/shared';
import { canvasMetrics, cellScale, itemPadding, scaleFontSize, scaleLineWidth } from './canvasScale';

describe('cellScale (OPT-B03 §3.2)', () => {
  it('is 1 at the reference cell width', () => {
    expect(BASE_CELL).toBe(120);
    expect(cellScale(BASE_CELL)).toBe(1);
  });

  it('tracks the adaptive range 32 → 240', () => {
    expect(cellScale(MIN_CELL_SIZE)).toBeCloseTo(MIN_CELL_SIZE / BASE_CELL, 6);
    expect(cellScale(MAX_CELL_SIZE)).toBeCloseTo(2, 6);
  });

  it('falls back to 1 for degenerate input', () => {
    expect(cellScale(0)).toBe(1);
    expect(cellScale(Number.NaN)).toBe(1);
    expect(cellScale(-10)).toBe(1);
  });
});

describe('scaleLineWidth / scaleFontSize (§3.2 约束)', () => {
  it('clamps lines to [0.5, 12]', () => {
    expect(LINE_WIDTH_MIN).toBe(0.5);
    expect(LINE_WIDTH_MAX).toBe(12);
    expect(scaleLineWidth(BORDER_WIDTH, 0.01)).toBe(LINE_WIDTH_MIN);
    expect(scaleLineWidth(BORDER_WIDTH, 100)).toBe(LINE_WIDTH_MAX);
    expect(scaleLineWidth(BORDER_WIDTH, 1)).toBe(2);
  });

  it('OPT-C06: object padding scales but stays within [2, 12]', () => {
    expect(ITEM_PADDING_BASE).toBe(4);
    expect(itemPadding(BASE_CELL)).toBe(ITEM_PADDING_BASE);
    expect(itemPadding(MIN_CELL_SIZE)).toBe(2); // 4 × 0.27 → 夹到 ITEM_PADDING_MIN = 2
    expect(itemPadding(MAX_CELL_SIZE)).toBe(8); // 4 × 2
    expect(itemPadding(1)).toBe(ITEM_PADDING_MIN);
    expect(itemPadding(100000)).toBe(ITEM_PADDING_MAX);
    expect(itemPadding(Number.NaN)).toBe(ITEM_PADDING_BASE);
  });

  // v0.5.2 FIX-M08 (docs/v0.5.2.md §8): the 28px ceiling is gone — only the
  // lower guard rail remains.
  it('clamps fonts to [9, ∞)', () => {
    expect(FONT_SIZE_MIN).toBe(9);
    expect(scaleFontSize(RULER_FONT_SIZE, 0.01)).toBe(FONT_SIZE_MIN);
    // 19 × 10 = 190 used to be flattened to 28.
    expect(scaleFontSize(RULER_FONT_SIZE_ACTIVE, 10)).toBe(190);
    expect(scaleFontSize(RULER_FONT_SIZE, 1)).toBe(17);
  });

  it('renders a 32px region label as 32px', () => {
    expect(scaleFontSize(STYLE_DEFAULT_REGION_LABEL_FONT_SIZE, 1)).toBe(32);
    expect(scaleFontSize(STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE, 1)).toBe(36);
    // §2: the hovered size stays the larger of the two at every scale.
    expect(scaleFontSize(STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE, 2)).toBeGreaterThan(
      scaleFontSize(STYLE_DEFAULT_REGION_LABEL_FONT_SIZE, 2),
    );
  });

  it('returns the base value for degenerate scales', () => {
    expect(scaleLineWidth(6, Number.NaN)).toBe(6);
    expect(scaleFontSize(14, Number.NaN)).toBe(14);
  });
});

describe('canvasMetrics (§3.2 要素表)', () => {
  it('reproduces the documented base values at BASE_CELL', () => {
    const metrics = canvasMetrics(BASE_CELL);
    expect(metrics.scale).toBe(1);
    expect(metrics.borderWidth).toBe(BORDER_WIDTH); // 2
    expect(metrics.outerBorderWidth).toBe(CANVAS_OUTER_BORDER_WIDTH); // 6
    expect(metrics.innerLineWidth).toBe(INNER_LINE_WIDTH); // 1
    expect(metrics.regionHighlightWidth).toBe(REGION_HIGHLIGHT_WIDTH); // 4
    expect(metrics.rulerFontSize).toBe(RULER_FONT_SIZE); // 17
    expect(metrics.rulerFontSizeActive).toBe(RULER_FONT_SIZE_ACTIVE); // 19
  });

  it('doubles everything at the maximum cell size (240 → scale 2)', () => {
    const metrics = canvasMetrics(MAX_CELL_SIZE);
    expect(metrics.scale).toBe(2);
    expect(metrics.borderWidth).toBe(4);
    // 6 × 2 = 12, right at the cap.
    expect(metrics.outerBorderWidth).toBe(12);
    // INNER_LINE_WIDTH is 2 since OPT-C05 → 2 × 2 = 4.
    expect(metrics.innerLineWidth).toBe(4);
    expect(metrics.regionHighlightWidth).toBe(8);
    // 17 × 2 = 34 — no longer flattened to 28.
    expect(metrics.rulerFontSize).toBe(34);
    expect(metrics.rulerFontSizeActive).toBe(38);
  });

  it('shrinks at the minimum cell size (32 → scale 0.267)', () => {
    const metrics = canvasMetrics(MIN_CELL_SIZE);
    const scale = MIN_CELL_SIZE / BASE_CELL;
    expect(metrics.scale).toBeCloseTo(scale, 6);
    // 2 × 0.267 = 0.53 —— 刚好还在 LINE_WIDTH_MIN = 0.5 之上，线不会消失。
    expect(metrics.borderWidth).toBeCloseTo(BORDER_WIDTH * scale, 6);
    expect(metrics.borderWidth).toBeGreaterThan(LINE_WIDTH_MIN);
    expect(metrics.outerBorderWidth).toBeCloseTo(CANVAS_OUTER_BORDER_WIDTH * scale, 6);
    expect(metrics.innerLineWidth).toBeCloseTo(INNER_LINE_WIDTH * scale, 6);
    expect(metrics.regionHighlightWidth).toBeCloseTo(REGION_HIGHLIGHT_WIDTH * scale, 6);
    // 17 × 0.267 = 4.5 / 19 × 0.267 = 5.1 都低于字号下限，被夹到 FONT_SIZE_MIN。
    expect(metrics.rulerFontSize).toBe(FONT_SIZE_MIN);
    expect(metrics.rulerFontSizeActive).toBe(FONT_SIZE_MIN);
  });

  it('keeps every line and font inside its guard rails for cellSize 32~240', () => {
    for (let cellSize = MIN_CELL_SIZE; cellSize <= MAX_CELL_SIZE; cellSize += 1) {
      const metrics = canvasMetrics(cellSize);
      for (const width of [
        metrics.borderWidth,
        metrics.outerBorderWidth,
        metrics.innerLineWidth,
        metrics.regionHighlightWidth,
      ]) {
        expect(width).toBeGreaterThanOrEqual(LINE_WIDTH_MIN);
        expect(width).toBeLessThanOrEqual(LINE_WIDTH_MAX);
      }
      for (const font of [metrics.rulerFontSize, metrics.rulerFontSizeActive]) {
        expect(font).toBeGreaterThanOrEqual(FONT_SIZE_MIN);
      }
      // The outer frame always stays noticeably heavier than the separators.
      expect(metrics.outerBorderWidth).toBeGreaterThan(metrics.borderWidth);
    }
  });

  it('scales the region label and its stroke with the cell', () => {
    const small = canvasMetrics(MIN_CELL_SIZE);
    const large = canvasMetrics(MAX_CELL_SIZE);
    // 17 × 0.267 = 4.5 低于字号下限，被夹到 FONT_SIZE_MIN。
    expect(scaleFontSize(REGION_LABEL_FONT_SIZE, small.scale)).toBe(FONT_SIZE_MIN);
    // 17 × 2 = 34, no cap.
    expect(scaleFontSize(REGION_LABEL_FONT_SIZE, large.scale)).toBe(34);
    expect(scaleLineWidth(REGION_LABEL_STROKE_WIDTH, small.scale)).toBeCloseTo(
      REGION_LABEL_STROKE_WIDTH * (MIN_CELL_SIZE / BASE_CELL),
      6,
    );
    expect(scaleLineWidth(REGION_LABEL_STROKE_WIDTH, large.scale)).toBe(8);
  });
});
