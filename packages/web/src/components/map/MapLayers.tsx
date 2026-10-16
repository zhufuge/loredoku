import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  GAME_FORBIDDEN_FONT_RATIO,
  GAME_NUMBER_FONT_RATIO,
  GAME_NUMBER_STROKE_RATIO,
  GAME_TOOL_HINT_ERASER_COLOR,
  GAME_TOOL_HINT_FORBIDDEN_COLOR,
  MAP_LAYER_Z,
  NO_STAND_SHADOW_COLOR,
  OBJECT_HOVER_LIFT_PX,
  OBJECT_HOVER_TRANSITION_MS,
  REGION_FILL_Z,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type DraftRegion,
  type Item,
  type MapStyle,
} from '@murdoku/shared';
import type { CellPlacement, GamePlacementBoard } from '@murdoku/shared';
import { buildRegionEdges, buildRegionHighlightPaths, computeLabelCell } from '@/lib/region';
import { HIGHLIGHT_FADEOUT_MS, type CellMap, type HighlightState } from '@/lib/highlight';
import { styleLineWidth } from '@/lib/mapStyle';
import { cellCursorShadow, operationCursorStyle } from '@/lib/canvasLayers';
import { cellScale, scaleFontSize, objectPadding } from '@/lib/canvasScale';
import { numberSlotAnchor, type GameToolHint } from '@/lib/gamePlacement';

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

/**
 * OPT-B01 (docs/v0.3.6.md §1): the highlight hugs the **inner** side of the
 * region boundary and grows inwards, never covering it. The boundary itself
 * is a `borderWidth × scale` stroke centred on the contour, so it eats
 * `borderWidth × scale / 2` into the region; the highlight starts exactly
 * there.
 */
function regionHighlightInset(borderWidth: number, cellSize: number, highlightWidth: number): number {
  return (
    styleLineWidth(borderWidth, cellSize) / 2 + styleLineWidth(highlightWidth, cellSize) / 2
  );
}

/**
 * 区域高亮线（Region Highlight）— FIX-E02 (docs/v0.3.9.md §2).
 *
 * The outline is produced by `buildRegionHighlightPaths`, which traces the
 * region's closed rectilinear contour and offsets each supporting line inward
 * by `inset`. Rendering one closed `<path>` per loop is what makes the highlight
 * **continuous**: the v0.3.8 implementation drew one independently inset
 * segment per cell edge, leaving a gap at every cell boundary and every
 * concave corner.
 */
function RegionHighlightOutline({
  cells,
  cellSize,
  borderWidth,
  style,
}: {
  cells: Array<[number, number]>;
  cellSize: number;
  /** The region's own `borderWidth`; the highlight nests inside it. */
  borderWidth: number;
  style: MapStyle;
}): JSX.Element {
  const inset = regionHighlightInset(borderWidth, cellSize, style.regionHighlight.width);
  const paths = buildRegionHighlightPaths(cells, cellSize, inset);
  const width = styleLineWidth(style.regionHighlight.width, cellSize);
  return (
    <svg className="absolute left-0 top-0" style={{ overflow: 'visible' }}>
      {paths.map((path, index) => (
        <path
          key={index}
          d={path.d}
          fill="none"
          stroke={style.regionHighlight.color}
          strokeWidth={width}
          strokeOpacity={0.9}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
      ))}
    </svg>
  );
}

/**
 * 层 6 · 网格分隔线（Grid Separator）: adjacent cells **share** one separator,
 * so an `n × n` board draws `n-1` lines per axis — never four lines per cell.
 * The board outline is a separate layer (see {@link MapCanvasFrameLayer}).
 *
 * Width and colour come from `style.gridSeparator` (v0.3.8 FEAT-D02); the
 * width is a base value and is still multiplied by `cellSize / BASE_CELL`.
 */
