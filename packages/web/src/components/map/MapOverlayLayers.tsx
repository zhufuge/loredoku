import type { CSSProperties } from 'react';
import {
  MAP_LAYER_Z,
  BLOCKING_SHADOW_COLOR,
  type CellCoord,
  type DraftRegion,
  type MapStyle,
} from '@loredoku/shared';
import { cellCursorShadow, operationCursorStyle } from '@/lib/canvasLayers';
import { cellScale, scaleFontSize } from '@/lib/canvasScale';
import { HIGHLIGHT_FADEOUT_MS, type HighlightState } from '@/lib/highlight';
import { styleLineWidth } from '@/lib/mapStyle';
import { computeLabelCell } from '@/lib/region';
import { cellRectStyle, parseKey } from './layerGeometry';
import { RegionHighlightOutline } from './MapRegionLayers';

/**
 * the overlay layers (cell decoration, cursor boxes, labels, linkage
 * highlight), split out of the old `MapLayers.tsx`.
 */

/**
 * 层 8 · 阻挡遮罩（Blocking Mask）— a `rgba(0,0,0,0.18)` mask for
 * cells whose item-layer item has `blocking === true`.
 *
 * v0.3.8 SPEC-D01: the mask sits **below** 区域轮廓线 and **above** 区域高亮线
 * (see `docs/layer-priority.md` §2). The artwork is above it, but every item
 * image keeps a transparent `itemPadding` ring, so the mask stays visible
 * around it. It is inset to the grid separator so it never paints over it.
 */
