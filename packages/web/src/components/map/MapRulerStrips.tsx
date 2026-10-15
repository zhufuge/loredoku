import { useMemo } from 'react';
import { RULER_ACTIVE_FONT_DELTA } from '@murdoku/shared';
import type { CellCoord } from '@murdoku/shared';
import type { MapStyle } from '@murdoku/shared';
import { buildRulerGlyphs, rulerStripSize } from '@/lib/ruler';
import { cellScale, scaleFontSize } from '@/lib/canvasScale';

export interface MapRulerStripsProps {
  gridSize: number;
  cellSize: number;
  zoom: number;
  pan: { x: number; y: number };
  /** Rendered board edge length (`gridSize * cellSize`). */
  total: number;
  style: MapStyle;
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
 */
export function MapRulerStrips({
  gridSize,
  cellSize,
  zoom,
  pan,
  total,
  style,
  hover = null,
  operationCell = null,
}: MapRulerStripsProps): JSX.Element {
  const rulerScale = cellScale(cellSize);
  const rulerGap = style.ruler.gap;
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: rulerGap });

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
      }),
    [gridSize, hover?.x, operationCell?.x, rulerScale, zoom, style.ruler.fontSize],
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
      }),
    [gridSize, hover?.y, operationCell?.y, rulerScale, zoom, style.ruler.fontSize],
  );

  return (
    <>
      {/* Column ruler — the glyphs are anchored to the strip's bottom edge with
          `paddingBottom: rulerGap`, so `gap` is exactly the text→board distance. */}
      <div
        className="pointer-events-none absolute z-30"
        style={{
          left: pan.x,
          top: pan.y - rulerStrip,
          height: rulerStrip,
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
        className="pointer-events-none absolute z-30"
        style={{
          left: pan.x - rulerStrip,
          top: pan.y,
          width: rulerStrip,
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