export function MapGridSeparatorLayer({
  gridSize,
  cellSize,
  style,
}: {
  gridSize: number;
  cellSize: number;
  style: MapStyle;
}): JSX.Element {
  const total = gridSize * cellSize;
  const width = styleLineWidth(style.gridSeparator.width, cellSize);
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
        stroke={style.gridSeparator.color}
        strokeWidth={width}
      />,
      <line
        key={`grid-h-${i}`}
        x1={0}
        y1={pos}
        x2={total}
        y2={pos}
        stroke={style.gridSeparator.color}
        strokeWidth={width}
      />,
    );
  }
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.gridSeparator }}
    >
      {lines}
    </svg>
  );
}

/**
 * 层 5 · 画布外框（Canvas Frame）: the board's outermost frame, drawn fully
 * **outside** the board rectangle so no item or highlight layer can overlap it
 * — which is why the stroke is offset by half its width (the SVG needs
 * `overflow: visible` for that).
 *
 * This is the outer frame only; the lines *between* cells are 网格分隔线
 * ({@link MapGridSeparatorLayer}). Width and colour come from
 * `style.canvasFrame`.
 */
export function MapCanvasFrameLayer({
  gridSize,
  cellSize,
  style,
}: {
  gridSize: number;
  cellSize: number;
  style: MapStyle;
}): JSX.Element {
  const total = gridSize * cellSize;
  const width = styleLineWidth(style.canvasFrame.width, cellSize);
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ overflow: 'visible', zIndex: MAP_LAYER_Z.canvasFrame }}
    >
      <rect
        x={0}
        y={0}
        width={total}
        height={total}
        fill="none"
        stroke={style.canvasFrame.color}
        strokeWidth={width}
        style={{ transform: `translate(${-width / 2}px, ${-width / 2}px)` }}
      />
    </svg>
  );
}

/** 层 12 · 背景图层（Background Layer）— artwork filling the whole cell. */
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
      style={{ zIndex: MAP_LAYER_Z.backgroundLayer }}
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
              style={{ ...cellRectStyle(x, y, cellSize), zIndex: MAP_LAYER_Z.backgroundLayer }}
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
 * 层 4 · 物件图层（Object Layer）— above the grid separators so items are
 * never visually cut by them; the image itself is still clipped inside its
 * cells.
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
  padding = 4,
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
  /** OPT-C06: artwork inset in px; the editor passes the scaled value. */
  padding?: number;
  onPointerDown?: (coord: CellCoord) => void;
  onClick?: (coord: CellCoord, event: ReactMouseEvent<HTMLDivElement>) => void;
}): JSX.Element {
  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.objectLayer }}
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
                zIndex: MAP_LAYER_Z.objectLayer,
                // The lift is allowed to poke past the cell edge while hovered.
                overflow: lifted ? 'visible' : 'hidden',
                // OPT-C06: the padding applies to the whole footprint, not per cell.
                padding,
                boxSizing: 'border-box',
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
                  // OPT-C06: the item's own fitMode is preserved, never forced.
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

/** Region colour fill — see `REGION_FILL_Z` (docs/layer-priority.md §1). */
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
 * 层 7 · 区域轮廓线（Region Outline）— the region's outer contour, wider than a
 * grid separator (`region.borderWidth`, 4 ~ 12px) and drawn below it so the
 * grid stays readable.
 *
 * v0.3.8 FEAT-D02: the **colour** comes from the map style
 * (`style.regionOutline.color`), so one setting tunes every region; the
 * **width** stays per-region and is initialised from `style.regionOutline.width`.
 *
 * Adjacent regions each draw their own outline, so a shared edge renders both
 * lines. Nothing is merged and no priority is applied — a thicker junction is
 * the expected result.
 */
