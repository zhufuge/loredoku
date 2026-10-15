import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  CELL_SIZE,
  GRID_BORDER_WIDTH,
  GRID_LINE_COLOR,
  GRID_LINE_WIDTH,
  type CellCoord,
  type DraftRegion,
  type Item,
} from '@murdoku/shared';
import { buildRegionEdges, computeLabelCell } from '@/lib/region';
import type { CellMap, HighlightState } from '@/lib/highlight';

const HOVER_RING = 'inset 0 0 0 2px #3B82F6';
/** MOD-709: region touch border colour. */
const REGION_TOUCH_BORDER_COLOR = '#3B82F6';

function cellRectStyle(x: number, y: number, w = 1, h = 1): CSSProperties {
  return {
    left: x * CELL_SIZE,
    top: y * CELL_SIZE,
    width: w * CELL_SIZE,
    height: h * CELL_SIZE,
  };
}

/** Grid: `n-1` inner separators plus a 3px outer border, drawn above content. */
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
      style={{ zIndex: 25 }}
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

export function MapBackgroundLayer({
  cells,
  itemsById,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
}): JSX.Element {
  return (
    <div className="no-drag pointer-events-none absolute left-0 top-0" style={{ zIndex: 5 }}>
      {[...cells.entries()]
        .filter(([, cell]) => cell.background)
        .map(([key, cell]) => {
          const item = itemsById.get(cell.background!.itemId);
          if (!item) return null;
          const [x, y] = key.split(',').map(Number) as [number, number];
          const src = item.imageThumbUrl ?? item.imageUrl;
          if (!src) return null;
          return (
            <div
              key={`bg-${key}`}
              className="absolute overflow-hidden"
              style={{ ...cellRectStyle(x, y), zIndex: 5 }}
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

export function MapObjectLayer({
  cells,
  itemsById,
  interactive = false,
  hover = null,
  glowKeys,
  onPointerDown,
  onClick,
}: {
  cells: CellMap;
  itemsById: Map<number, Item>;
  interactive?: boolean;
  hover?: CellCoord | null;
  glowKeys?: Set<string>;
  onPointerDown?: (coord: CellCoord) => void;
  onClick?: (coord: CellCoord, event: ReactMouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  return (
    <div className="no-drag pointer-events-none absolute left-0 top-0" style={{ zIndex: 12 }}>
      {[...cells.entries()]
        .filter(([, cell]) => cell.object)
        .map(([key, cell]) => {
          const anchor = cell.object!;
          const item = itemsById.get(anchor.itemId);
          const [x, y] = key.split(',').map(Number) as [number, number];
          const src = item?.imageThumbUrl ?? item?.imageUrl;
          if (!src) return null;
          const glow = glowKeys?.has(key) ?? false;
          const hovered =
            hover !== null &&
            hover.x >= x &&
            hover.x < x + anchor.w &&
            hover.y >= y &&
            hover.y < y + anchor.h;
          return (
            <div
              key={`obj-${key}`}
              className="absolute overflow-hidden"
              style={{
                ...cellRectStyle(x, y, anchor.w, anchor.h),
                zIndex: 12,
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
                style={{ objectFit: item?.fitMode === 'contain' ? 'contain' : 'cover' }}
              />
            </div>
          );
        })}
    </div>
  );
}

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
      style={{ zIndex: 8 }}
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

export function MapRegionEdgeLayer({
  regions,
  gridSize,
  hoveredRegionId = null,
  selectedRegionId = null,
}: {
  regions: DraftRegion[];
  gridSize: number;
  hoveredRegionId?: string | null;
  selectedRegionId?: string | null;
}): JSX.Element {
  const total = gridSize * CELL_SIZE;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: 15 }}
    >
      {regions.map((region) => {
        const highlighted = hoveredRegionId === region.id || selectedRegionId === region.id;
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
                strokeOpacity={highlighted ? 1 : 0.7}
                strokeWidth={highlighted ? region.borderWidth + 2 : region.borderWidth}
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

export function MapRegionLabelLayer({
  regions,
  onHover,
  onSelect,
}: {
  regions: DraftRegion[];
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}): JSX.Element {
  return (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 32 }}>
      {regions.map((region) => {
        const label = region.labelCell ?? computeLabelCell(region.cells);
        if (!label) return null;
        return (
          <button
            key={`label-${region.id}`}
            type="button"
            className="region-label pointer-events-auto absolute whitespace-nowrap"
            style={{
              left: (label[0] + 0.5) * CELL_SIZE,
              top: (label[1] + 1) * CELL_SIZE - 2,
              transform: 'translate(-50%, -100%)',
              color: '#FFFFFF',
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.1,
              WebkitTextStroke: '3px #000000',
              paintOrder: 'stroke fill',
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
 * Highlight layer: above items, below the grid lines
 * (docs/v0.3.0.md §2.2.4, updated by CLAR-603 §3.5, MOD-709).
 *
 * CLAR-603: characters no longer occupy cells, so the highlight layer only
 * draws the object / cell / region overlays. The roster panel handles the
 * `characters` outline directly.
 *
 * MOD-709: region touch targets render as an inner blue border line.
 */
export function MapHighlightLayer({
  highlight,
  regions = [],
}: {
  highlight: HighlightState | null;
  regions?: DraftRegion[];
}): JSX.Element | null {
  if (!highlight) return null;
  const { objects, cells, regionBorders } = highlight;
  if (objects.length === 0 && cells.length === 0 && regionBorders.length === 0) return null;
  return (
    <div
      className="highlight-fade pointer-events-none absolute left-0 top-0"
      style={{ zIndex: 22 }}
    >
      {cells.map((rect, index) => (
        <div
          key={`hl-cell-${rect.x}-${rect.y}-${index}`}
          className="absolute"
          style={{ ...cellRectStyle(rect.x, rect.y, rect.w, rect.h), backgroundColor: rect.color }}
        />
      ))}
      {objects.map((rect, index) => (
        <div
          key={`hl-obj-${rect.x}-${rect.y}-${index}`}
          className="absolute"
          style={{
            ...cellRectStyle(rect.x, rect.y, rect.w, rect.h),
            backgroundColor: rect.color,
            opacity: 0.45,
          }}
        />
      ))}
      {/* MOD-709: region touch → inner blue border */}
      {regionBorders.length > 0
        ? regionBorders.map((border) => {
            const region = regions.find((r) => r.id === border.regionId);
            if (!region) return null;
            const edges = buildRegionEdges(region.cells);
            return (
              <svg
                key={`hl-rb-${border.regionId}`}
                className="absolute left-0 top-0"
                style={{ overflow: 'visible', zIndex: 22 }}
              >
                {edges.map((edge, index) => (
                  <line
                    key={index}
                    x1={edge.x1 + 1}
                    y1={edge.y1 + 1}
                    x2={edge.x2 - (edge.x2 !== edge.x1 ? 1 : 0)}
                    y2={edge.y2 - (edge.y2 !== edge.y1 ? 1 : 0)}
                    stroke={REGION_TOUCH_BORDER_COLOR}
                    strokeWidth={2}
                    strokeOpacity={0.9}
                    strokeLinecap="round"
                  />
                ))}
              </svg>
            );
          })
        : null}
    </div>
  );
}
