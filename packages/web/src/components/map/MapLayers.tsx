import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  CELL_SIZE,
  GRID_BORDER_WIDTH,
  GRID_LINE_COLOR,
  GRID_LINE_WIDTH,
  MAP_LAYER_Z,
  NO_STAND_SHADOW_COLOR,
  OBJECT_HOVER_LIFT_PX,
  OBJECT_HOVER_TRANSITION_MS,
  REGION_HIGHLIGHT_BORDER_COLOR,
  REGION_HIGHLIGHT_BORDER_INSET,
  REGION_HIGHLIGHT_BORDER_WIDTH,
  REGION_LABEL_COLOR,
  REGION_LABEL_FONT_SIZE,
  REGION_LABEL_HOVER_FONT_SIZE,
  REGION_LABEL_STROKE_COLOR,
  REGION_LABEL_STROKE_WIDTH,
  type CellCoord,
  type DraftRegion,
  type Item,
} from '@murdoku/shared';
import { buildRegionEdges, computeLabelCell } from '@/lib/region';
import { HIGHLIGHT_FADEOUT_MS, type CellMap, type HighlightState } from '@/lib/highlight';
import { NO_STAND_SHADOW_INSET, cellCursorShadow } from '@/lib/canvasLayers';

const HOVER_RING = 'inset 0 0 0 2px #3B82F6';

/**
 * OPT-901 §1.1 does not list the region *fill* (a v0.2.5 leftover), so it is
 * parked between 背景 (10) and 背景高亮 (9).
 */
const REGION_FILL_Z = MAP_LAYER_Z.background + 2;

function cellRectStyle(x: number, y: number, w = 1, h = 1): CSSProperties {
  return {
    left: x * CELL_SIZE,
    top: y * CELL_SIZE,
    width: w * CELL_SIZE,
    height: h * CELL_SIZE,
  };
}

function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}

/** OPT-901 §1.2.4: one region edge set, shared by hover and linkage borders. */
function RegionInnerBorder({ cells }: { cells: Array<[number, number]> }): JSX.Element {
  const edges = buildRegionEdges(cells);
  const inset = REGION_HIGHLIGHT_BORDER_INSET;
  return (
    <svg className="absolute left-0 top-0" style={{ overflow: 'visible' }}>
      {edges.map((edge, index) => (
        <line
          key={index}
          x1={edge.x1 + inset}
          y1={edge.y1 + inset}
          x2={edge.x2 - (edge.x2 !== edge.x1 ? inset : 0)}
          y2={edge.y2 - (edge.y2 !== edge.y1 ? inset : 0)}
          stroke={REGION_HIGHLIGHT_BORDER_COLOR}
          strokeWidth={REGION_HIGHLIGHT_BORDER_WIDTH}
          strokeOpacity={0.9}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

/** Grid: `n-1` inner separators plus a 3px outer border (layer 4 · Border). */
export function MapGridLayer({ gridSize }: { gridSize: number }): JSX.Element {
  const total = gridSize * CELL_SIZE;
  const lines: JSX.Element[] = [];
  for (let i = 1; i < gridSize; i += 1) {
    const pos = i * CELL_SIZE;
    lines.push(
      <line
        key={`grid-v-${i}`}
        x1={pos}
        y1={0}
        x2={pos}
        y2={total}
        stroke={GRID_LINE_COLOR}
        strokeWidth={GRID_LINE_WIDTH}
      />,
      <line
        key={`grid-h-${i}`}
        x1={0}
        y1={pos}
        x2={total}
        y2={pos}
        stroke={GRID_LINE_COLOR}
        strokeWidth={GRID_LINE_WIDTH}
      />,
    );
  }
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.gridBorder }}
    >
      {lines}
      <rect
        x={GRID_BORDER_WIDTH / 2}
        y={GRID_BORDER_WIDTH / 2}
        width={Math.max(0, total - GRID_BORDER_WIDTH)}
        height={Math.max(0, total - GRID_BORDER_WIDTH)}
        fill="none"
        stroke={GRID_LINE_COLOR}
        strokeWidth={GRID_BORDER_WIDTH}
      />
    </svg>
  );
}

/** OPT-901 layer 10 · 背景. */
export function MapBackgroundLayer({
  cells,
  itemsById,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.background }}
    >
      {[...cells.entries()]
        .filter(([, cell]) => cell.background)
        .map(([key, cell]) => {
          const item = itemsById.get(cell.background!.itemId);
          if (!item) return null;
          const [x, y] = parseKey(key);
          const src = item.imageThumbUrl ?? item.imageUrl;
          if (!src) return null;
          return (
            <div
              key={`bg-${key}`}
              className="absolute overflow-hidden"
              style={{ ...cellRectStyle(x, y), zIndex: MAP_LAYER_Z.background }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="block h-full w-full"
                style={{ objectFit: item.fitMode === 'contain' ? 'contain' : 'cover' }}
              />
            </div>
          );
        })}
    </div>
  );
}

/**
 * OPT-901 layer 3 · 物体 — above the Border so items are never visually cut
 * by the grid lines; the image itself is still clipped inside its cells.
 *
 * OPT-902 §2.3: on hover the image stretches upward by
 * `OBJECT_HOVER_LIFT_PX` with a 120ms ease-out transition.
 */
export function MapObjectLayer({
  cells,
  itemsById,
  interactive = false,
  hover = null,
  liftOnHover = true,
  glowKeys,
  onPointerDown,
  onClick,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
  interactive?: boolean;
  hover?: CellCoord | null;
  /** OPT-902: disable when the caller renders its own hover affordance. */
  liftOnHover?: boolean;
  glowKeys?: Set<string>;
  onPointerDown?: (coord: CellCoord) => void;
  onClick?: (coord: CellCoord, event: ReactMouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.object }}
    >
      {[...cells.entries()]
        .filter(([, cell]) => cell.object)
        .map(([key, cell]) => {
          const anchor = cell.object!;
          const item = itemsById.get(anchor.itemId);
          const [x, y] = parseKey(key);
          const src = item?.imageThumbUrl ?? item?.imageUrl;
          if (!src) return null;
          const glow = glowKeys?.has(key) ?? false;
          const hovered =
            hover !== null &&
            hover.x >= x &&
            hover.x < x + anchor.w &&
            hover.y >= y &&
            hover.y < y + anchor.h;
          const lifted = hovered && liftOnHover;
          return (
            <div
              key={`obj-${key}`}
              className="absolute"
              style={{
                ...cellRectStyle(x, y, anchor.w, anchor.h),
                zIndex: MAP_LAYER_Z.object,
                // The lift is allowed to poke past the cell edge while hovered.
                overflow: lifted ? 'visible' : 'hidden',
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? 'pointer' : 'inherit',
                boxShadow: hovered && interactive ? HOVER_RING : undefined,
                filter: glow ? 'drop-shadow(0 0 4px #93C5FD)' : undefined,
              }}
              title={item?.name ?? undefined}
              onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
                if (!interactive) return;
                event.stopPropagation();
                onPointerDown?.({ x, y });
              }}
              onClick={(event) => {
                if (!interactive) return;
                event.stopPropagation();
                onClick?.({ x, y }, event);
              }}
            >
              <img
                src={src}
                alt=""
                draggable={false}
                className="block h-full w-full"
                style={{
                  objectFit: item?.fitMode === 'contain' ? 'contain' : 'cover',
                  transform: lifted ? `translateY(-${OBJECT_HOVER_LIFT_PX}px)` : undefined,
                  transition: `transform ${OBJECT_HOVER_TRANSITION_MS}ms ease-out`,
                }}
              />
            </div>
          );
        })}
    </div>
  );
}

