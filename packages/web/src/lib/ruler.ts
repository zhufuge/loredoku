import {
  RULER_ACTIVE_FONT_DELTA,
  RULER_COLOR,
  RULER_COLOR_HOVER,
  RULER_FONT_SIZE,
  RULER_SIZE,
} from '@loredoku/shared';
import { scaleFontSize } from '@/lib/canvasScale';

/**
 * OPT-B05 (docs/v0.3.6.md §5) + v0.3.9 FEAT-E02: one state machine drives both
 * ruler strips.
 *
 * | 行 / 列状态 | 表现 |
 * |---|---|
 * | 普通 | 淡灰，配置的文本大小 |
 * | 鼠标悬停 | 深灰，字号不变 |
 * | 操作格 | 深灰，比普通字号大 `RULER_ACTIVE_FONT_DELTA`（默认 +2，即 17 → 19） |
 * | 鼠标悬停 + 操作格 | 深灰，以操作格优先 |
 */
export type RulerState = 'normal' | 'hover' | 'operation';

export function rulerState(
  index: number,
  hoverIndex: number | null,
  operationIndex: number | null,
): RulerState {
  // §5.4: the operation box always wins over the plain hover state.
  if (operationIndex !== null && index === operationIndex) return 'operation';
  if (hoverIndex !== null && index === hoverIndex) return 'hover';
  return 'normal';
}

export function rulerColor(state: RulerState): string {
  return state === 'normal' ? RULER_COLOR : RULER_COLOR_HOVER;
}

/**
 * §5.3: the operated row / column grows by `RULER_ACTIVE_FONT_DELTA` px.
 * `fontSize` is the map's configured base size (FEAT-E02); both sizes are
 * multiplied by `scale`.
 */
export function rulerFontSize(
  state: RulerState,
  scale: number,
  fontSize: number = RULER_FONT_SIZE,
): number {
  if (state === 'operation') {
    return scaleFontSize(fontSize + RULER_ACTIVE_FONT_DELTA, scale);
  }
  return scaleFontSize(fontSize, scale);
}

export interface RulerGlyph {
  index: number;
  label: string;
  state: RulerState;
  color: string;
  fontSize: number;
}

/**
 * Builds both ruler strips — top = columns (`C1…`), left = rows (`R1…`).
 *
 * The ruler strips live **outside** the zoomed board wrapper, so they are the
 * one place that has to multiply by `zoom` itself: §3.3 requires lines and
 * fonts to scale with the container, and the §3.2 guard rails are capped
 * against the cell-derived size, not the zoomed one.
 */
export function buildRulerGlyphs(input: {
  gridSize: number;
  axis: 'column' | 'row';
  hoverIndex: number | null;
  operationIndex: number | null;
  scale: number;
  zoom?: number;
  /** FEAT-E02: the map's configured base text size. */
  fontSize?: number;
}): RulerGlyph[] {
  const { gridSize, axis, hoverIndex, operationIndex, scale, zoom = 1, fontSize = RULER_FONT_SIZE } = input;
  if (!Number.isFinite(gridSize) || gridSize < 1) return [];
  const prefix = axis === 'column' ? 'C' : 'R';
  const zoomFactor = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Array.from({ length: Math.floor(gridSize) }, (_, index) => {
    const state = rulerState(index, hoverIndex, operationIndex);
    return {
      index,
      label: `${prefix}${index + 1}`,
      state,
      color: rulerColor(state),
      fontSize: rulerFontSize(state, scale, fontSize) * zoomFactor,
    };
  });
}

/**
 * FEAT-E02: the ruler strip must be tall enough for the (zoomed) glyph plus the
 * configured gap between the text and the board — the text is anchored to the
 * board side of the strip, so `gap` is literally the text→board distance.
 */
export function rulerStripSize(input: {
  /** Largest glyph height actually rendered (already includes zoom). */
  maxFontSize: number;
  /** Configured text→board gap, in unscaled px. */
  gap: number;
  /** Minimum strip size (the v0.3.6 constant). */
  minSize?: number;
}): number {
  const { maxFontSize, gap, minSize = RULER_SIZE } = input;
  const font = Number.isFinite(maxFontSize) ? Math.max(0, maxFontSize) : 0;
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  // +6 keeps a little air above the text when both values are large.
  return Math.max(minSize, Math.ceil(font + spacing + 6));
}
