import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { CELL_SIZE, GRID_LINE_COLOR } from '@murdoku/shared';
import type { Card, CellCoord, EditorTool, EffectType, RegionData } from '@murdoku/shared';
import { cellKey, type EditorCell } from '@/stores/editorStore';
import { CardThumbnail } from '@/components/card/CardThumbnail';
import { buildRegionEdges, rectCells } from '@/lib/region';
import {
  clampZoom,
  clientToCell,
  DRAG_THRESHOLD,
  isInBounds,
  zoomAtPoint,
  ZOOM_STEP,
} from '@/lib/grid';
import { cn } from '@/lib/utils';

export interface EditorCanvasHandle {
  clientToCell: (clientX: number, clientY: number) => CellCoord;
  containsPoint: (clientX: number, clientY: number) => boolean;
  getRect: () => DOMRect | null;
}

interface EditorCanvasProps {
  gridSize: number;
  cells: Map<string, EditorCell>;
  regions: RegionData[];
  selectedRegionId: number | null;
  cardsById: Map<number, Card>;
  zoom: number;
  pan: { x: number; y: number };
  selection: CellCoord | null;
  activeTool: EditorTool;
  spaceHeld: boolean;
  dropPreview: CellCoord | null;
  highlightEffects: Map<string, HighlightEffect>;
  onSelect: (coord: CellCoord | null) => void;
  onSelectRegion: (id: number | null) => void;
  onRegionSelect: (cells: CellCoord[]) => void;
  onToggleRegionCell: (coord: CellCoord) => void;
  onMoveCard: (from: CellCoord, to: CellCoord) => void;
  onErase: (coord: CellCoord) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

type Interaction =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'move'; from: CellCoord; startX: number; startY: number }
  | { kind: 'erase'; last: string | null }
  | { kind: 'marquee'; start: CellCoord }
  | null;

interface MoveDrag {
  from: CellCoord;
  cardId: number;
  clientX: number;
  clientY: number;
  target: CellCoord | null;
}

const EFFECT_CLASS: Record<EffectType, string> = {
  highlight: 'ring-2 ring-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.9)] scale-105',
  glow: 'animate-pulse ring-2 ring-sky-400',
  blink: 'animate-pulse',
  tooltip: '',
};

export interface HighlightEffect {
  effectType: EffectType;
  text?: string;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  {
    gridSize,
    cells,
    regions,
    selectedRegionId,
    cardsById,
    zoom,
    pan,
    selection,
    activeTool,
    spaceHeld,
    dropPreview,
    highlightEffects,
    onSelect,
    onSelectRegion,
    onRegionSelect,
    onToggleRegionCell,
    onMoveCard,
    onErase,
    onZoom,
    onPan,
  },
  ref,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction>(null);
  const dragRef = useRef<MoveDrag | null>(null);
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [moveDrag, setMoveDrag] = useState<MoveDrag | null>(null);
  const [marquee, setMarquee] = useState<{ start: CellCoord; end: CellCoord } | null>(null);

  const viewRef = useRef({ zoom, pan, onZoom, onPan });
  viewRef.current = { zoom, pan, onZoom, onPan };