/** Region colour fill — see `REGION_FILL_Z`. */
export function MapRegionFillLayer({
  regions,
  gridSize,
}: {
  regions: DraftRegion[];
  gridSize: number;
}): JSX.Element {
  const total = gridSize * CELL_SIZE;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: REGION_FILL_Z }}
    >
      {regions.flatMap((region) =>
        region.cells.map(([x, y]) => (
          <rect
            key={`${region.id}-${x}-${y}`}
            x={x * CELL_SIZE}
            y={y * CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={region.color}
            fillOpacity={region.fillOpacity}
          />
        )),
      )}
    </svg>
  );
}

/**
 * OPT-901 layer 5 · 区域边界线 — below the Border so the grid lines stay
 * readable, and wider than them (`region.borderWidth`, default 6px vs 2px).
 *
 * §1.2.4: adjacent regions each draw their own outline, so a shared edge
 * renders both lines. Nothing is merged and no priority is applied — a
 * thicker junction is the expected result.
 */
export function MapRegionEdgeLayer({
  regions,
  gridSize,
  selectedRegionId = null,
}: {
  regions: DraftRegion[];
  gridSize: number;
  selectedRegionId?: string | null;
}): JSX.Element {
  const total = gridSize * CELL_SIZE;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.regionEdge }}
    >
      {regions.map((region) => {
        const selected = selectedRegionId === region.id;
        const edges = buildRegionEdges(region.cells);
        return (
          <g key={region.id}>
            {edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={region.color}
                strokeOpacity={1}
                strokeWidth={selected ? region.borderWidth + 2 : region.borderWidth}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * OPT-901 layer 7 · 区域高亮线 — the blue 2px inner line shown while a region
 * is hovered (§2.2) or targeted by a linkage (§3).
 */
export function MapRegionHoverLayer({
  region,
}: {
  region: DraftRegion | null;
}): JSX.Element | null {
  if (!region) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionHighlight }}
    >
      <RegionInnerBorder cells={region.cells} />
    </div>
  );
}

/**
 * OPT-901 layer 6 · 不可站立物体阴影 — a `rgba(0,0,0,0.08)` mask inset to the
 * Border, drawn above the object image while staying below the Border.
 */
export function MapNoStandShadowLayer({
  noStandCells,
}: {
  noStandCells: Set<string>;
}): JSX.Element | null {
  if (noStandCells.size === 0) return null;
  const size = CELL_SIZE - NO_STAND_SHADOW_INSET * 2;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.noStandShadow }}
    >
      {[...noStandCells].map((key) => {
        const [x, y] = parseKey(key);
        return (
          <div
            key={`nostand-${key}`}
            className="absolute"
            style={{
              left: x * CELL_SIZE + NO_STAND_SHADOW_INSET,
              top: y * CELL_SIZE + NO_STAND_SHADOW_INSET,
              width: size,
              height: size,
              backgroundColor: NO_STAND_SHADOW_COLOR,
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * OPT-901 layer 1 · 当前方格辅助提示框 — the top-most element on the board
 * (§2.1). White when the cell is free, medium red when it holds a
 * non-standable object.
 */
export function MapCellCursorLayer({
  cell,
  blocked,
}: {
  cell: CellCoord | null;
  blocked: boolean;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.cellCursor }}
    >
      <div
        className="absolute"
        style={{ ...cellRectStyle(cell.x, cell.y), boxShadow: cellCursorShadow(blocked) }}
      />
    </div>
  );
}

export function MapRegionLabelLayer({
  regions,
  hoveredRegionId = null,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  hoveredRegionId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}): JSX.Element {
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionLabel }}
    >
      {regions.map((region) => {
        const label = region.labelCell ?? computeLabelCell(region.cells);
        if (!label) return null;
        const hovered = hoveredRegionId === region.id;
        return (
          <button
            key={`label-${region.id}`}
            type="button"
            className="region-label pointer-events-auto absolute whitespace-nowrap"
            style={{
              left: (label[0] + 0.5) * CELL_SIZE,
              top: (label[1] + 1) * CELL_SIZE - 2,
              transform: 'translate(-50%, -100%)',
              color: REGION_LABEL_COLOR,
              fontWeight: 700,
              fontSize: hovered ? REGION_LABEL_HOVER_FONT_SIZE : REGION_LABEL_FONT_SIZE,
              lineHeight: 1.1,
              WebkitTextStroke: `${REGION_LABEL_STROKE_WIDTH}px ${
                hovered ? REGION_HIGHLIGHT_BORDER_COLOR : REGION_LABEL_STROKE_COLOR
              }`,
              paintOrder: 'stroke fill',
              transition: `font-size 120ms ease-out, -webkit-text-stroke-color 120ms ease-out`,
            } as CSSProperties}
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
 * Highlight layer (OPT-903, updated by MOD-802).
 *
 * CLAR-603: characters no longer occupy cells, so the layer only draws the
 * cell / background / region overlays; the roster panel handles the
 * `characters` outline directly.
 *
 * OPT-903 §1.1: 方块高亮 (layer 8) sits above 背景高亮 (layer 9) and both sit
 * under 区域高亮线 (layer 7), so the three groups are rendered as separate
 * z-indexed groups instead of one wrapper (a wrapper with a `z-index` would
 * clip its children's stacking order).
 *
 * MOD-802: highlights are persistent (no auto-expiry). `leaving` applies the
 * 150ms fade-out when an activation ends. Region highlights are always an
 * inner blue border (click and hover render identically).
 */
export function MapHighlightLayer({
  highlight,
  regions = [],
  leaving = false,
}: {
  highlight: HighlightState | null;
  regions?: DraftRegion[];
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
      {/* OPT-901 layer 9 · 背景高亮 — only replaces the background layer. */}
      {backgroundHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.backgroundHighlight, opacity, transition }}
        >
          {backgroundHighlights.map((rect, index) => (
            <div
              key={`hl-bg-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{ ...cellRectStyle(rect.x, rect.y, rect.w, rect.h), backgroundColor: rect.color }}
            />
          ))}
        </div>
      ) : null}

      {/* OPT-901 layer 8 · 方块高亮 — opaque block covering the whole cell. */}
      {cellHighlights.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.cellHighlight, opacity, transition }}
        >
          {cellHighlights.map((rect, index) => (
            <div
              key={`hl-cell-${rect.x}-${rect.y}-${index}`}
              className="absolute"
              style={{ ...cellRectStyle(rect.x, rect.y, rect.w, rect.h), backgroundColor: rect.color }}
            />
          ))}
        </div>
      ) : null}

      {/* OPT-901 layer 7 · 区域高亮线 — blue 2px inner line. */}
      {regionBorders.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.regionHighlight, opacity, transition }}
        >
          {regionBorders.map((border) => {
            const region = regions.find((item) => item.id === border.regionId);
            if (!region) return null;
            return <RegionInnerBorder key={`hl-rb-${border.regionId}`} cells={region.cells} />;
          })}
        </div>
      ) : null}
    </>
  );
}