export function MapRegionOutlineLayer({
  regions,
  gridSize,
  cellSize,
  style,
  selectedRegionId = null,
}: {
  regions: DraftRegion[];
  gridSize: number;
  cellSize: number;
  style: MapStyle;
  selectedRegionId?: string | null;
}): JSX.Element {
  const total = gridSize * cellSize;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      width={total}
      height={total}
      style={{ zIndex: MAP_LAYER_Z.regionOutline }}
    >
      {regions.map((region) => {
        const selected = selectedRegionId === region.id;
        const edges = buildRegionEdges(region.cells, cellSize);
        const width = styleLineWidth(region.borderWidth + (selected ? 2 : 0), cellSize);
        return (
          <g key={region.id}>
            {edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
                stroke={style.regionOutline.color}
                strokeOpacity={1}
                strokeWidth={width}
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
 * 层 9 · 区域高亮线（Region Highlight）— the inner highlight shown while a
 * region is hovered or targeted by a linkage. Geometry comes from
 * {@link RegionHighlightOutline}, so the outline is always continuous.
 */
export function MapRegionHighlightLayer({
  region,
  cellSize,
  style,
}: {
  region: DraftRegion | null;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (!region) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionHighlight }}
    >
      <RegionHighlightOutline
        cells={region.cells}
        cellSize={cellSize}
        borderWidth={region.borderWidth}
        style={style}
      />
    </div>
  );
}

/**
 * 层 8 · 不可站立遮罩（Non-standable Mask）— a `rgba(0,0,0,0.18)` mask for
 * cells whose object-layer item has `canStand === false`.
 *
 * v0.3.8 SPEC-D01: the mask sits **below** 区域轮廓线 and **above** 区域高亮线
 * (see `docs/layer-priority.md` §2). The artwork is above it, but every object
 * image keeps a transparent `objectPadding` ring, so the mask stays visible
 * around it. It is inset to the grid separator so it never paints over it.
 */
export function MapNonStandableMaskLayer({
  noStandCells,
  cellSize,
  style,
}: {
  noStandCells: Set<string>;
  cellSize: number;
  style: MapStyle;
}): JSX.Element | null {
  if (noStandCells.size === 0) return null;
  const inset = styleLineWidth(style.gridSeparator.width, cellSize) / 2;
  const size = Math.max(0, cellSize - inset * 2);
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.nonStandableMask }}
    >
      {[...noStandCells].map((key) => {
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
              backgroundColor: NO_STAND_SHADOW_COLOR,
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
            style={{
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
 * 层 4 · 工具提示层（Game Tool Hint Layer）— SPEC-G02 (docs/v0.4.0.md §8).
 *
 * The pointer-following preview of what the current operation mode would do to
 * the hovered cell: a participant number (9-grid slot 1), the forbidden `×`, or
 * the eraser. It is cleared the moment the pointer leaves the cell — that part
 * is the page's job, this layer only ever draws what it is handed.
 *
 * The layer never receives pointer events, and it survives a completed
 * placement: the hint and the placement layer are independent (SPEC-G02 §3).
 */
export function MapGameToolHintLayer({
  hint,
  cell,
  cellSize,
  themeColors,
}: {
  hint: GameToolHint | null;
  cell: CellCoord | null;
  cellSize: number;
  /** Slot index → theme colour, for the number glyph. */
  themeColors: Map<number, string>;
}): JSX.Element | null {
  if (!hint || !cell) return null;
  const total = cellSize;
  const glyph = ((): JSX.Element => {
    if (hint.kind === 'number') {
      const fontSize = cellSize * GAME_NUMBER_FONT_RATIO;
      const anchor = numberSlotAnchor(0);
      return (
        <text
          x={anchor.x * total}
          y={anchor.y * total}
          fill={themeColors.get(hint.participantId) ?? '#000000'}
          stroke="#000000"
          strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
          paintOrder="stroke fill"
          fontSize={fontSize}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {hint.participantId}
        </text>
      );
    }
    if (hint.kind === 'forbidden') {
      const fontSize = cellSize * GAME_FORBIDDEN_FONT_RATIO;
      return (
        <text
          x={total / 2}
          y={total / 2}
          fill={GAME_TOOL_HINT_FORBIDDEN_COLOR}
          stroke="#000000"
          strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
          paintOrder="stroke fill"
          fontSize={fontSize}
          fontWeight={800}
          textAnchor="middle"
          dominantBaseline="central"
        >
          ×
        </text>
      );
    }
    // Eraser: a tilted rounded body with a metal ferrule (SPEC-G02 §5).
    const size = total * 0.42;
    const cx = total / 2;
    const cy = total / 2;
    return (
      <g transform={`rotate(-45 ${cx} ${cy})`}>
        <rect
          x={cx - size / 2}
          y={cy - size * 0.28}
          width={size}
          height={size * 0.56}
          rx={size * 0.12}
          fill={GAME_TOOL_HINT_ERASER_COLOR}
          stroke="#000000"
          strokeWidth={Math.max(1, size * 0.06)}
        />
        <rect
          x={cx - size * 0.18}
          y={cy - size * 0.28}
          width={size * 0.36}
          height={size * 0.56}
          fill="#9CA3AF"
          stroke="#000000"
          strokeWidth={Math.max(1, size * 0.05)}
        />
      </g>
    );
  })();
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.gameToolHint }}
    >
      <svg
        className="absolute left-0 top-0"
        width={total}
        height={total}
        style={{ left: cell.x * cellSize, top: cell.y * cellSize, overflow: 'visible' }}
      >
        {glyph}
      </svg>
    </div>
  );
}

/**
 * 层 5 · 游戏放置层（Game Placement Layer）— SPEC-G01 (docs/v0.4.0.md §7).
 *
 * What the player has placed: participant avatars, the 3×3 number grid, and
 * the forbidden `×`. One cell holds exactly one of the three forms (or
 * nothing); a cell with two or more participants hides its avatar and shows
 * the numbers instead, so the two never overlap.
 *
 * The layer is inert — every interaction is dispatched by the board container.
 */
export function MapGamePlacementLayer({
  board,
  slots,
  charactersById,
  cellSize,
}: {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cellSize: number;
}): JSX.Element | null {
  const entries = Object.entries(board).filter(([, placement]) => placement !== null && placement !== undefined);
  if (entries.length === 0) return null;
  const numberFontSize = cellSize * GAME_NUMBER_FONT_RATIO;
  const numberStroke = numberFontSize * GAME_NUMBER_STROKE_RATIO;
  const forbiddenFontSize = cellSize * GAME_FORBIDDEN_FONT_RATIO;
  const avatarPadding = objectPadding(cellSize);

  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.gamePlacement }}
    >
      {entries.map(([key, placement]) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        if (!placement) return null;
        return (
          <div
            key={`place-${key}`}
            className="absolute"
            style={{
              left: x * cellSize,
              top: y * cellSize,
              width: cellSize,
              height: cellSize,
            }}
          >
            {placement.kind === 'participant' ? (
              <ParticipantAvatar
                slot={slots[placement.index - 1] ?? null}
                charactersById={charactersById}
                padding={avatarPadding}
              />
            ) : null}

            {placement.kind === 'numbers' ? (
              <svg className="absolute left-0 top-0" width={cellSize} height={cellSize}>
                {placement.entries.map((participantId, index) => {
                  const anchor = numberSlotAnchor(index);
                  return (
                    <text
                      key={`num-${key}-${participantId}-${index}`}
                      x={anchor.x * cellSize}
                      y={anchor.y * cellSize}
                      fill={slots[participantId - 1]?.themeColor ?? '#000000'}
                      stroke="#000000"
                      strokeWidth={numberStroke}
                      paintOrder="stroke fill"
                      fontSize={numberFontSize}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {participantId}
                    </text>
                  );
                })}
              </svg>
            ) : null}

            {placement.kind === 'forbidden' ? (
              <svg className="absolute left-0 top-0" width={cellSize} height={cellSize}>
                <text
                  x={cellSize / 2}
                  y={cellSize / 2}
                  fill="#000000"
                  fontSize={forbiddenFontSize}
                  fontWeight={800}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  ×
                </text>
              </svg>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** SPEC-G01 §7.1: the participant picture, inset by the shared object padding. */
function ParticipantAvatar({
  slot,
  charactersById,
  padding,
}: {
  slot: CharacterSlotEntry | null;
  charactersById: Map<number, Character>;
  padding: number;
}): JSX.Element | null {
  const character = slot ? charactersById.get(slot.characterId) : undefined;
  const src = character?.avatarThumbUrl ?? character?.avatarUrl;
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="no-drag block h-full w-full"
      style={{ objectFit: 'cover', padding, boxSizing: 'border-box' }}
    />
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
