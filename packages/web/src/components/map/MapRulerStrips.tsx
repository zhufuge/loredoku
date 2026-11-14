import { useMemo } from 'react';
import { RULER_ACTIVE_FONT_DELTA, UI_Z } from '@loredoku/shared';
import type { CellCoord } from '@loredoku/shared';
import type { MapStyle } from '@loredoku/shared';
import { buildRulerGlyphs, rulerLabelWidth, rulerStripSize, rulerStripStart } from '@/lib/ruler';
import { cellScale, scaleFontSize } from '@/lib/canvasScale';
import { useRulerSymbolsByCode } from '@/hooks/useThemes';

export interface MapRulerStripsProps {
  gridSize: number;
  cellSize: number;
  zoom: number;
  pan: { x: number; y: number };
  /** Rendered board edge length (`gridSize * cellSize`). */
  total: number;
  style: MapStyle;
  /**
   * v0.10.8：行列前缀符号**只由主题给**（`.ruler.columnSymbol` / `rowSymbol`）。
   *
   * 地图草稿里同名两项不再参与渲染：符号是「这一套世界怎么念行与列」，与主题的
   * 识别色、难度分级同一层，同一主题下的几十张图不该各自填一遍。这里按编码查表，
   * 而不是让每个调用方各查一次再传进来 —— 四处调用点已经有六七个别名要传了。
   */
  themeCode: string | null | undefined;
  /** Cell under the pointer — its row / column turns dark grey. */
  hover?: CellCoord | null;
  /** Cell the operation cursor box is pinned to (editor only; `null` in preview). */
  operationCell?: CellCoord | null;
}

/**
 * v0.3.10 FEAT-F01: the two ruler strips, shared by the editor
 * (`EditorCanvas`) and the work preview (`WorkViewPage`) so both render the
 * exact same geometry.
 *
 * OPT-B05 §5: transparent, borderless, no blue / underline. The glyph state
 * machine is `buildRulerGlyphs` — the hovered row / column turns dark grey and
 * the operated one (editor only) additionally grows by
 * `RULER_ACTIVE_FONT_DELTA` px.
 *
 * The strips live **outside** the zoomed board wrapper, which is why the glyph
 * size is multiplied by `zoom` here (OPT-B03's only documented exception) and
 * why the strip itself is positioned from `pan` minus its own thickness.
 *
 * v0.7.0 (docs/v0.7.0.md §3): each strip's thin axis follows the board via
 * `rulerStripStart` — it hugs the board edge when the label fits between it and
 * the viewport edge, and otherwise pins inward so the label stays whole.
 *
 * v0.7.0 fix: the two thin axes are sized **independently** — the column strip
 * needs the glyph height (+ gap), the row strip additionally the label *width*
 * (`C24` ≈ 3 × 0.62em). Sharing one height-derived thickness left the row
 * labels clipped by the strip's own `overflow: hidden` at any real zoom.
 */
export function MapRulerStrips({
  gridSize,
  cellSize,
  zoom,
  pan,
  total,
  style,
  themeCode,
  hover = null,
  operationCell = null,
}: MapRulerStripsProps): JSX.Element {
  const rulerSymbolsOf = useRulerSymbolsByCode();
  const symbols = rulerSymbolsOf(themeCode);
  const rulerScale = cellScale(cellSize);
  const rulerGap = style.ruler.gap;
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  // v0.7.0 fix: the row strip's thin axis is horizontal — size it for the
  // widest label, not just the glyph height.
  // v0.10.8: 两轴的符号来自主题（默认 `C` / `R`，中文图可能用「列」「行」），
  // 所以取两者里更宽的那个来定条厚 —— 只按 `C` 算会把 `列24` 切掉半截。
  const rulerLabel = rulerLabelWidth(gridSize, rulerMaxFont, [
    symbols.columnSymbol,
    symbols.rowSymbol,
  ]);
  const columnStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: rulerGap });
  const rowStrip = rulerStripSize({
    maxFontSize: rulerMaxFont,
    gap: rulerGap,
    maxLabelWidth: rulerLabel,
  });

  const columns = useMemo(
    () =>
      buildRulerGlyphs({
        gridSize,
        axis: 'column',
        hoverIndex: hover?.x ?? null,
        operationIndex: operationCell?.x ?? null,
        scale: rulerScale,
        zoom,
        fontSize: style.ruler.fontSize,
        symbol: symbols.columnSymbol,
      }),
    [gridSize, hover?.x, operationCell?.x, rulerScale, zoom, style.ruler.fontSize, symbols.columnSymbol],
  );

  const rows = useMemo(
    () =>
      buildRulerGlyphs({
        gridSize,
        axis: 'row',
        hoverIndex: hover?.y ?? null,
        operationIndex: operationCell?.y ?? null,
        scale: rulerScale,
        zoom,
        fontSize: style.ruler.fontSize,
        symbol: symbols.rowSymbol,
      }),
    [gridSize, hover?.y, operationCell?.y, rulerScale, zoom, style.ruler.fontSize, symbols.rowSymbol],
  );

  return (
    <>
      {/* Column ruler — the glyphs are anchored to the strip's bottom edge with
          `paddingBottom: rulerGap`, so `gap` is exactly the text→board distance.

          FIX-N11 (docs/v0.5.3.md §6.4): `UI_Z.ruler` — the strips used to be
          `z-30`, above the 方格信息框's `z-20`, so dragging the canvas slid the
          ruler glyphs over the drawer. */}
      <div
        className="pointer-events-none absolute"
        style={{
          zIndex: UI_Z.ruler,
          left: pan.x,
          top: rulerStripStart(pan.y, columnStrip, rulerMaxFont, rulerGap),
          height: columnStrip,
          width: total * zoom,
          overflow: 'hidden',
        }}
      >
        {columns.map((glyph) => (
          <div
            key={`rul-col-${glyph.label}`}
            className="absolute top-0 flex h-full items-end justify-center"
            style={{
              left: glyph.index * cellSize * zoom,
              width: cellSize * zoom,
              paddingBottom: rulerGap,
              overflow: 'hidden',
            }}
          >
            <span
              className="whitespace-nowrap"
              style={{
                fontSize: glyph.fontSize,
                fontWeight: 600,
                lineHeight: 1,
                color: glyph.color,
              }}
            >
              {glyph.label}
            </span>
          </div>
        ))}
      </div>

      {/* Row ruler — the glyphs sit against the strip's right edge. */}
      <div
        className="pointer-events-none absolute"
        style={{
          zIndex: UI_Z.ruler,
          left: rulerStripStart(pan.x, rowStrip, rulerLabel, rulerGap),
          top: pan.y,
          width: rowStrip,
          height: total * zoom,
          overflow: 'hidden',
        }}
      >
        {rows.map((glyph) => (
          <div
            key={`rul-row-${glyph.label}`}
            className="absolute left-0 flex w-full items-center justify-end"
            style={{
              top: glyph.index * cellSize * zoom,
              height: cellSize * zoom,
              paddingRight: rulerGap,
              overflow: 'hidden',
            }}
          >
            <span
              className="whitespace-nowrap"
              style={{
                fontSize: glyph.fontSize,
                fontWeight: 600,
                lineHeight: 1,
                color: glyph.color,
              }}
            >
              {glyph.label}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
