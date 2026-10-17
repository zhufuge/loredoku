import {
  BASE_CELL,
  BORDER_WIDTH,
  CANVAS_OUTER_BORDER_WIDTH,
  FONT_SIZE_MIN,
  INNER_LINE_WIDTH,
  LINE_WIDTH_MAX,
  LINE_WIDTH_MIN,
  OBJECT_PADDING_BASE,
  OBJECT_PADDING_MAX,
  OBJECT_PADDING_MIN,
  REGION_HIGHLIGHT_WIDTH,
  RULER_FONT_SIZE,
  RULER_FONT_SIZE_ACTIVE,
} from '@loredoku/shared';

/**
 * OPT-B03 (docs/v0.3.6.md §3): the cell width spans 90 ~ 240px, so a fixed 2px
 * grid line is heavy at one end and hairline at the other. Everything geometric is
 * authored against `BASE_CELL` and multiplied by `scale = cellSize / BASE_CELL`.
 * §3.3: only `cellSize` re-scales — canvas zoom is a container `transform`, so
 * re-scaling here would double it.
 */
export function cellScale(cellSize: number): number {
  if (!Number.isFinite(cellSize) || cellSize <= 0) return 1;
  return cellSize / BASE_CELL;
}

/** Line widths clamp to `[LINE_WIDTH_MIN, LINE_WIDTH_MAX]` (§3.2 约束). */
export function scaleLineWidth(width: number, scale: number): number {
  const scaled = width * scale;
  if (!Number.isFinite(scaled)) return width;
  return Math.min(LINE_WIDTH_MAX, Math.max(LINE_WIDTH_MIN, scaled));
}

/**
 * v0.5.2 FIX-M08 (docs/v0.5.2.md §8): fonts clamp to `FONT_SIZE_MIN` only — **no
 * upper bound**. The old 28px ceiling flattened everything above it ("set 32px,
 * rendered 28px"). Line widths need a ceiling or they smear; a large label is a
 * deliberate authoring choice and must survive.
 */
export function scaleFontSize(size: number, scale: number): number {
  const scaled = size * scale;
  if (!Number.isFinite(scaled)) return size;
  return Math.max(FONT_SIZE_MIN, scaled);
}

/**
 * OPT-C06 (docs/v0.3.7.md §OPT-C06): object-layer artwork is inset inside its
 * cell. Clamped to `[OBJECT_PADDING_MIN, OBJECT_PADDING_MAX]`.
 */
export function objectPadding(cellSize: number): number {
  const scaled = OBJECT_PADDING_BASE * cellScale(cellSize);
  if (!Number.isFinite(scaled)) return OBJECT_PADDING_BASE;
  return Math.min(OBJECT_PADDING_MAX, Math.max(OBJECT_PADDING_MIN, scaled));
}

/** The scaled geometry of one board render, derived once per `cellSize`. */
export interface CanvasMetrics {
  scale: number;
  /** Internal grid separators (§3.2: 2px base). */
  borderWidth: number;
  /** The board's outermost frame (§4: 6px = default region border width). */
  outerBorderWidth: number;
  /** Inner line used by the mouse cursor box (§3.2: 1px base). */
  innerLineWidth: number;
  /** Region highlight line (§1: 4px base). */
  regionHighlightWidth: number;
  /** Ruler glyph size for idle / hovered rows and columns. */
  rulerFontSize: number;
  /** Ruler glyph size for the row / column of the operation box. */
  rulerFontSizeActive: number;
  /** Greys the cursor box shadow ring to the Border width. */
  borderGap: number;
}

export function canvasMetrics(cellSize: number): CanvasMetrics {
  const scale = cellScale(cellSize);
  return {
    scale,
    borderWidth: scaleLineWidth(BORDER_WIDTH, scale),
    outerBorderWidth: scaleLineWidth(CANVAS_OUTER_BORDER_WIDTH, scale),
    innerLineWidth: scaleLineWidth(INNER_LINE_WIDTH, scale),
    regionHighlightWidth: scaleLineWidth(REGION_HIGHLIGHT_WIDTH, scale),
    rulerFontSize: scaleFontSize(RULER_FONT_SIZE, scale),
    rulerFontSizeActive: scaleFontSize(RULER_FONT_SIZE_ACTIVE, scale),
    borderGap: scaleLineWidth(BORDER_WIDTH, scale),
  };
}
