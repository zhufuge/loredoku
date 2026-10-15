import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  BORDER_WIDTH,
  LINE_COLOR,
  MAP_LAYER_Z,
  NO_STAND_SHADOW_COLOR,
  NO_STAND_SHADOW_Z,
  OBJECT_HOVER_LIFT_PX,
  OBJECT_HOVER_TRANSITION_MS,
  OUTLINE_WIDTH,
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
import { NO_STAND_SHADOW_INSET, OPERATION_CURSOR_STYLE, cellCursorShadow } from '@/lib/canvasLayers';

/**
 * OPT-A01 does not list the region *fill* (a v0.2.5 leftover), so it is
 * parked between 背景 (10) and 背景高亮 (9).
 */
const REGION_FILL_Z = MAP_LAYER_Z.background + 2;

function cellRectStyle(
  x: number,
  y: number,
  cellSize: number,
  w = 1,
  h = 1,
): CSSProperties {
  return {
    left: x * cellSize,
    top: y * cellSize,
    width: w * cellSize,
    height: h * cellSize,
  };
}

function parseKey(key: string): [number, number] {
  return key.split(',').map(Number) as [number, number];
}

/** OPT-A04 §3.3.2: a region outline, shared by hover and linkage borders. */
function RegionInnerBorder({
  cells,
  cellSize,
}: {
  cells: Array<[number, number]>;
  cellSize: number;
}): JSX.Element {
  const edges = buildRegionEdges(cells, cellSize);
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

/**
 * OPT-A04 §3.2.1 (docs/v0.3.5.md): every line in the grid is a **Border** and
 * adjacent cells share one — `n-1` internal separators plus a single outer
 * `Outline` rect, never four lines per cell (no double borders).
 */
export function MapGridLayer({
  gridSize,
  cellSize,
}: {
  gridSize: number;
  cellSize: number;
}): JSX.Element {
  const total = gridSize * cellSize;
  const lines: JSX.Element[] = [];
  for (let i = 1; i < gridSize; i += 1) {
    const pos = i * cellSize;
    lines.push(
      <line
        key={`grid-v-${i}`}
        x1={pos}
        y1={0}
        x2={pos}
        y2={total}
        stroke={LINE_COLOR}
        strokeWidth={BORDER_WIDTH}
      />,
      <line
        key={`grid-h-${i}`}
        x1={0}
        y1={pos}
        x2={total}
        y2={pos}
        stroke={LINE_COLOR}
        strokeWidth={BORDER_WIDTH}
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
        x={OUTLINE_WIDTH / 2}
        y={OUTLINE_WIDTH / 2}
        width={Math.max(0, total - OUTLINE_WIDTH)}
        height={Math.max(0, total - OUTLINE_WIDTH)}
        fill="none"
        stroke={LINE_COLOR}
        strokeWidth={OUTLINE_WIDTH}
      />
    </svg>
  );
}

/** Layer 10 · 背景. */
export function MapBackgroundLayer({
  cells,
  itemsById,
  cellSize,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
  cellSize: number;
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
              style={{ ...cellRectStyle(x, y, cellSize), zIndex: MAP_LAYER_Z.background }}
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
 * Layer 3 · 物体 — above the Border so items are never visually cut by the
 * grid lines; the image itself is still clipped inside its cells.
 *
 * OPT-902 §2.3: on hover the image stretches upward by
 * `OBJECT_HOVER_LIFT_PX` with a 120ms ease-out transition.
 */
export function MapObjectLayer({
  cells,
  itemsById,
  cellSize,
  interactive = false,
  hover = null,
  liftOnHover = true,
  onPointerDown,
  onClick,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
  cellSize: number;
  interactive?: boolean;
  hover?: CellCoord | null;
  /** OPT-902: disable when the caller renders its own hover affordance. */
  liftOnHover?: boolean;
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
                ...cellRectStyle(x, y, cellSize, anchor.w, anchor.h),
                zIndex: MAP_LAYER_Z.object,
                // The lift is allowed to poke past the cell edge while hovered.
                overflow: lifted ? 'visible' : 'hidden',
                pointerEvents: interactive ? 'auto' : 'none',
                cursor: interactive ? 'pointer' : 'inherit',
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
  cellSize,
}: {
  regions: DraftRegion[];
  gridSize: number;
  cellSize: number;
}): JSX.Element {
  const total = gridSize * cellSize;
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
            x={x * cellSize}
            y={y * cellSize}
            width={cellSize}
            height={cellSize}
            fill={region.color}
            fillOpacity={region.fillOpacity}
          />
        )),
      )}
    </svg>
  );
}

/**
 * Layer 5 · 区域边界线 — an OPT-A04 Border-type outline of the region's outer
 * contour, wider than the grid Border (`region.borderWidth`, default 6px vs
 * 2px) and drawn below it so the grid stays readable (§3.4 keeps the v0.3.4
 * order).
 *
 * §3.3.2: adjacent regions each draw their own outline, so a shared edge
 * renders both lines. Nothing is merged and no priority is applied — a
 * thicker junction is the expected result.
 */
