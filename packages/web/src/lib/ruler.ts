import {
  RULER_ACTIVE_FONT_DELTA,
  RULER_COLOR,
  RULER_COLOR_HOVER,
  RULER_FONT_SIZE,
  RULER_SIZE,
} from '@loredoku/shared';
import { scaleFontSize } from '@/lib/canvasScale';
import { estimateTextWidth } from '@/lib/textWidth';

/** OPT-B05 (docs/v0.3.6.md §5) + v0.3.9 FEAT-E02: one state machine drives both ruler strips. | 行 / 列状态 | 表现 | |---|---| | 普通 | 淡灰，配置的文本大小 | | 鼠标悬停 | 深灰，字号不变 | | 操作格 | 深灰，比普通字号大 `RULER_ACTIVE_FONT_DELTA`（默认 +2，即 17 → 19） | | 鼠标悬停 + 操作格 | 深灰，以操作格优先 | */
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

/** §5.3: the operated row / column grows by `RULER_ACTIVE_FONT_DELTA` px. `fontSize` is the map's configured base size (FEAT-E02); both sizes are multiplied by `scale`. */
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

/** The ruler strips live **outside** the zoomed board wrapper, so they are the one place that has to multiply by `zoom` itself: §3.3 requires lines and fonts to scale with the container, and the §3.2 guard rails are capped against the cell-derived size, not the zoomed one. */
export function buildRulerGlyphs(input: {
  gridSize: number;
  axis: 'column' | 'row';
  hoverIndex: number | null;
  operationIndex: number | null;
  scale: number;
  zoom?: number;
  /** FEAT-E02: the map's configured base text size. */
  fontSize?: number;
  /** v0.10.8: the prefix for this axis (`C` / `R` by default). */
  symbol?: string;
}): RulerGlyph[] {
  const {
    gridSize,
    axis,
    hoverIndex,
    operationIndex,
    scale,
    zoom = 1,
    fontSize = RULER_FONT_SIZE,
    symbol,
  } = input;
  if (!Number.isFinite(gridSize) || gridSize < 1) return [];
  const prefix = symbol ?? (axis === 'column' ? 'C' : 'R');
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

/** Pass `maxLabelWidth` for the row strip; the column strip (thin axis vertical, text height only) omits it. */
export function rulerStripSize(input: {
  /** Largest glyph height actually rendered (already includes zoom). */
  maxFontSize: number;
  /** Configured text→board gap, in unscaled px. */
  gap: number;
  /** Minimum strip size (the v0.3.6 constant). */
  minSize?: number;
  /** Widest label the strip has to hold horizontally (row strip only). */
  maxLabelWidth?: number;
}): number {
  const { maxFontSize, gap, minSize = RULER_SIZE, maxLabelWidth = 0 } = input;
  const font = Number.isFinite(maxFontSize) ? Math.max(0, maxFontSize) : 0;
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const label = Number.isFinite(maxLabelWidth) ? Math.max(0, maxLabelWidth) : 0;
  // +6 keeps a little air above the text when both values are large; +2 the
  // same on the label's open side.
  return Math.max(
    minSize,
    Math.ceil(font + spacing + 6),
    Math.ceil(label + spacing + 2),
  );
}

/** Estimated width of the widest label (`C{gridSize}` / `R{gridSize}`) at `fontSize` — both strips share the digit count, so one value covers both. The widest symbol of the two axes wins — `列24` is wider than `行24`, and sizing the strip for `C` would clip a two-character prefix. */
export function rulerLabelWidth(gridSize: number, fontSize: number, symbols?: readonly string[]): number {
  if (!Number.isFinite(gridSize) || gridSize < 1) return 0;
  const digits = '9'.repeat(String(Math.floor(gridSize)).length);
  const candidates = symbols && symbols.length > 0 ? symbols : ['C', 'R'];
  // 逐个真实候选算宽度再取最大 —— `列` 是全角（1em），`C` 只有 0.62em，
  // 按字符个数比较会把两字前缀算窄、行条把标签切掉半截。
  return Math.max(...candidates.map((symbol) => estimateTextWidth(`${symbol}${digits}`, fontSize)));
}

/** Where a strip's **thin axis** starts. Glyph alignment survives the clamp because each glyph is positioned from the strip's long-axis edge, and only the thin axis moves. */
export function rulerStripStart(
  boardEdge: number,
  stripSize: number,
  textExtent: number,
  gap: number,
): number {
  if (!Number.isFinite(boardEdge)) return 0;
  const size = Number.isFinite(stripSize) ? Math.max(0, stripSize) : 0;
  const extent = Number.isFinite(textExtent) ? Math.max(0, textExtent) : 0;
  const spacing = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  return Math.max(boardEdge - size, extent + spacing - size);
}
