import { RULER_COLOR, RULER_COLOR_HOVER, RULER_FONT_SIZE, RULER_FONT_SIZE_ACTIVE } from '@murdoku/shared';
import { scaleFontSize } from '@/lib/canvasScale';

/**
 * OPT-B05 (docs/v0.3.6.md §5): one state machine drives both ruler strips.
 *
 * | 行 / 列状态 | 表现 |
 * |---|---|
 * | 普通 | 淡灰 15px |
 * | 鼠标悬停 | 深灰 15px |
 * | 操作格 | 深灰 17px |
 * | 鼠标悬停 + 操作格 | 深灰 17px（以操作格优先） |
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

/** §5.3: the operated row / column grows from 15px to 17px (both × scale). */
export function rulerFontSize(state: RulerState, scale: number): number {
  if (state === 'operation') return scaleFontSize(RULER_FONT_SIZE_ACTIVE, scale);
  return scaleFontSize(RULER_FONT_SIZE, scale);
}export interface RulerGlyph {
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
}): RulerGlyph[] {
  const { gridSize, axis, hoverIndex, operationIndex, scale, zoom = 1 } = input;
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
      fontSize: rulerFontSize(state, scale) * zoomFactor,
    };
  });
}
