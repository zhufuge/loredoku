import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import {
  CELL_SIZE,
  GRID_BORDER_WIDTH,
  GRID_LINE_COLOR,
  GRID_LINE_WIDTH,
  type CellCoord,
  type Character,
  type DraftCell,
  type DraftRegion,
  type EditorTool,
  type Item,
  type PlacedCharacter,
  type RegionShape,
} from '@murdoku/shared';
import {
  buildRegionEdges,
  computeLabelCell,
  coordKey,
  rectCells,
  regionAt,
  type Coord,
} from '@/lib/region';
import {
  centerPan,
  clampZoom,
  clientToCell,
  DRAG_THRESHOLD,
  isInBounds,
  zoomAtPoint,
  ZOOM_STEP,
} from '@/lib/grid';
import type { Selection } from '@/stores/editorStore';

const RULER_SIZE = 28;

export interface EditorCanvasHandle {
  clientToCell: (clientX: number, clientY: number) => CellCoord;
  containsPoint: (clientX: number, clientY: number) => boolean;
  getRect: () => DOMRect | null;
  centerView: () => void;
}

interface EditorCanvasProps {
  gridSize: number;
  cells: Map<string, DraftCell>;
  itemsById: Map<number, Item>;
  regions: DraftRegion[];
  placedCharacters: PlacedCharacter[];
  charactersById: Map<number, Character>;
  selectedRegionId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  selection: Selection | null;
  activeTool: EditorTool;
  regionShape: RegionShape;
  spaceHeld: boolean;
  showRulers: boolean;
  pendingItem: Item | null;
  pendingCharacterId: number | null;
  regionDraftSelection: Set<string>;
  onSelect: (selection: Selection | null) => void;
  onSelectRegion: (id: string | null) => void;
  onSelectCharacter: (characterId: number, x: number, y: number) => void;
  onDraftToggle: (coord: CellCoord) => void;
  onDraftAdd: (cells: Coord[]) => void;
  onDraftRemove: (cells: Coord[]) => void;
  onDraftClear: () => void;
  onToggleRegionCell: (coord: CellCoord) => void;
  onPlaceItem: (coord: CellCoord) => void;
  onPlaceCharacter: (coord: CellCoord) => void;
  onMoveObject: (from: CellCoord, to: CellCoord) => void;
  onErase: (coord: CellCoord) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

interface MoveFootprint {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Interaction =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'move'; from: CellCoord; startX: number; startY: number; w: number; h: number }
  | { kind: 'erase'; last: string | null }
  | { kind: 'region-rect'; start: CellCoord; startX: number; startY: number; remove: boolean }
  | { kind: 'brush'; keys: Set<string>; erase: boolean }
  | null;

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  {
    gridSize,
    cells,
    itemsById,
    regions,
    placedCharacters,
    charactersById,
    selectedRegionId,
    zoom,
    pan,
    selection,
    activeTool,
    regionShape,
    spaceHeld,
    showRulers,
    pendingItem,
    pendingCharacterId,
    regionDraftSelection,
    onSelect,
    onSelectRegion,
    onSelectCharacter,
    onDraftToggle,
    onDraftAdd,
    onDraftRemove,
    onDraftClear,
    onToggleRegionCell,
    onPlaceItem,
    onPlaceCharacter,
    onMoveObject,
    onErase,
    onZoom,
    onPan,
  },
  ref,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction>(null);
  const userPannedRef = useRef(false);
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [marquee, setMarquee] = useState<{ start: CellCoord; end: CellCoord } | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveFootprint | null>(null);
  const [brushCells, setBrushCells] = useState<Coord[]>([]);
  const [hoveredRegionId, setHoveredRegionId] = useState<string | null>(null);

  const viewRef = useRef({ zoom, pan, onZoom, onPan });
  viewRef.current = { zoom, pan, onZoom, onPan };

  const total = gridSize * CELL_SIZE;

