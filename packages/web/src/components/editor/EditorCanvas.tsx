import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent } from 'react';
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
  regionAt,
  resolveRegionPointerUp,
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
export const CHARACTER_DND_TYPE = 'application/x-murdoku-character';

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
  regionDraftSelection: Set<string>;
  onSelect: (selection: Selection | null) => void;
  onSelectRegion: (id: string | null) => void;
  onSelectCharacter: (characterId: number, x: number, y: number) => void;
  onAnchorChange: (anchor: CellCoord | null) => void;
  onDraftAdd: (cells: Coord[]) => void;
  onDraftRemove: (cells: Coord[]) => void;
  onDraftClear: () => void;
  onToggleRegionCell: (coord: CellCoord) => void;
  onPlaceItem: (coord: CellCoord) => void;
  onDropCharacter: (characterId: number, coord: CellCoord) => void;
  onErase: (coord: CellCoord) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

type Interaction =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'erase'; last: string | null }
  | {
      kind: 'region-rect';
      anchor: CellCoord;
      startX: number;
      startY: number;
      remove: boolean;
      anchored: boolean;
    }
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
    regionDraftSelection,
    onSelect,
    onSelectRegion,
    onSelectCharacter,
    onAnchorChange,
    onDraftAdd,
    onDraftRemove,
    onDraftClear,
    onToggleRegionCell,
    onPlaceItem,
    onDropCharacter,
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
  const [regionAnchor, setRegionAnchor] = useState<CellCoord | null>(null);
  const [dropTarget, setDropTarget] = useState<CellCoord | null>(null);
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
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      interactionRef.current = null;
      setBrushCells([]);
      setMarquee(null);
      setRegionAnchor((anchor) => {
        if (anchor) return null;
        onDraftClear();
        return null;
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDraftClear]);

  useEffect(() => {
    onAnchorChange(regionAnchor);
  }, [regionAnchor, onAnchorChange]);

  useEffect(() => {
    setBrushCells([]);
    setRegionAnchor(null);
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
      const down = clampCell(coord);
      const anchored = regionAnchor !== null;
      const rectAnchor = regionAnchor ?? down;
      interactionRef.current = {
        kind: 'region-rect',
        anchor: rectAnchor,
        startX: event.clientX,
        startY: event.clientY,
        remove: event.altKey,
        anchored,
      };
      setMarquee({ start: rectAnchor, end: down });
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
      onSelect({ type: 'cell', x: coord.x, y: coord.y });
      onSelectRegion(regionAt(regions, coord.x, coord.y)?.id ?? null);
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
          : { start: interaction.anchor, end: clampCell(coord) },
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
      const result = resolveRegionPointerUp({
        anchor: [interaction.anchor.x, interaction.anchor.y],
        end: [end.x, end.y],
        moved: distance > DRAG_THRESHOLD,
        alt: interaction.remove,
        anchored: interaction.anchored,
      });
      if (result.toAdd.length > 0) onDraftAdd(result.toAdd);
      if (result.toRemove.length > 0) onDraftRemove(result.toRemove);
      setRegionAnchor(
        result.anchor ? { x: result.anchor[0], y: result.anchor[1] } : null,
      );
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
  };

  const handleDragOver = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes(CHARACTER_DND_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    const coord = toCell(event.clientX, event.clientY);
    setDropTarget((previous) =>
      previous && previous.x === coord.x && previous.y === coord.y
        ? previous
        : isInBounds(coord, gridSize)
          ? coord
          : null,
    );
  };

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes(CHARACTER_DND_TYPE)) return;
    event.preventDefault();
    const characterId = Number(event.dataTransfer.getData(CHARACTER_DND_TYPE));
    setDropTarget(null);
    if (!Number.isFinite(characterId)) return;
    const coord = toCell(event.clientX, event.clientY);
    if (isInBounds(coord, gridSize)) onDropCharacter(characterId, coord);
  };

  const cursor =
    activeTool === 'pan' || spaceHeld
      ? 'grab'
      : activeTool === 'region'
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

  const gridSvg = useMemo(() => {
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
  }, [gridSize, total]);

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
              zIndex: 12,
              pointerEvents: 'none',
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
        const interactive = activeTool === 'select' || activeTool === 'character';
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
              zIndex: 18,
              pointerEvents: interactive ? 'auto' : 'none',
              cursor: interactive ? 'pointer' : 'inherit',
              transform: selected ? 'scale(1.06)' : undefined,
              filter: selected ? 'drop-shadow(0 0 6px rgba(59,130,246,0.9))' : undefined,
            }}
            disabled={!interactive}
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
    ),
    [regions, total],
  );

  const regionEdges = useMemo(
    () => (
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
    ),
    [regions, total, hoveredRegionId, selectedRegionId],
  );

  const regionLabels = useMemo(
    () => (
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
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 28 }}>
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
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 30 }}>
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
      {dropTarget ? (
        <div
          className="absolute border-2 border-primary bg-primary/25"
          style={{
            left: dropTarget.x * CELL_SIZE,
            top: dropTarget.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        />
      ) : null}
      {regionAnchor ? (
        <div
          className="absolute animate-pulse border-[3px] border-primary bg-primary/30"
          style={{
            left: regionAnchor.x * CELL_SIZE,
            top: regionAnchor.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
            boxShadow: '0 0 0 2px rgba(59,130,246,0.4)',
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
      onDragOver={handleDragOver}
      onDragLeave={() => setDropTarget(null)}
      onDrop={handleDrop}
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
          style={{ width: total, height: total }}
        />

        {backgroundNodes}
        {regionFills}
        {regionEdges}
        {draftOverlay}

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 12 }}>
          {objectNodes}
        </div>

        {gridSvg}

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 18 }}>
          {characterNodes}
        </div>

        {selectionOverlay}
        {regionLabels}
      </div>

      {showRulers ? (
        <>
          <div
            className="pointer-events-none absolute z-30 h-7 border-b border-[#E5E7EB]"
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
                    backgroundColor: active ? '#DBEAFE' : 'transparent',
                    color: active ? '#1E3A8A' : '#374151',
                  }}
                >
                  C{column}
                </div>
              );
            })}
          </div>

          <div
            className="pointer-events-none absolute z-40 border-b border-r border-[#E5E7EB]"
            style={{ left: pan.x - RULER_SIZE, top: pan.y - RULER_SIZE, width: RULER_SIZE, height: RULER_SIZE }}
          />

          <div
            className="pointer-events-none absolute z-30 border-r border-[#E5E7EB]"
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
                    hover?.y === row - 1 || selectionCell?.y === row - 1 ? '#DBEAFE' : 'transparent',
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
