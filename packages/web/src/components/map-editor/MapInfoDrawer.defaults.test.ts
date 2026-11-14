import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLE_LINE_WIDTH_MAX,
  MAP_STYLE_REGION_LABEL_FONT_MAX,
  MAP_STYLE_REGION_LABEL_STROKE_MAX,
  MAP_STYLE_RULER_FONT_MAX,
  MAP_STYLE_RULER_GAP_MAX,
  REGION_BORDER_WIDTH_MAX,
  STYLE_DEFAULT_CANVAS_FRAME_WIDTH,
  STYLE_DEFAULT_GRID_SEPARATOR_WIDTH,
  STYLE_DEFAULT_MOUSE_CURSOR_WIDTH,
  STYLE_DEFAULT_OPERATION_CURSOR_WIDTH,
  STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR,
  STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH,
  STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
  STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE,
  STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH,
  STYLE_DEFAULT_REGION_OUTLINE_WIDTH,
  STYLE_DEFAULT_RULER_FONT_SIZE,
  STYLE_DEFAULT_RULER_GAP,
} from '@loredoku/shared';

/**
 * v0.5.2 SPEC-M07 (docs/v0.5.2.md §7) — the 「基本信息」defaults were all
 * raised. Two things must hold, and this file pins both:
 *
 * 1. `DEFAULT_MAP_STYLE` carries the new numbers (already covered from the
 *    resolver side in `lib/mapStyle.test.ts` — repeated here because the drawer
 *    is the surface the user actually reads).
 * 2. Every new default still fits inside the clamp range its `NumberField`
 *    enforces, otherwise the drawer would silently snap the value back.
 */
describe('基本信息默认值（v0.5.2 SPEC-M07）', () => {
  it('matches the §7 table field by field', () => {
    expect(DEFAULT_MAP_STYLE.ruler).toEqual({
      fontSize: 24,
      gap: 24,
      columnSymbol: 'C',
      rowSymbol: 'R',
    });
    expect(DEFAULT_MAP_STYLE.regionOutline.width).toBe(12);
    expect(DEFAULT_MAP_STYLE.regionHighlight).toEqual({
      width: 12,
      color: '#3B82F6',
    });
    expect(DEFAULT_MAP_STYLE.canvasFrame.width).toBe(12);
    expect(DEFAULT_MAP_STYLE.gridSeparator.width).toBe(4);
    expect(DEFAULT_MAP_STYLE.mouseCursorBox.width).toBe(8);
    expect(DEFAULT_MAP_STYLE.operationCursorBox.width).toBe(8);
    expect(DEFAULT_MAP_STYLE.regionLabel.fontSize).toBe(32);
    expect(DEFAULT_MAP_STYLE.regionLabel.strokeWidth).toBe(10);
    expect(DEFAULT_MAP_STYLE.regionLabel.hoverFontSize).toBe(36);
  });

  it('reads the values from the named constants', () => {
    expect(STYLE_DEFAULT_RULER_FONT_SIZE).toBe(24);
    expect(STYLE_DEFAULT_RULER_GAP).toBe(24);
    expect(STYLE_DEFAULT_REGION_OUTLINE_WIDTH).toBe(12);
    expect(STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH).toBe(12);
    expect(STYLE_DEFAULT_REGION_HIGHLIGHT_COLOR).toBe('#3B82F6');
    expect(STYLE_DEFAULT_CANVAS_FRAME_WIDTH).toBe(12);
    expect(STYLE_DEFAULT_GRID_SEPARATOR_WIDTH).toBe(4);
    expect(STYLE_DEFAULT_MOUSE_CURSOR_WIDTH).toBe(8);
    expect(STYLE_DEFAULT_OPERATION_CURSOR_WIDTH).toBe(8);
    expect(STYLE_DEFAULT_REGION_LABEL_FONT_SIZE).toBe(32);
    expect(STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH).toBe(10);
    expect(STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE).toBe(36);
  });

  it('§7.2: every default fits inside its clamp range', () => {
    expect(STYLE_DEFAULT_RULER_FONT_SIZE).toBeLessThanOrEqual(MAP_STYLE_RULER_FONT_MAX);
    expect(STYLE_DEFAULT_RULER_GAP).toBeLessThanOrEqual(MAP_STYLE_RULER_GAP_MAX);
    expect(STYLE_DEFAULT_REGION_OUTLINE_WIDTH).toBeLessThanOrEqual(REGION_BORDER_WIDTH_MAX);
    expect(STYLE_DEFAULT_REGION_HIGHLIGHT_WIDTH).toBeLessThanOrEqual(MAP_STYLE_LINE_WIDTH_MAX);
    expect(STYLE_DEFAULT_CANVAS_FRAME_WIDTH).toBeLessThanOrEqual(MAP_STYLE_LINE_WIDTH_MAX);
    expect(STYLE_DEFAULT_GRID_SEPARATOR_WIDTH).toBeLessThanOrEqual(MAP_STYLE_LINE_WIDTH_MAX);
    expect(STYLE_DEFAULT_MOUSE_CURSOR_WIDTH).toBeLessThanOrEqual(MAP_STYLE_LINE_WIDTH_MAX);
    expect(STYLE_DEFAULT_OPERATION_CURSOR_WIDTH).toBeLessThanOrEqual(MAP_STYLE_LINE_WIDTH_MAX);
    expect(STYLE_DEFAULT_REGION_LABEL_FONT_SIZE).toBeLessThanOrEqual(
      MAP_STYLE_REGION_LABEL_FONT_MAX,
    );
    expect(STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE).toBeLessThanOrEqual(
      MAP_STYLE_REGION_LABEL_FONT_MAX,
    );
    expect(STYLE_DEFAULT_REGION_LABEL_STROKE_WIDTH).toBeLessThanOrEqual(
      MAP_STYLE_REGION_LABEL_STROKE_MAX,
    );
  });

  it('§2: the hovered label starts out larger than the idle one', () => {
    expect(STYLE_DEFAULT_REGION_LABEL_HOVER_FONT_SIZE).toBeGreaterThan(
      STYLE_DEFAULT_REGION_LABEL_FONT_SIZE,
    );
  });
});