  const centerView = useCallback((): void => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    userPannedRef.current = false;
    viewRef.current.onZoom(1);
    viewRef.current.onPan(centerPan(rect, gridSize, 1));
  }, [gridSize]);

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord => {
      const node = containerRef.current;
      const rect = node ? node.getBoundingClientRect() : new DOMRect();
      return clientToCell(clientX, clientY, { rect, pan, zoom });
    },
    [pan, zoom],
  );

  const clampCell = useCallback(
    (coord: CellCoord): CellCoord => ({
      x: Math.min(gridSize - 1, Math.max(0, coord.x)),
      y: Math.min(gridSize - 1, Math.max(0, coord.y)),
    }),
    [gridSize],
  );

  useImperativeHandle(
    ref,
    () => ({
      clientToCell: toCell,
      containsPoint: (clientX, clientY) => {
        const node = containerRef.current;
        return node ? node.contains(document.elementFromPoint(clientX, clientY)) : false;
      },
      getRect: () => containerRef.current?.getBoundingClientRect() ?? null,
      centerView,
    }),
    [toCell, centerView],
  );

  useEffect(() => {
    if (userPannedRef.current) return;
    centerView();
  }, [centerView]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const handleWheel = (event: WheelEvent): void => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const view = viewRef.current;
      const direction = event.deltaY > 0 ? -1 : 1;
      const next = clampZoom(view.zoom + direction * ZOOM_STEP);
      if (next === view.zoom) return;
      userPannedRef.current = true;
      const rect = node.getBoundingClientRect();
      const nextPan = zoomAtPoint(
        { x: event.clientX, y: event.clientY },
        rect,
        view.pan,
        next,
        view.zoom,
      );
      view.onZoom(next);
      view.onPan(nextPan);
    };
    node.addEventListener('wheel', handleWheel, { passive: false });
    return () => node.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setBrushCells([]);
      interactionRef.current = null;
      onDraftClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDraftClear]);

  useEffect(() => {
    setBrushCells([]);
  }, [activeTool, regionShape]);

  const fits = (x: number, y: number, w: number, h: number): boolean =>
    x >= 0 && y >= 0 && x + w <= gridSize && y + h <= gridSize;

  const pendingFootprint = useMemo<{ w: number; h: number }>(() => {
    if (pendingItem && pendingItem.category === 'object') {
      return { w: pendingItem.widthCells, h: pendingItem.heightCells };
    }
    return { w: 1, h: 1 };
  }, [pendingItem]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const node = containerRef.current;
    if (!node) return;

    if (event.button === 1 || activeTool === 'pan' || spaceHeld) {
      event.preventDefault();
      node.setPointerCapture(event.pointerId);
      interactionRef.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    if (event.button !== 0) return;

    const coord = toCell(event.clientX, event.clientY);
    const inBounds = isInBounds(coord, gridSize);

    if (activeTool === 'region') {
      if (regionShape === 'brush') {
        if (!inBounds) return;
        node.setPointerCapture(event.pointerId);
        const key = coordKey(coord.x, coord.y);
        const keys = new Set<string>([key]);
        interactionRef.current = { kind: 'brush', keys, erase: event.altKey };
        setBrushCells(Array.from(keys).map((item) => item.split(',').map(Number) as Coord));
        return;
      }
      node.setPointerCapture(event.pointerId);
      const start = clampCell(coord);
      interactionRef.current = {
        kind: 'region-rect',
        start,
        startX: event.clientX,
        startY: event.clientY,
        remove: event.altKey,
      };
      setMarquee({ start, end: start });
      return;
    }

    if (!inBounds) {
      if (activeTool === 'select' || activeTool === 'character') {
        onSelect(null);
        onSelectRegion(null);
      }
      return;
    }

    if (activeTool === 'eraser') {
      node.setPointerCapture(event.pointerId);
      interactionRef.current = { kind: 'erase', last: `${coord.x},${coord.y}` };
      onErase(coord);
      return;
    }

    if (activeTool === 'select' || activeTool === 'character') {
      if (event.shiftKey && selectedRegionId) {
        onToggleRegionCell(coord);
        return;
      }
      if (pendingItem) {
        if (fits(coord.x, coord.y, pendingFootprint.w, pendingFootprint.h)) onPlaceItem(coord);
        return;
      }
      if (pendingCharacterId !== null) {
        onPlaceCharacter(coord);
        return;
      }
      const cell = cells.get(`${coord.x},${coord.y}`);
      if (cell?.object) {
        node.setPointerCapture(event.pointerId);
        interactionRef.current = {
          kind: 'move',
          from: coord,
          startX: event.clientX,
          startY: event.clientY,
          w: cell.object.w,
          h: cell.object.h,
        };
      } else {
        onSelect({ type: 'cell', x: coord.x, y: coord.y });
        onSelectRegion(regionAt(regions, coord.x, coord.y)?.id ?? null);
      }
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const coord = toCell(event.clientX, event.clientY);
    const inBounds = isInBounds(coord, gridSize);
    setHover((previous) =>
      previous && previous.x === coord.x && previous.y === coord.y
        ? previous
        : inBounds
          ? coord
          : null,
    );

    const interaction = interactionRef.current;
    if (!interaction) return;

    if (interaction.kind === 'pan') {
      userPannedRef.current = true;
      onPan({
        x: interaction.panX + (event.clientX - interaction.startX),
        y: interaction.panY + (event.clientY - interaction.startY),
      });
      return;
    }

    if (interaction.kind === 'erase') {
      if (inBounds) {
        const key = `${coord.x},${coord.y}`;
        if (key !== interaction.last) {
          interaction.last = key;
          onErase(coord);
        }
      }
      return;
    }

    if (interaction.kind === 'region-rect') {
      setMarquee((previous) =>
        previous && previous.end.x === coord.x && previous.end.y === coord.y
          ? previous
          : { start: interaction.start, end: clampCell(coord) },
      );
      return;
    }

    if (interaction.kind === 'brush') {
      if (!inBounds) return;
      const key = coordKey(coord.x, coord.y);
      interaction.keys.add(key);
      setBrushCells(Array.from(interaction.keys).map((item) => item.split(',').map(Number) as Coord));
      return;
    }

    if (interaction.kind === 'move') {
      const distance = Math.hypot(
        event.clientX - interaction.startX,
        event.clientY - interaction.startY,
      );
      if (distance > DRAG_THRESHOLD) {
        setMoveTarget(
          fits(coord.x, coord.y, interaction.w, interaction.h)
            ? { x: coord.x, y: coord.y, w: interaction.w, h: interaction.h }
            : null,
        );
      }
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const interaction = interactionRef.current;
    interactionRef.current = null;

    if (interaction?.kind === 'region-rect') {
      const end = clampCell(toCell(event.clientX, event.clientY));
      setMarquee(null);
      const distance = Math.hypot(
        event.clientX - interaction.startX,
        event.clientY - interaction.startY,
      );
      if (distance < DRAG_THRESHOLD) {
        if (interaction.remove) onDraftRemove([[interaction.start.x, interaction.start.y]]);
        else onDraftToggle(interaction.start);
        return;
      }
      const rect = rectCells([interaction.start.x, interaction.start.y], [end.x, end.y]);
      if (interaction.remove) onDraftRemove(rect);
      else onDraftAdd(rect);
      return;
    }

    if (interaction?.kind === 'brush') {
      const selected = Array.from(interaction.keys).map(
        (item) => item.split(',').map(Number) as Coord,
      );
      setBrushCells([]);
      if (selected.length > 0) {
        if (interaction.erase) onDraftRemove(selected);
        else onDraftAdd(selected);
      }
      return;
    }

    if (interaction?.kind === 'move') {
      const coord = toCell(event.clientX, event.clientY);
      if (moveTarget) {
        onMoveObject(interaction.from, { x: moveTarget.x, y: moveTarget.y });
      } else if (
        !(coord.x === interaction.from.x && coord.y === interaction.from.y)
      ) {
        onSelect({ type: 'cell', x: interaction.from.x, y: interaction.from.y });
        onSelectRegion(regionAt(regions, interaction.from.x, interaction.from.y)?.id ?? null);
      } else {
        onSelect({ type: 'cell', x: coord.x, y: coord.y });
        onSelectRegion(regionAt(regions, coord.x, coord.y)?.id ?? null);
      }
      setMoveTarget(null);
    }
  };

  const cursor =
    activeTool === 'pan' || spaceHeld
      ? 'grab'
      : activeTool === 'region' || activeTool === 'eraser'
        ? 'crosshair'
        : 'default';

  const showPreview =
    (activeTool === 'select' || activeTool === 'character') && hover !== null && pendingItem !== null;

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.start.x, marquee.end.x) * CELL_SIZE,
        top: Math.min(marquee.start.y, marquee.end.y) * CELL_SIZE,
        width: (Math.abs(marquee.end.x - marquee.start.x) + 1) * CELL_SIZE,
        height: (Math.abs(marquee.end.y - marquee.start.y) + 1) * CELL_SIZE,
      }
    : null;

  const gridBackground = useMemo(
    () => ({
      backgroundImage: `linear-gradient(${GRID_LINE_COLOR} ${GRID_LINE_WIDTH}px, transparent ${GRID_LINE_WIDTH}px), linear-gradient(90deg, ${GRID_LINE_COLOR} ${GRID_LINE_WIDTH}px, transparent ${GRID_LINE_WIDTH}px)`,
      backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
      border: `${GRID_BORDER_WIDTH}px solid ${GRID_LINE_COLOR}`,
    }),
    [],
  );

  const gridLines = useMemo(
    () => ({
      backgroundImage: `linear-gradient(${GRID_LINE_COLOR} ${GRID_LINE_WIDTH}px, transparent ${GRID_LINE_WIDTH}px), linear-gradient(90deg, ${GRID_LINE_COLOR} ${GRID_LINE_WIDTH}px, transparent ${GRID_LINE_WIDTH}px)`,
      backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
    }),
    [],
  );

  const backgroundNodes = useMemo(
    () =>
      [...cells.entries()]
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
              style={{ left: x * CELL_SIZE, top: y * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE, zIndex: 5 }}
            >
              <img
                src={src}
                alt=""
                className="block h-full w-full"
                style={{ objectFit: item.fitMode === 'contain' ? 'contain' : 'cover' }}
              />
            </div>
          );
        }),
    [cells, itemsById],
  );

  const hoveredKeys = useMemo(() => {
    const region = hoveredRegionId
      ? regions.find((item) => item.id === hoveredRegionId)
      : undefined;
    return new Set(region ? region.cells.map(([x, y]) => `${x},${y}`) : []);
  }, [hoveredRegionId, regions]);

  const objectNodes = useMemo(
    () =>
      [...cells.entries()]
        .filter(([, cell]) => cell.object)
        .map(([key, cell]) => {
          const anchor = cell.object!;
          const item = itemsById.get(anchor.itemId);
          const [x, y] = key.split(',').map(Number) as [number, number];
          const src = item?.imageThumbUrl ?? item?.imageUrl;
          if (!src) return null;
          const glow = hoveredKeys.has(key);
          return (
            <div
              key={`obj-${key}`}
              className="absolute overflow-hidden"
              style={{
                left: x * CELL_SIZE,
                top: y * CELL_SIZE,
                width: anchor.w * CELL_SIZE,
                height: anchor.h * CELL_SIZE,
                zIndex: 15,
                filter: glow ? 'drop-shadow(0 0 4px #93C5FD)' : undefined,
              }}
            >
              <img
                src={src}
                alt=""
                className="block h-full w-full"
                style={{ objectFit: item?.fitMode === 'contain' ? 'contain' : 'cover' }}
              />
            </div>
          );
        }),
    [cells, itemsById, hoveredKeys],
  );

  const characterNodes = useMemo(
    () =>
      placedCharacters.map((placed) => {
        const character = charactersById.get(placed.characterId);
        const src = character?.avatarThumbUrl ?? character?.avatarUrl;
        const selected =
          selection?.type === 'character' &&
          selection.x === placed.x &&
          selection.y === placed.y;
        return (
          <button
            key={`ch-${placed.x},${placed.y}`}
            type="button"
            className="absolute flex items-center justify-center transition-transform"
            style={{
              left: placed.x * CELL_SIZE,
              top: placed.y * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              zIndex: 25,
              pointerEvents: activeTool === 'region' ? 'none' : 'auto',
              cursor: activeTool === 'region' ? 'inherit' : 'pointer',
              transform: selected ? 'scale(1.06)' : undefined,
              filter: selected ? 'drop-shadow(0 0 6px rgba(59,130,246,0.9))' : undefined,
            }}
            disabled={activeTool === 'region'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelectCharacter(placed.characterId, placed.x, placed.y);
            }}
            title={character?.name ?? `#${placed.characterId}`}
          >
            {src ? (
              <img
                src={src}
                alt={character?.name ?? ''}
                className="h-[82%] w-[80%] rounded-full border-2 border-white object-cover shadow-md"
              />
            ) : (
              <span className="flex h-[80%] w-[80%] items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow">
                {character?.name?.slice(0, 1) ?? '?'}
              </span>
            )}
          </button>
        );
      }),
    [placedCharacters, charactersById, onSelectCharacter, selection, activeTool],
  );

  const regionFills = useMemo(
    () => (
      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={total}
        height={total}
        style={{ zIndex: 10 }}
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
    ),
    [regions, total],
  );

  const regionEdges = useMemo(
    () => (
      <svg
        className="pointer-events-none absolute left-0 top-0"
        width={total}
        height={total}
        style={{ zIndex: 20 }}
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
    ),
    [regions, total, hoveredRegionId, selectedRegionId],
  );

  const regionLabels = useMemo(
    () => (
      <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 27 }}>
        {regions.map((region) => {
          const label = region.labelCell ?? computeLabelCell(region.cells);
          if (!label) return null;
          return (
            <button
              key={`label-${region.id}`}
              type="button"
              className="region-label pointer-events-auto absolute -translate-x-1/2 whitespace-nowrap"
              style={{
                left: (label[0] + 0.5) * CELL_SIZE,
                top: label[1] * CELL_SIZE + 2,
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: 12,
                WebkitTextStroke: '2px #000000',
                paintOrder: 'stroke fill',
              } as CSSProperties}
              onMouseEnter={() => setHoveredRegionId(region.id)}
              onMouseLeave={() => setHoveredRegionId((current) => (current === region.id ? null : current))}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onSelect({ type: 'region', regionId: region.id });
                onSelectRegion(region.id);
              }}
              title={region.name}
            >
              {region.name}
            </button>
          );
        })}
      </div>
    ),
    [regions, onSelect, onSelectRegion],
  );

  const selectionCell =
    selection?.type === 'cell' || selection?.type === 'character'
      ? { x: selection.x, y: selection.y }
      : null;

  const draftOverlay = (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 12 }}>
      {Array.from(regionDraftSelection).map((key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        return (
          <div
            key={`draft-${key}`}
            className="absolute"
            style={{
              left: x * CELL_SIZE,
              top: y * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE,
              backgroundColor: 'rgba(59,130,246,0.25)',
              boxShadow: 'inset 0 0 0 1px #3B82F6',
            }}
          />
        );
      })}
    </div>
  );

  const selectionOverlay = (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 26 }}>
      {selectionCell ? (
        <div
          className="absolute ring-2 ring-inset ring-primary"
          style={{
            left: selectionCell.x * CELL_SIZE,
            top: selectionCell.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        />
      ) : null}
      {showPreview && hover ? (
        <div
          className="absolute border-2 border-dashed border-primary bg-primary/20"
          style={{
            left: hover.x * CELL_SIZE,
            top: hover.y * CELL_SIZE,
            width: pendingFootprint.w * CELL_SIZE,
            height: pendingFootprint.h * CELL_SIZE,
          }}
        />
      ) : null}
      {moveTarget ? (
        <div
          className="absolute border-2 border-primary bg-primary/15"
          style={{
            left: moveTarget.x * CELL_SIZE,
            top: moveTarget.y * CELL_SIZE,
            width: moveTarget.w * CELL_SIZE,
            height: moveTarget.h * CELL_SIZE,
          }}
        />
      ) : null}
      {marqueeRect ? (
        <div className="absolute border-2 border-dashed border-primary bg-primary/10" style={marqueeRect} />
      ) : null}
      {brushCells.map(([x, y]) => (
        <div
          key={`brush-${x}-${y}`}
          className="absolute border border-primary bg-primary/30"
          style={{ left: x * CELL_SIZE, top: y * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE }}
        />
      ))}
    </div>
  );

  const rulerColumns = useMemo(
    () => Array.from({ length: gridSize }, (_, index) => index + 1),
    [gridSize],
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-muted/30"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => setHover(null)}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
          width: total,
          height: total,
        }}
      >
        <div
          className="absolute left-0 top-0 bg-background"
          style={{ width: total, height: total, ...gridBackground }}
        />

        {backgroundNodes}
        {regionFills}
        {regionEdges}
        {draftOverlay}

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 15 }}>
          {objectNodes}
        </div>

        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: total, height: total, zIndex: 16, ...gridLines }}
        />

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 25 }}>
          {characterNodes}
        </div>

        {selectionOverlay}
        {regionLabels}
      </div>

      {showRulers ? (
        <>
          <div
            className="pointer-events-none absolute z-30 h-7 border-b border-[#E5E7EB] bg-[#F9FAFB]"
            style={{ left: pan.x - RULER_SIZE, top: pan.y - RULER_SIZE, width: total * zoom + RULER_SIZE, overflow: 'hidden' }}
          >
            {rulerColumns.map((column) => {
              const active = hover?.x === column - 1 || selectionCell?.x === column - 1;
              return (
                <div
                  key={`rul-col-${column}`}
                  className="absolute top-0 flex h-full items-center justify-center border-r border-[#E5E7EB] text-[11px]"
                  style={{
                    left: RULER_SIZE + (column - 1) * CELL_SIZE * zoom,
                    width: CELL_SIZE * zoom,
                    backgroundColor: active ? '#DBEAFE' : '#F9FAFB',
                    color: active ? '#1E3A8A' : '#374151',
                  }}
                >
                  C{column}
                </div>
              );
            })}
          </div>

          <div
            className="pointer-events-none absolute z-40 border-b border-r border-[#E5E7EB] bg-[#F9FAFB]"
            style={{ left: pan.x - RULER_SIZE, top: pan.y - RULER_SIZE, width: RULER_SIZE, height: RULER_SIZE }}
          />

          <div
            className="pointer-events-none absolute z-30 border-r border-[#E5E7EB] bg-[#F9FAFB]"
            style={{ left: pan.x - RULER_SIZE, top: pan.y - RULER_SIZE, width: RULER_SIZE, height: total * zoom + RULER_SIZE, overflow: 'hidden' }}
          >
            {rulerColumns.map((row) => (
              <div
                key={`rul-row-${row}`}
                className="absolute left-0 flex w-full -translate-y-1/2 items-center justify-center border-r border-[#E5E7EB] text-[11px]"
                style={{
                  top: RULER_SIZE + (row - 0.5) * CELL_SIZE * zoom,
                  height: 16,
                  backgroundColor:
                    hover?.y === row - 1 || selectionCell?.y === row - 1 ? '#DBEAFE' : '#F9FAFB',
                  color: hover?.y === row - 1 || selectionCell?.y === row - 1 ? '#1E3A8A' : '#374151',
                }}
              >
                R{row}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
});
