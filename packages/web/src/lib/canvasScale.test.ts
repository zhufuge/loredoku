import { describe, expect, it } from 'vitest';
import {
  BASE_CELL,
  BORDER_WIDTH,
  CANVAS_OUTER_BORDER_WIDTH,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  INNER_LINE_WIDTH,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  MAX_CELL_SIZE,
  MIN_CELL_SIZE,
  REGION_HIGHLIGHT_WIDTH,
  REGION_LABEL_FONT_SIZE,
  REGION_LABEL_STROKE_WIDTH,
  RULER_FONT_SIZE,
  RULER_FONT_SIZE_ACTIVE,
  OBJECT_PADDING_BASE,
  OBJECT_PADDING_MAX,
  OBJECT_PADDING_MIN,
} from '@loredoku/shared';
import { canvasMetrics, cellScale, objectPadding, scaleFontSize, scaleLineWidth } from './canvasScale';

describe('cellScale (OPT-B03 §3.2)', () => {
  it('is 1 at the reference cell width', () => {
    expect(BASE_CELL).toBe(120);
    expect(cellScale(BASE_CELL)).toBe(1);
  });

  it('tracks the adaptive range 90 → 240', () => {
    expect(cellScale(MIN_CELL_SIZE)).toBeCloseTo(0.75, 6);
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
    expect(OBJECT_PADDING_BASE).toBe(4);
    expect(objectPadding(BASE_CELL)).toBe(OBJECT_PADDING_BASE);
    expect(objectPadding(MIN_CELL_SIZE)).toBe(3); // 4 × 0.75
    expect(objectPadding(MAX_CELL_SIZE)).toBe(8); // 4 × 2
    expect(objectPadding(1)).toBe(OBJECT_PADDING_MIN);
    expect(objectPadding(100000)).toBe(OBJECT_PADDING_MAX);
    expect(objectPadding(Number.NaN)).toBe(OBJECT_PADDING_BASE);
  });

  it('clamps fonts to [9, 28]', () => {
    expect(FONT_SIZE_MIN).toBe(9);
    expect(FONT_SIZE_MAX).toBe(28);
    expect(scaleFontSize(RULER_FONT_SIZE, 0.01)).toBe(FONT_SIZE_MIN);
    expect(scaleFontSize(RULER_FONT_SIZE_ACTIVE, 10)).toBe(FONT_SIZE_MAX);
    expect(scaleFontSize(RULER_FONT_SIZE, 1)).toBe(17);
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
    // 17 × 2 = 34 → clamped to the 28px cap.
    expect(metrics.rulerFontSize).toBe(FONT_SIZE_MAX);
    expect(metrics.rulerFontSizeActive).toBe(FONT_SIZE_MAX);
  });

  it('shrinks at the minimum cell size (90 → scale 0.75)', () => {
    const metrics = canvasMetrics(MIN_CELL_SIZE);
    expect(metrics.scale).toBeCloseTo(0.75, 6);
    expect(metrics.borderWidth).toBeCloseTo(1.5, 6);
    expect(metrics.outerBorderWidth).toBeCloseTo(4.5, 6);
    expect(metrics.innerLineWidth).toBeCloseTo(1.5, 6);
    expect(metrics.regionHighlightWidth).toBeCloseTo(3, 6);
    expect(metrics.rulerFontSize).toBeCloseTo(12.75, 6);
    expect(metrics.rulerFontSizeActive).toBeCloseTo(14.25, 6);
  });

  it('keeps every line and font inside its guard rails for cellSize 90~240', () => {
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
        expect(font).toBeLessThanOrEqual(FONT_SIZE_MAX);
      }
      // The outer frame always stays noticeably heavier than the separators.
      expect(metrics.outerBorderWidth).toBeGreaterThan(metrics.borderWidth);
    }
  });

  it('scales the region label and its stroke with the cell', () => {
    const small = canvasMetrics(MIN_CELL_SIZE);
    const large = canvasMetrics(MAX_CELL_SIZE);
    expect(scaleFontSize(REGION_LABEL_FONT_SIZE, small.scale)).toBeCloseTo(12.75, 6);
    expect(scaleFontSize(REGION_LABEL_FONT_SIZE, large.scale)).toBe(28);
    expect(scaleLineWidth(REGION_LABEL_STROKE_WIDTH, small.scale)).toBeCloseTo(3, 6);
    expect(scaleLineWidth(REGION_LABEL_STROKE_WIDTH, large.scale)).toBe(8);
  });
});