export function MapRegionEdgeLayer({
  regions,
  gridSize,
  cellSize,
  selectedRegionId = null,
}: {
  regions: DraftRegion[];
  gridSize: number;
  cellSize: number;
  selectedRegionId?: string | null;
}): JSX.Element {
  const total = gridSize * cellSize;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.regionEdge }}
    >
      {regions.map((region) => {
        const selected = selectedRegionId === region.id;
        const edges = buildRegionEdges(region.cells, cellSize);
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
 * Layer 7 · 区域高亮线 — the pale blue 2px inner line shown while a region is
 * hovered (§2.2) or targeted by a linkage (§3).
 */
export function MapRegionHoverLayer({
  region,
  cellSize,
}: {
  region: DraftRegion | null;
  cellSize: number;
}): JSX.Element | null {
  if (!region) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionHighlight }}
    >
      <RegionInnerBorder cells={region.cells} cellSize={cellSize} />
    </div>
  );
}

/**
 * §3.1 · 不可站立物体阴影 — a `rgba(0,0,0,0.18)` mask (OPT-A03) drawn **above
 * the object artwork** and inset to the Border, so it tints the item without
 * hiding it (§7.3) and never paints over the Border ring itself.
 */
export function MapNoStandShadowLayer({
  noStandCells,
  cellSize,
}: {
  noStandCells: Set<string>;
  cellSize: number;
}): JSX.Element | null {
  if (noStandCells.size === 0) return null;
  const size = cellSize - NO_STAND_SHADOW_INSET * 2;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: NO_STAND_SHADOW_Z }}
    >
      {[...noStandCells].map((key) => {
        const [x, y] = parseKey(key);
        return (
          <div
            key={`nostand-${key}`}
            className="absolute"
            style={{
              left: x * cellSize + NO_STAND_SHADOW_INSET,
              top: y * cellSize + NO_STAND_SHADOW_INSET,
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
 * OPT-A05 §4.1 layer 1 · 鼠标提示框 — white (or pale red over a
 * non-standable object) and always the top-most element on the board.
 */
export function MapCellCursorLayer({
  cell,
  blocked,
  cellSize,
}: {
  cell: CellCoord | null;
  blocked: boolean;
  cellSize: number;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.cellCursor }}
    >
      <div
        className="absolute"
        style={{
          ...cellRectStyle(cell.x, cell.y, cellSize),
          boxShadow: cellCursorShadow(blocked),
        }}
      />
    </div>
  );
}

/**
 * OPT-A05 §4.1 layer 1（次高）· 操作提示框 — the pale blue Outline pinned to
 * the clicked cell. §4.3: drawn outside the Border, so when it shares a cell
 * with the mouse box the white line reads as the inner one.
 */
export function MapOperationCursorLayer({
  cell,
  cellSize,
}: {
  cell: CellCoord | null;
  cellSize: number;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.cellCursor }}
    >
      <div
        className="absolute"
        style={{ ...cellRectStyle(cell.x, cell.y, cellSize), ...OPERATION_CURSOR_STYLE }}
      />
    </div>
  );
}

export function MapRegionLabelLayer({
  regions,
  cellSize,
  hoveredRegionId = null,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  cellSize: number;
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
              left: (label[0] + 0.5) * cellSize,
              top: (label[1] + 1) * cellSize - 2,
              transform: 'translate(-50%, -100%)',
              color: REGION_LABEL_COLOR,
              fontWeight: 700,
              fontSize: hovered ? REGION_LABEL_HOVER_FONT_SIZE : REGION_LABEL_FONT_SIZE,
              lineHeight: 1.1,
              WebkitTextStroke: `${REGION_LABEL_STROKE_WIDTH}px ${
                hovered ? REGION_HIGHLIGHT_BORDER_COLOR : REGION_LABEL_STROKE_COLOR
              }`,
              paintOrder: 'stroke fill',
              transition: 'font-size 120ms ease-out, -webkit-text-stroke-color 120ms ease-out',
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
 * OPT-901 §1.1: 方块高亮 (layer 8) sits above 背景高亮 (layer 9) and both sit
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
  cellSize,
  leaving = false,
}: {
  highlight: HighlightState | null;
  regions?: DraftRegion[];
  cellSize: number;
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
      {/* Layer 9 · 背景高亮 — only replaces the background layer. */}
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

      {/* Layer 8 · 方块高亮 — opaque block covering the whole cell. */}
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

      {/* Layer 7 · 区域高亮线 — pale blue 2px inner line. */}
      {regionBorders.length > 0 ? (
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ zIndex: MAP_LAYER_Z.regionHighlight, opacity, transition }}
        >
          {regionBorders.map((border) => {
            const region = regions.find((item) => item.id === border.regionId);
            if (!region) return null;
            return (
              <RegionInnerBorder
                key={`hl-rb-${border.regionId}`}
                cells={region.cells}
                cellSize={cellSize}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}