export function MapBlockingMaskLayer({
  blockingCells,
  cellSize,
  style,
}: {
  blockingCells: Set<string>;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (blockingCells.size === 0) return null;
  const inset = styleLineWidth(style.gridSeparator.width, cellSize) / 2;
  const size = Math.max(0, cellSize - inset * 2);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.blockingMask }}
    >
      {[...blockingCells].map((key) => {
        const [x, y] = parseKey(key);
        return (
          <div
            key={`nostand-${key}`}
            className="absolute"
            style={{
              left: x * cellSize + inset,
              top: y * cellSize + inset,
              width: size,
              height: size,
              backgroundColor: BLOCKING_SHADOW_COLOR,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * 层 1 · 鼠标光标框（Mouse Cursor Box）— follows the pointer and is always the
 * top-most element on the board. Width, colours and the shadow ring come from
 * `style.mouseCursorBox`.
 */
export function MapMouseCursorBoxLayer({
  cell,
  blocked,
  cellSize,
  style,
}: {
  cell: CellCoord | null;
  blocked: boolean;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.mouseCursorBox }}
    >
      <div
        className="absolute"
        style={{
          ...cellRectStyle(cell.x, cell.y, cellSize),
          boxShadow: cellCursorShadow(blocked, cellSize, style.mouseCursorBox, style.gridSeparator.width),
        }}
      />
    </div>
  );
}

/**
 * 层 2 · 操作光标框（Operation Cursor Box）— pinned to the clicked cell. Drawn
 * as an Outline outside the grid line, so when it shares a cell with the mouse
 * box the mouse line reads as the inner one.
 */
export function MapOperationCursorBoxLayer({
  cell,
  cellSize,
  style,
}: {
  cell: CellCoord | null;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.operationCursorBox }}
    >
      <div
        className="absolute"
        style={{
          ...cellRectStyle(cell.x, cell.y, cellSize),
          ...operationCursorStyle(cellSize, style.operationCursorBox),
        }}
      />
    </div>
  );
}

/**
 * 层 3 · 区域标签（Region Label）— the region name text, drawn above the
 * artwork with stroke + fill colours and a hover pair, all driven by
 * `style.regionLabel` (FEAT-D02).
 */
export function MapRegionLabelLayer({
  regions,
  cellSize,
  style,
  hoveredRegionId = null,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  cellSize: number;
  style: MapStyle;
  hoveredRegionId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}): JSX.Element {
  const label = style.regionLabel;
  const scale = cellScale(cellSize);
  const strokeWidth = styleLineWidth(label.strokeWidth, cellSize);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionLabel }}
    >
      {regions.map((region) => {
        const anchor = region.labelCell ?? computeLabelCell(region.cells);
        if (!anchor) return null;
        const hovered = hoveredRegionId === region.id;
        return (
          <button
            key={`label-${region.id}`}
            type="button"
            className="region-label pointer-events-auto absolute whitespace-nowrap"
            style={
              {
                left: (anchor[0] + 0.5) * cellSize,
                top: (anchor[1] + 1) * cellSize - 2,
                transform: 'translate(-50%, -100%)',
                color: hovered ? label.hoverColor : label.color,
                fontWeight: 700,
                fontSize: scaleFontSize(hovered ? label.hoverFontSize : label.fontSize, scale),
                lineHeight: 1.1,
                WebkitTextStroke: `${strokeWidth}px ${
                  hovered ? label.hoverStrokeColor : label.strokeColor
                }`,
                paintOrder: 'stroke fill',
                transition: 'font-size 120ms ease-out, -webkit-text-stroke-color 120ms ease-out',
              } as CSSProperties
            }
            onMouseEnter={() => onHover?.(region.id)}
            onMouseLeave={() => onHover?.(null)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect?.(region.id);
            }}
            title={region.name}
          >
            {region.name}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Highlight layer (OPT-903, updated by MOD-802 / FEAT-D02).
 *
 * CLAR-603: characters no longer occupy cells, so the layer only draws the
 * cell / background / region overlays; the roster panel handles the
 * `characters` outline directly.
 *
 * The three groups are rendered as separate z-indexed groups instead of one
 * wrapper — a wrapper with a `z-index` would form a stacking context and clip
 * its children's order.
 *
 * MOD-802: highlights are persistent (no auto-expiry). `leaving` applies the
 * 150ms fade-out when an activation ends.
 */
export function MapHighlightLayer({
  highlight,
  regions = [],
  cellSize,
  style,
  leaving = false,
}: {
  highlight: HighlightState | null;
  regions?: DraftRegion[];
  cellSize: number;
  style: MapStyle;
  /** MOD-802: fade the layer out over 150ms instead of unmounting instantly. */
  leaving?: boolean;
}): JSX.Element | null {
  if (!highlight) return null;
  const { cellHighlights, backgroundHighlights, regionBorders } = highlight;
  if (
    cellHighlights.length === 0 &&
    backgroundHighlights.length === 0 &&
    regionBorders.length === 0
  ) {
    return null;
  }
  const opacity = leaving ? 0 : 1;
  const transition = `opacity ${HIGHLIGHT_FADEOUT_MS}ms linear`;

  return (
    <>
      {/* 层 11 · 背景高亮 — only replaces the background layer. */}
      {backgroundHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.backgroundHighlight, opacity, transition }}
        >
          {backgroundHighlights.map((rect, index) => (
            <div
              key={`hl-bg-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{
                ...cellRectStyle(rect.x, rect.y, cellSize, rect.w, rect.h),
                backgroundColor: rect.color,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* 层 10 · 方块高亮 — opaque block covering the whole cell. */}
      {cellHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.cellHighlight, opacity, transition }}
        >
          {cellHighlights.map((rect, index) => (
            <div
              key={`hl-cell-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{
                ...cellRectStyle(rect.x, rect.y, cellSize, rect.w, rect.h),
                backgroundColor: rect.color,
              }}
            />
          ))}
        </div>
      ) : null}

      {/* 层 9 · 区域高亮线 — inner line hugging the region boundary. */}
      {regionBorders.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.regionHighlight, opacity, transition }}
        >
          {regionBorders.map((border) => {
            const region = regions.find((item) => item.id === border.regionId);
            if (!region) return null;
            return (
              <RegionHighlightOutline
                key={`hl-rb-${border.regionId}`}
                cells={region.cells}
                cellSize={cellSize}
                borderWidth={region.borderWidth}
                style={style}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}