  const clampCell = useCallback(
    (coord: CellCoord): CellCoord => ({
      x: Math.min(gridSize - 1, Math.max(0, coord.x)),
      y: Math.min(gridSize - 1, Math.max(0, coord.y)),
    }),
    [gridSize],
  );

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord => {
      const node = containerRef.current;
      const rect = node ? node.getBoundingClientRect() : new DOMRect();
      return clientToCell(clientX, clientY, { rect, pan, zoom });
    },
    [pan, zoom],
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
    }),
    [toCell],
  );

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

  const updateDrag = (drag: MoveDrag | null): void => {
    dragRef.current = drag;
    setMoveDrag(drag);
  };

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
      node.setPointerCapture(event.pointerId);
      const start = clampCell(coord);
      interactionRef.current = { kind: 'marquee', start };
      setMarquee({ start, end: start });
      return;
    }

    if (!inBounds) {
      if (activeTool === 'select') {
        onSelect(null);
        onSelectRegion(null);
      }
      return;
    }

    if (activeTool === 'eraser') {
      node.setPointerCapture(event.pointerId);
      interactionRef.current = { kind: 'erase', last: cellKey(coord.x, coord.y) };
      onErase(coord);
      return;
    }

    if (activeTool === 'select') {
      if (event.shiftKey && selectedRegionId !== null) {
        onToggleRegionCell(coord);
        return;
      }
      if (cells.has(cellKey(coord.x, coord.y))) {
        node.setPointerCapture(event.pointerId);
        interactionRef.current = {
          kind: 'move',
          from: coord,
          startX: event.clientX,
          startY: event.clientY,
        };
      } else {
        onSelect(null);
        onSelectRegion(null);
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
      onPan({
        x: interaction.panX + (event.clientX - interaction.startX),
        y: interaction.panY + (event.clientY - interaction.startY),
      });
      return;
    }

    if (interaction.kind === 'erase') {
      if (inBounds) {
        const key = cellKey(coord.x, coord.y);
        if (key !== interaction.last) {
          interaction.last = key;
          onErase(coord);
        }
      }
      return;
    }

    if (interaction.kind === 'marquee') {
      setMarquee({ start: interaction.start, end: clampCell(coord) });
      return;
    }

    if (interaction.kind === 'move') {
      const distance = Math.hypot(
        event.clientX - interaction.startX,
        event.clientY - interaction.startY,
      );
      if (distance > DRAG_THRESHOLD) {
        const source = cells.get(cellKey(interaction.from.x, interaction.from.y));
        if (source) {
          updateDrag({
            from: interaction.from,
            cardId: source.cardId,
            clientX: event.clientX,
            clientY: event.clientY,
            target: inBounds ? coord : null,
          });
        }
      }
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const interaction = interactionRef.current;
    interactionRef.current = null;

    if (interaction?.kind === 'marquee') {
      const end = clampCell(toCell(event.clientX, event.clientY));
      setMarquee(null);
      onRegionSelect(rectCells(interaction.start, end));
      return;
    }

    if (interaction?.kind === 'move') {
      const drag = dragRef.current;
      if (drag) {
        const coord = toCell(event.clientX, event.clientY);
        if (isInBounds(coord, gridSize) && (coord.x !== drag.from.x || coord.y !== drag.from.y)) {
          onMoveCard(drag.from, coord);
        }
      } else if (activeTool === 'select') {
        onSelect(interaction.from);
      }
      updateDrag(null);
    }
  };

  const total = gridSize * CELL_SIZE;

  const gridBackground = useMemo(
    () => ({
      backgroundImage: `linear-gradient(to right, ${GRID_LINE_COLOR} 1px, transparent 1px), linear-gradient(to bottom, ${GRID_LINE_COLOR} 1px, transparent 1px)`,
      backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
    }),
    [],
  );

  const regionFill = useMemo(
    () =>
      regions.flatMap((region) =>
        region.cells.map((cell) => (
          <rect
            key={`${region.id}-${cell.x}-${cell.y}`}
            x={cell.x * CELL_SIZE}
            y={cell.y * CELL_SIZE}
            width={CELL_SIZE}
            height={CELL_SIZE}
            fill={region.color}
            fillOpacity={region.fillOpacity}
          />
        )),
      ),
    [regions],
  );

  const regionBorders = useMemo(
    () =>
      regions.map((region) => {
        const selected = region.id === selectedRegionId;
        const edges = buildRegionEdges(region.cells);
        const label = region.cells.reduce<CellCoord | null>(
          (min, cell) =>
            !min || cell.y < min.y || (cell.y === min.y && cell.x < min.x) ? cell : min,
          null,
        );
        return (
          <g
            key={region.id}
            style={{ filter: selected ? `drop-shadow(0 0 3px ${region.color})` : undefined }}
          >
            {edges.map(([x1, y1, x2, y2], index) => (
              <line
                key={index}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={region.color}
                strokeWidth={region.borderWidth}
                strokeLinecap="square"
                strokeLinejoin="miter"
              />
            ))}
            {label ? (
              <text
                x={label.x * CELL_SIZE + 4}
                y={label.y * CELL_SIZE + 14}
                fill={region.color}
                fontSize={11}
                fontWeight={600}
              >
                {region.name}
              </text>
            ) : null}
          </g>
        );
      }),
    [regions, selectedRegionId],
  );

  const cardNodes = useMemo(() => {
    const nodes: JSX.Element[] = [];
    for (const [key, cell] of cells) {
      const card = cardsById.get(cell.cardId);
      if (!card) continue;
      const [x, y] = key.split(',');
      const coord = { x: Number(x), y: Number(y) };
      const isMoveOrigin = moveDrag?.from.x === coord.x && moveDrag?.from.y === coord.y;
      const effect = highlightEffects.get(key);
      nodes.push(
        <div
          key={key}
          className="absolute transition-transform"
          title={effect?.effectType === 'tooltip' ? effect.text : undefined}
          style={{
            left: coord.x * CELL_SIZE,
            top: coord.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
            zIndex: effect ? 1 : undefined,
          }}
        >
          <CardThumbnail
            card={card}
            className={cn(
              'h-full w-full rounded-none border-0',
              isMoveOrigin && 'opacity-30',
              effect && EFFECT_CLASS[effect.effectType],
            )}
          />
        </div>,
      );
    }
    return nodes;
  }, [cells, cardsById, moveDrag, highlightEffects]);

  const cursor =
    activeTool === 'pan' || spaceHeld
      ? 'grab'
      : activeTool === 'eraser' || activeTool === 'region'
        ? 'crosshair'
        : 'default';

  const ghostCard = moveDrag ? cardsById.get(moveDrag.cardId) : undefined;
  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.start.x, marquee.end.x) * CELL_SIZE,
        top: Math.min(marquee.start.y, marquee.end.y) * CELL_SIZE,
        width: (Math.abs(marquee.end.x - marquee.start.x) + 1) * CELL_SIZE,
        height: (Math.abs(marquee.end.y - marquee.start.y) + 1) * CELL_SIZE,
      }
    : null;

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
          className="absolute left-0 top-0 border-l border-t border-[#E5E7EB] bg-background"
          style={{ width: total, height: total, ...gridBackground }}
        />

        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={total}
          height={total}
          style={{ zIndex: 10 }}
        >
          {regionFill}
        </svg>

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 15 }}>
          {cardNodes}
        </div>

        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={total}
          height={total}
          style={{ zIndex: 20 }}
        >
          {regionBorders}
        </svg>

        <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: 25 }}>
          {selection ? (
            <div
              className="absolute ring-2 ring-inset ring-primary"
              style={{
                left: selection.x * CELL_SIZE,
                top: selection.y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          ) : null}
          {hover && !moveDrag ? (
            <div
              className="absolute bg-black/5"
              style={{
                left: hover.x * CELL_SIZE,
                top: hover.y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          ) : null}
          {dropPreview ? (
            <div
              className="absolute bg-primary/15 ring-2 ring-inset ring-primary"
              style={{
                left: dropPreview.x * CELL_SIZE,
                top: dropPreview.y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          ) : null}
          {moveDrag?.target ? (
            <div
              className="absolute ring-2 ring-inset ring-primary"
              style={{
                left: moveDrag.target.x * CELL_SIZE,
                top: moveDrag.target.y * CELL_SIZE,
                width: CELL_SIZE,
                height: CELL_SIZE,
              }}
            />
          ) : null}
          {marqueeRect ? (
            <div
              className="absolute border-2 border-dashed border-primary bg-primary/10"
              style={marqueeRect}
            />
          ) : null}
        </div>
      </div>

      {moveDrag && ghostCard ? (
        <div
          className="pointer-events-none fixed z-50 h-12 w-12 -translate-x-1/2 -translate-y-1/2 opacity-80"
          style={{ left: moveDrag.clientX, top: moveDrag.clientY }}
        >
          <CardThumbnail card={ghostCard} className="h-full w-full shadow-lg" />
        </div>
      ) : null}
    </div>
  );
});
