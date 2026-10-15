import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_CELL_SIZE,
  HIGHLIGHT_BLUE,
  MAP_LAYER_Z,
  RULER_SIZE,
  type CellCoord,
  type DraftRegion,
  type EditorTool,
  type Item,
  type RegionShape,
} from '@murdoku/shared';
import { coordKey, regionAt, resolveRegionPointerUp, type Coord } from '@/lib/region';
import { hitTestCell, type CellMap } from '@/lib/hitTest';
import type { HighlightState } from '@/lib/highlight';
import {
  MapBackgroundLayer,
  MapCanvasFrameLayer,
  MapCellCursorLayer,
  MapGridLayer,
  MapHighlightLayer,
  MapNoStandShadowLayer,
  MapObjectLayer,
  MapOperationCursorLayer,
  MapRegionEdgeLayer,
  MapRegionFillLayer,
  MapRegionHoverLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapLayers';
import {
  collectNoStandCells,
  collectObjectCells,
  resolveCursorBoxes,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import {
  canvasInsets,
  centeredPan,
  computeCellSizeForInsets,
} from '@/lib/canvasSize';
import { cellScale } from '@/lib/canvasScale';
import { buildRulerGlyphs } from '@/lib/ruler';
import {
  clampZoom,
  clientToCell,
  DRAG_THRESHOLD,
  isInBounds,
  zoomAtPoint,
  ZOOM_STEP,
} from '@/lib/grid';
import type { Selection } from '@/stores/editorStore';

/**
 * OPT-A05 §1.1 layer 1 covers "current operation or selection" markers. The
 * editor affordances (marquee, region draft) live in the same top band, just
 * under the two cursor boxes so the hover indicator stays on top.
 */
const EDITOR_OVERLAY_Z = MAP_LAYER_Z.cellCursor - 1;
const DRAFT_OVERLAY_Z = MAP_LAYER_Z.cellCursor - 2;

/** EditorCanvas no longer carries character drag state (CLAR-603). */
export interface EditorCanvasHandle {
  clientToCell: (clientX: number, clientY: number) => CellCoord;
  containsPoint: (clientX: number, clientY: number) => boolean;
  getRect: () => DOMRect | null;
  centerView: () => void;
}

interface EditorCanvasProps {
  gridSize: number;
  cells: CellMap;
  itemsById: Map<number, Item>;
  regions: DraftRegion[];
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
  /** Resolved participant highlight (shared with the work preview page). */
  highlight: HighlightState | null;
  /** MOD-802: true while the highlight is fading out (150ms). */
  highlightLeaving?: boolean;
  onSelect: (selection: Selection | null) => void;
  onSelectRegion: (id: string | null) => void;
  onAnchorChange: (anchor: CellCoord | null) => void;
  onDraftAdd: (cells: Coord[]) => void;
  onDraftRemove: (cells: Coord[]) => void;
  onDraftClear: () => void;
  onToggleRegionCell: (coord: CellCoord) => void;
  onPlaceItem: (coord: CellCoord) => void;
  onErase: (coord: CellCoord) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

type Interaction =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'erase'; visited: Set<string> }
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
    highlight,
    highlightLeaving = false,
    onSelect,
    onSelectRegion,
    onAnchorChange,
    onDraftAdd,
    onDraftRemove,
    onDraftClear,
    onToggleRegionCell,
    onPlaceItem,
    onErase,
    onZoom,
    onPan,
  },
  ref,
): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction>(null);
  const userPannedRef = useRef(false);
  /** OPT-A01 §1.1: adaptive cell width in px at 100% zoom. */
  const [cellSize, setCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [marquee, setMarquee] = useState<{ start: CellCoord; end: CellCoord } | null>(null);
  const [regionAnchor, setRegionAnchor] = useState<CellCoord | null>(null);
  const [brushCells, setBrushCells] = useState<Coord[]>([]);
  /** Set when the pointer sits directly on a region label (§2.2). */
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);

  const viewRef = useRef({ zoom, pan, onZoom, onPan });
  viewRef.current = { zoom, pan, onZoom, onPan };

  const total = gridSize * cellSize;

  /**
   * OPT-A01 §1.2: recompute the adaptive cell size and re-centre the board.
   * Clearing `userPannedRef` is what re-arms the automatic pass, so this is
   * also what "重置视图" (Ctrl+0) does.
   *
   * OPT-B02 §2.2: the inset is asymmetric — the ruler strips run along the
   * top / left edges and the bottom toolbar floats over the viewport, so the
   * adaptive height subtracts 72px for it (`BOTTOM_BAR_RESERVE`).
   */
  const centerView = useCallback((): void => {
    const node = containerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    userPannedRef.current = false;
    const insets = canvasInsets({ showRulers, showBottomBar: true });
    const next = computeCellSizeForInsets({
      width: rect.width,
      height: rect.height,
      gridSize,
      insets,
    });
    setCellSize((previous) => (previous === next ? previous : next));
    viewRef.current.onZoom(1);
    viewRef.current.onPan(centeredPan(rect, insets, gridSize, next, 1));
  }, [gridSize, showRulers]);

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord => {
      const node = containerRef.current;
      const rect = node ? node.getBoundingClientRect() : new DOMRect();
      return clientToCell(clientX, clientY, { rect, pan, zoom, cellSize });
    },
    [pan, zoom, cellSize],
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

  /**
   * OPT-A01 §1.2 生效时机: adapt on mount and on every resize, but only while
   * the user has not manually zoomed (Ctrl+wheel) or dragged the canvas. A
   * manual interaction flips `userPannedRef`; "重置视图" re-arms it.
   */
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      if (userPannedRef.current) return;
      centerView();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
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

  // Click-only selection: no drag handling is registered anywhere on cell content,
  // see docs/v0.2.5.md BUG-401 / BUG-405.
  const selectCellAt = useCallback(
    (coord: CellCoord): void => {
      const hit = hitTestCell({ x: coord.x, y: coord.y, gridSize, cells });
      if (!hit) {
        onSelect(null);
        return;
      }
      onSelect({ type: 'cell', x: hit.x, y: hit.y });
      onSelectRegion(regionAt(regions, hit.x, hit.y)?.id ?? null);
    },
    [cells, gridSize, onSelect, onSelectRegion, regions],
  );

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
      if (activeTool === 'select') {
        onSelect(null);
        onSelectRegion(null);
      }
      return;
    }

    if (activeTool === 'eraser') {
      node.setPointerCapture(event.pointerId);
      const visited = new Set<string>([`${coord.x},${coord.y}`]);
      interactionRef.current = { kind: 'erase', visited };
      onErase(coord);
      return;
    }

    if (activeTool === 'select') {
      if (event.shiftKey && selectedRegionId) {
        onToggleRegionCell(coord);
        return;
      }
      if (pendingItem) {
        if (fits(coord.x, coord.y, pendingFootprint.w, pendingFootprint.h)) onPlaceItem(coord);
        return;
      }
      selectCellAt(coord);
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
      // At most one layer per cell for the whole stroke (docs/v0.2.5.md BUG-406).
      if (inBounds) {
        const key = `${coord.x},${coord.y}`;
        if (!interaction.visited.has(key)) {
          interaction.visited.add(key);
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

  const cursor =
    activeTool === 'pan' || spaceHeld
      ? 'grab'
      : activeTool === 'region'
        ? 'crosshair'
        : 'default';

  const showPreview =
    activeTool === 'select' && hover !== null && pendingItem !== null;

  const marqueeRect = marquee
    ? {
        left: Math.min(marquee.start.x, marquee.end.x) * cellSize,
        top: Math.min(marquee.start.y, marquee.end.y) * cellSize,
        width: (Math.abs(marquee.end.x - marquee.start.x) + 1) * cellSize,
        height: (Math.abs(marquee.end.y - marquee.start.y) + 1) * cellSize,
      }
    : null;

  // ---- OPT-901 §1.2.5: cells holding a non-standable object ----
  const noStandCells = useMemo(
    () => collectNoStandCells(cells, itemsById),
    [cells, itemsById],
  );
  const objectCells = useMemo(() => collectObjectCells(cells), [cells]);

  // ---- OPT-902 §2.1~2.4: cursor box + region emphasis + item lift ----
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, noStandCells, objectCells, regions }),
    [hover, noStandCells, objectCells, regions],
  );
  /** §2.2: hovering any cell of a region emphasises that region. */
  const hoveredRegionId = labelRegionId ?? hoverEffects.regionId;
  const hoveredRegion = hoveredRegionId
    ? regions.find((item) => item.id === hoveredRegionId) ?? null
    : null;

  // Cell content is clickable (selection only) unless a brush item is armed or
  // the user is panning; it never carries drag handlers (BUG-405).
  const selectInteractive =
    activeTool === 'select' && pendingItem === null && !spaceHeld;

  const selectionCell =
    selection?.type === 'cell'
      ? { x: selection.x, y: selection.y }
      : null;

  /**
   * OPT-A05 §4: the mouse box follows the pointer, the operation box stays on
   * the selected cell. Both are rendered from one resolution step.
   */
  const cursorBoxes = resolveCursorBoxes({
    hover: hoverEffects.cell,
    blocked: hoverEffects.blocked,
    selection: selectionCell,
  });

  const draftOverlay = (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: DRAFT_OVERLAY_Z }}>
      {Array.from(regionDraftSelection).map((key) => {
        const [x, y] = key.split(',').map(Number) as [number, number];
        return (
          <div
            key={`draft-${key}`}
            className="absolute"
            style={{
              left: x * cellSize,
              top: y * cellSize,
              width: cellSize,
              height: cellSize,
              backgroundColor: 'rgba(59,130,246,0.25)',
              boxShadow: `inset 0 0 0 1px ${HIGHLIGHT_BLUE}`,
            }}
          />
        );
      })}
    </div>
  );

  const selectionOverlay = (
    <div className="pointer-events-none absolute left-0 top-0" style={{ zIndex: EDITOR_OVERLAY_Z }}>
      {showPreview && hover ? (
        <div
          className="absolute border-2 border-dashed border-primary bg-primary/20"
          style={{
            left: hover.x * cellSize,
            top: hover.y * cellSize,
            width: pendingFootprint.w * cellSize,
            height: pendingFootprint.h * cellSize,
          }}
        />
      ) : null}
      {regionAnchor ? (
        <div
          className="absolute animate-pulse border-[3px] border-primary bg-primary/30"
          style={{
            left: regionAnchor.x * cellSize,
            top: regionAnchor.y * cellSize,
            width: cellSize,
            height: cellSize,
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
          style={{ left: x * cellSize, top: y * cellSize, width: cellSize, height: cellSize }}
        />
      ))}
    </div>
  );

  /**
   * OPT-B05 §5: both ruler strips share one state machine — idle glyphs, the
   * hovered row / column, and the row / column of the operation box (which
   * wins and grows from 15px to 17px, both × scale).
   */
  const rulerScale = cellScale(cellSize);
  const rulerColumns = useMemo(
    () =>
      buildRulerGlyphs({
        gridSize,
        axis: 'column',
        hoverIndex: hover?.x ?? null,
        operationIndex: selectionCell?.x ?? null,
        scale: rulerScale,
        zoom,
      }),
    [gridSize, hover?.x, selectionCell?.x, rulerScale, zoom],
  );
  const rulerRows = useMemo(
    () =>
      buildRulerGlyphs({
        gridSize,
        axis: 'row',
        hoverIndex: hover?.y ?? null,
        operationIndex: selectionCell?.y ?? null,
        scale: rulerScale,
        zoom,
      }),
    [gridSize, hover?.y, selectionCell?.y, rulerScale, zoom],
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
          style={{ width: total, height: total, zIndex: MAP_LAYER_Z.emptyCell }}
        />

        {/* OPT-A05 §3.4 — rendered bottom-up; the z-index of each layer is
            pinned by MAP_LAYER_Z so the stacking order matches the spec. */}
        <MapBackgroundLayer cells={cells} itemsById={itemsById} cellSize={cellSize} />
        <MapRegionFillLayer regions={regions} gridSize={gridSize} cellSize={cellSize} />
        <MapHighlightLayer
          highlight={highlight}
          regions={regions}
          cellSize={cellSize}
          leaving={highlightLeaving}
        />
        <MapRegionHoverLayer region={hoveredRegion} cellSize={cellSize} />
        <MapNoStandShadowLayer noStandCells={noStandCells} cellSize={cellSize} />
        <MapRegionEdgeLayer
          regions={regions}
          gridSize={gridSize}
          cellSize={cellSize}
          selectedRegionId={selectedRegionId}
        />
        {draftOverlay}

        <MapGridLayer gridSize={gridSize} cellSize={cellSize} />
        <MapObjectLayer
          cells={cells}
          itemsById={itemsById}
          cellSize={cellSize}
          interactive={selectInteractive}
          hover={hover}
          onClick={(coord, event) => {
            if (event.shiftKey && selectedRegionId) {
              onToggleRegionCell(coord);
              return;
            }
            selectCellAt(coord);
          }}
        />

        <MapRegionLabelLayer
          regions={regions}
          cellSize={cellSize}
          hoveredRegionId={hoveredRegionId}
          onHover={setLabelRegionId}
          onSelect={(id) => {
            onSelect({ type: 'region', regionId: id });
            onSelectRegion(id);
          }}
        />

        {/* OPT-B04 §4.2 — the board frame renders above every item /
            highlight layer so nothing can cover it. */}
        <MapCanvasFrameLayer gridSize={gridSize} cellSize={cellSize} />

        {selectionOverlay}
        {/* OPT-A05 §4.1 layer 1 — 操作提示框 first, 鼠标提示框 on top of it. */}
        <MapOperationCursorLayer cell={cursorBoxes.operation} cellSize={cellSize} />
        <MapCellCursorLayer
          cell={cursorBoxes.mouse}
          blocked={cursorBoxes.mouse?.blocked ?? false}
          cellSize={cellSize}
        />
      </div>

      {showRulers ? (
        <>
          {/* Column ruler — OPT-B05: transparent, borderless, ×scale glyphs. */}
          <div
            className="pointer-events-none absolute z-30 h-7"
            style={{
              left: pan.x,
              top: pan.y - RULER_SIZE,
              width: total * zoom,
              overflow: 'hidden',
            }}
          >
            {rulerColumns.map((glyph) => (
              <div
                key={`rul-col-${glyph.label}`}
                className="absolute top-0 flex h-full items-center justify-center"
                style={{
                  left: glyph.index * cellSize * zoom,
                  width: cellSize * zoom,
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

          {/* Row ruler */}
          <div
            className="pointer-events-none absolute z-30"
            style={{
              left: pan.x - RULER_SIZE,
              top: pan.y,
              width: RULER_SIZE,
              height: total * zoom,
              overflow: 'hidden',
            }}
          >
            {rulerRows.map((glyph) => (
              <div
                key={`rul-row-${glyph.label}`}
                className="absolute left-0 flex w-full items-center justify-center"
                style={{
                  top: glyph.index * cellSize * zoom,
                  height: cellSize * zoom,
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
      ) : null}
    </div>
  );
});
