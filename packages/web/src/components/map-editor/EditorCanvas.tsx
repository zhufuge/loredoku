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
  RULER_ACTIVE_FONT_DELTA,
  resolveVariantFootprint,
  type CellCoord,
  type DraftRegion,
  type EditorTool,
  type Asset,
  type AssetVariant,
  type MapStyle,
} from '@loredoku/shared';
import { brushStrokeErases, coordKey, regionAt, type Coord } from '@/lib/region';
import { hitTestCell, type CellMap } from '@/lib/hitTest';
import type { HighlightState } from '@/lib/highlight';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapItemLayer } from '@/components/map/MapAssetLayers';
import {
  MapRegionHighlightLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapRegionLayers';
import {
  MapHighlightLayer,
  MapMouseCursorBoxLayer,
  MapBlockingMaskLayer,
  MapOperationCursorBoxLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapOverlayLayers';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import {
  collectBlockingCells,
  collectItemCells,
  resolveCursorBoxes,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import {
  canvasInsets,
  centeredPan,
  computeCellSizeForInsets,
} from '@/lib/canvasSize';
import { cellScale, itemPadding, scaleFontSize } from '@/lib/canvasScale';
import { canvasShadowStyle, effectiveCellSize } from '@/lib/mapStyle';
import { rulerStripSize } from '@/lib/ruler';
import {
  clampZoom,
  clientToCanvasPoint,
  clientToCell,
  isInBounds,
  zoomAtPoint,
  ZOOM_STEP,
  type CanvasPoint,
} from '@/lib/grid';
import type { Selection } from '@/stores/editorStore';

/**
 * The two cursor boxes are 层 1 / 层 2 of 《画布图层优先级规范》, so the editor's
 * own affordances (brush preview, region draft) live just under them and never
 * cover the hover / operation indicators.
 */
const EDITOR_OVERLAY_Z = MAP_LAYER_Z.operationCursorBox - 1;
const DRAFT_OVERLAY_Z = MAP_LAYER_Z.operationCursorBox - 2;

/** EditorCanvas no longer carries character drag state (CLAR-603). */
export interface EditorCanvasHandle {
  clientToCell: (clientX: number, clientY: number) => CellCoord;
  containsPoint: (clientX: number, clientY: number) => boolean;
  getRect: () => DOMRect | null;
  centerView: () => void;
  /**
   * v0.6.3: one zoom step around the viewport centre — the bottom bar's ±
   * buttons. It lives here, next to the wheel path, because both have to do
   * the same one extra thing: mark the view as user-adjusted (see
   * `zoomByStep`'s comment).
   */
  zoomByStep: (direction: 1 | -1) => void;
}

interface EditorCanvasProps {
  gridSize: number;
  cells: CellMap;
  assetsById: Map<number, Asset>;
  regions: DraftRegion[];
  /** v0.3.8 FEAT-D02: the map's display constants. */
  style: MapStyle;
  selectedRegionId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  selection: Selection | null;
  activeTool: EditorTool;
  spaceHeld: boolean;
  showRulers: boolean;
  /** v0.6.1: the armed (asset, variant) pair. v0.10.6: 足迹尺寸在 variant 上。 */
  pendingVariant: { asset: Asset; variant: AssetVariant } | null;
  regionDraftSelection: Set<string>;
  /** Resolved participant highlight (shared with the work preview page). */
  highlight: HighlightState | null;
  /** MOD-802: true while the highlight is fading out (150ms). */
  highlightLeaving?: boolean;
  /**
   * FEAT-D03: reports the value the adaptive pass computed, so the 「地图基本
   * 信息」drawer can show it as the default of the 方格大小 field.
   */
  onAutoCellSize?: (cellSize: number) => void;
  onSelect: (selection: Selection | null) => void;
  onSelectRegion: (id: string | null) => void;
  /** v0.10.7: 地图编辑点击区域标题弹信息框；谜题/游戏页不传此 prop。 */
  onSelectRegionLabel?: (id: string) => void;
  onDraftAdd: (cells: Coord[]) => void;
  onDraftRemove: (cells: Coord[]) => void;
  onDraftClear: () => void;
  onToggleRegionCell: (coord: CellCoord) => void;
  onPlaceItem: (coord: CellCoord, w?: number, h?: number, fits?: boolean) => void;
  onErase: (coord: CellCoord) => void;
  onZoom: (zoom: number) => void;
  onPan: (pan: { x: number; y: number }) => void;
}

type Interaction =
  | {
      kind: 'pan';
      startX: number;
      startY: number;
      panX: number;
      panY: number;
      /**
       * FEAT-E03: the gesture started on the empty area **outside** the board.
       * A plain click there still clears the selection; a drag pans the canvas.
       */
      outside: boolean;
      moved: boolean;
    }
  | { kind: 'erase'; visited: Set<string> }
  /**
   * v0.7.0: the region tool is a free brush only — the rectangle mode is gone.
   * `erase` is fixed for the whole stroke: `Alt` always removes, otherwise the
   * first cell decides (already selected → the stroke subtracts), which is what
   * makes a wrong single cell correctable without a separate clear step.
   */
  | { kind: 'brush'; keys: Set<string>; erase: boolean }
  | null;

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  {
    gridSize,
    cells,
    assetsById,
    regions,
    style,
    selectedRegionId,
    zoom,
    pan,
    selection,
    activeTool,
    spaceHeld,
    showRulers,
    pendingVariant,
    regionDraftSelection,
    highlight,
    highlightLeaving = false,
    onAutoCellSize,
    onSelect,
    onSelectRegion,
    onSelectRegionLabel,
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
  /**
   * FEAT-D03: the adaptive pass writes `autoCellSize`; the map style may
   * override it. The effective width is what every layer and hit test uses.
   */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const [hover, setHover] = useState<CellCoord | null>(null);
  /** v0.8.7 §8：光标在纸上的像素位置 —— 物品名称提示贴它。 */
  const [hoverPoint, setHoverPoint] = useState<CanvasPoint | null>(null);
  const [brushCells, setBrushCells] = useState<Coord[]>([]);
  /** Set when the pointer sits directly on a region label (§2.2). */
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  /** v0.3.9 FEAT-E03: dragging the empty area outside the board pans it. */
  const [panning, setPanning] = useState(false);

  const viewRef = useRef({ zoom, pan, onZoom, onPan, onAutoCellSize });
  viewRef.current = { zoom, pan, onZoom, onPan, onAutoCellSize };
  /** Keeps `centerView` stable when only unrelated style fields change. */
  const styleRef = useRef(style);
  styleRef.current = style;
  const styleCellSize = style.cellSize;

  const total = gridSize * cellSize;

  /**
   * v0.3.9 FEAT-E02: ruler geometry comes from the map style — the text size
   * scales like every other font (× `cellSize / BASE_CELL` × `zoom`) and `gap`
   * is the literal text→board distance, so the strip has to grow with them.
   */
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

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
    const insets = canvasInsets({
      showRulers,
      showBottomBar: true,
      rulerSize: rulerStrip,
    });
    const next = computeCellSizeForInsets({
      width: rect.width,
      height: rect.height,
      gridSize,
      insets,
    });
    setAutoCellSize((previous) => (previous === next ? previous : next));
    viewRef.current.onAutoCellSize?.(next);
    viewRef.current.onZoom(1);
    // FEAT-D03: centre on the **effective** width, so a manual override stays
    // centred too.
    viewRef.current.onPan(
      centeredPan(rect, insets, gridSize, effectiveCellSize(next, styleRef.current), 1),
    );
  }, [gridSize, showRulers, styleCellSize, rulerStrip]);

  /**
   * v0.6.3: one zoom step around the viewport centre — the bottom bar's ±
   * buttons. It is the button-shaped twin of the Ctrl+wheel handler below
   * (same anchor maths, pointer swapped for the viewport centre), and it has
   * to live here for one reason the pages cannot supply: a zoom step changes
   * the ruler strip, which re-creates `centerView`, which re-runs the
   * adaptive auto-centre effect above. That effect resets the view back to
   * 100% unless the view is marked as user-adjusted — so the button path sets
   * the same flag the wheel path sets. Without it the buttons appear dead:
   * the store takes the new zoom for one render and the effect immediately
   * centres it away, and only a wheel zoom (which sets the flag) sticks.
   */
  const zoomByStep = useCallback((direction: 1 | -1): void => {
    const node = containerRef.current;
    if (!node) return;
    const view = viewRef.current;
    const next = clampZoom(view.zoom + direction * ZOOM_STEP);
    if (next === view.zoom) return;
    userPannedRef.current = true;
    const rect = node.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    view.onPan(zoomAtPoint(center, rect, view.pan, next, view.zoom));
    view.onZoom(next);
  }, []);

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord => {
      const node = containerRef.current;
      const rect = node ? node.getBoundingClientRect() : new DOMRect();
      return clientToCell(clientX, clientY, { rect, pan, zoom, cellSize });
    },
    [pan, zoom, cellSize],
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
      zoomByStep,
    }),
    [toCell, centerView, zoomByStep],
  );

  /**
   * OPT-A01 §1.2 生效时机: adapt on mount and on every resize, but only while
   * the user has not taken the view over (Ctrl+wheel, the ± buttons, or a
   * canvas drag). A manual interaction flips `userPannedRef`; "重置视图"
   * re-arms it.
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
      // Escape cancels an in-progress region stroke: the draft selection goes
      // away, exactly like the old anchor-then-click flow did.
      onDraftClear();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDraftClear]);

  useEffect(() => {
    setBrushCells([]);
  }, [activeTool]);

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
        outside: false,
        moved: false,
      };
      setPanning(true);
      return;
    }

    if (event.button !== 0) return;

    const coord = toCell(event.clientX, event.clientY);
    const inBounds = isInBounds(coord, gridSize);

    if (activeTool === 'region') {
      if (!inBounds) return;
      node.setPointerCapture(event.pointerId);
      const key = coordKey(coord.x, coord.y);
      // 起点格已选中 → 这一笔整段清除（Alt 永远强制清除）。
      const erase = brushStrokeErases(regionDraftSelection.has(key), event.altKey);
      const keys = new Set<string>([key]);
      interactionRef.current = { kind: 'brush', keys, erase };
      setBrushCells(Array.from(keys).map((item) => item.split(',').map(Number) as Coord));
      return;
    }

    // FEAT-E03: the empty area outside the board is the pan handle. A drag
    // moves the canvas; a plain click still clears the selection (handled on
    // pointerup, once we know the gesture did not move).
    if (!inBounds) {
      node.setPointerCapture(event.pointerId);
      interactionRef.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        panX: pan.x,
        panY: pan.y,
        outside: true,
        moved: false,
      };
      setPanning(true);
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
      if (pendingVariant) {
        // v0.10.6: 尺寸由形态给；左上角 = 点中的格子，放不下交给调用方提示。
        const size = resolveVariantFootprint(pendingVariant.variant, pendingVariant.asset.type);
        const fitsHere = fits(coord.x, coord.y, size.w, size.h);
        onPlaceItem(coord, size.w, size.h, fitsHere);
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
    // v0.8.7 §8：提示跟手 —— 位置只在这一格真的命中物品时才会被画出来。
    const node = containerRef.current;
    if (node) {
      setHoverPoint(
        clientToCanvasPoint(event.clientX, event.clientY, {
          rect: node.getBoundingClientRect(),
          pan,
          zoom,
          cellSize,
        }),
      );
    }

    const interaction = interactionRef.current;
    if (!interaction) return;

    if (interaction.kind === 'pan') {
      interaction.moved = true;
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

    if (interaction?.kind === 'pan') {
      setPanning(false);
      // A click (no drag) on the empty area outside the board clears the
      // selection, exactly like the v0.3.8 behaviour.
      if (interaction.outside && !interaction.moved) {
        onSelect(null);
        onSelectRegion(null);
      }
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

  /**
   * FEAT-E04: the cursor is `pointer` over every board cell (whatever the
   * active tool) and `grab` on the empty area outside it, which doubles as the
   * pan handle (FEAT-E03).
   */
  const cursor = panning || spaceHeld || activeTool === 'pan'
    ? 'grabbing'
    : hover !== null
      ? 'pointer'
      : 'grab';

  const showPreview =
    activeTool === 'select' && hover !== null && pendingVariant !== null;
  const previewSize = pendingVariant
    ? resolveVariantFootprint(pendingVariant.variant, pendingVariant.asset.type)
    : { w: 1, h: 1 };

  // ---- OPT-901 §1.2.5: cells holding a non-standable object ----
  const blockingCells = useMemo(
    () => collectBlockingCells(cells, assetsById),
    [cells, assetsById],
  );
  const itemCells = useMemo(() => collectItemCells(cells), [cells]);

  // ---- OPT-902 §2.1~2.4: cursor box + region emphasis + item lift ----
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, blockingCells, itemCells, regions }),
    [hover, blockingCells, itemCells, regions],
  );
  /** §2.2: hovering any cell of a region emphasises that region. */
  const hoveredRegionId = labelRegionId ?? hoverEffects.regionId;
  const hoveredRegion = hoveredRegionId
    ? regions.find((item) => item.id === hoveredRegionId) ?? null
    : null;

  // Cell content is clickable (selection only) unless a brush item is armed or
  // the user is panning; it never carries drag handlers (BUG-405).
  // v0.10.2：物品层与区域标签不再各自接管指针，画布容器是唯一的入口。
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
            width: previewSize.w * cellSize,
            height: previewSize.h * cellSize,
          }}
        />
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
   * v0.3.10 FEAT-F01: the ruler strips are a shared component
   * (`MapRulerStrips`) so the work preview renders the identical geometry.
   * Their thickness comes from the same `rulerStripSize` pass the editor uses
   * to reserve the top / left bands (FEAT-E02).
   */
  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-muted/30"
      style={{ cursor, touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={() => {
        setHover(null);
        setHoverPoint(null);
      }}
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
          style={{
            width: total,
            height: total,
            zIndex: MAP_LAYER_Z.canvasBase,
            ...canvasShadowStyle(style),
          }}
        />

        {/* 《画布图层优先级规范》§2 — rendered bottom-up; the z-index of each
            layer is pinned by MAP_LAYER_Z so the stacking order matches. */}
        <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
        <MapHighlightLayer
          highlight={highlight}
          regions={regions}
          cellSize={cellSize}
          style={style}
          leaving={highlightLeaving}
        />
        <MapRegionHighlightLayer region={hoveredRegion} cellSize={cellSize} style={style} />
        <MapBlockingMaskLayer blockingCells={blockingCells} cellSize={cellSize} style={style} />
        <MapRegionOutlineLayer
          regions={regions}
          gridSize={gridSize}
          cellSize={cellSize}
          style={style}
          selectedRegionId={selectedRegionId}
        />
        {draftOverlay}

        <MapGridSeparatorLayer gridSize={gridSize} cellSize={cellSize} style={style} />
        <MapItemLayer
          cells={cells}
          assetsById={assetsById}
          cellSize={cellSize}
          gridSize={gridSize}
          // v0.9.1 §5：物品描边（宽度 0 = 不描边）。
          itemOutline={style.itemOutline}
          // OPT-C06: object artwork is inset inside its footprint.
          padding={itemPadding(cellSize)}
          hover={hover}
          pointer={hoverPoint}
        />

        <MapRegionLabelLayer
          regions={regions}
          cellSize={cellSize}
          style={style}
          hoveredRegionId={hoveredRegionId}
          onHover={setLabelRegionId}
          onSelect={onSelectRegionLabel}
        />

        <MapCanvasFrameLayer gridSize={gridSize} cellSize={cellSize} style={style} />

        {selectionOverlay}
        {/* 层 2 操作提示框 first, 层 1 鼠标提示框 on top of it. */}
        <MapOperationCursorBoxLayer
          cell={cursorBoxes.operation}
          cellSize={cellSize}
          style={style}
        />
        <MapMouseCursorBoxLayer
          cell={cursorBoxes.mouse}
          blocked={cursorBoxes.mouse?.blocked ?? false}
          cellSize={cellSize}
          style={style}
        />
      </div>

      {showRulers ? (
        <MapRulerStrips
          gridSize={gridSize}
          cellSize={cellSize}
          zoom={zoom}
          pan={pan}
          total={total}
          style={style}
          hover={hover}
          operationCell={selectionCell}
        />
      ) : null}
    </div>
  );
});
