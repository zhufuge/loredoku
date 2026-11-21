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
  /** 行列前缀符号**只由主题给**；地图草稿同名项不参与渲染。 */
  themeCode: string | null | undefined;
  /** Cell under the pointer — its row / column turns dark grey. */
  hover?: CellCoord | null;
  /** Cell the operation cursor box is pinned to (editor only; `null` in preview). */
  operationCell?: CellCoord | null;
}

/** 编辑画布与作品预览共用此几何；条在缩放棋盘外，故字号×`zoom`（OPT-B03 唯一例外），位置由 `pan` 减条厚。 */
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
  // 行条厚度按两轴符号里更宽的算 —— 只按 `C` 算会把 `列24` 切掉半截。
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
