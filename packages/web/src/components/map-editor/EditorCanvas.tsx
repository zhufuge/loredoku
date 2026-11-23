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
import type { RegionCellEdit } from '@/lib/regionEdit';
import { hitTestCell, type CellMap } from '@/lib/hitTest';
import type { HighlightState } from '@/lib/highlight';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapDecorationLayer, MapItemLayer } from '@/components/map/MapAssetLayers';
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

/** 两个光标框是图层规范的层 1 / 层 2；编辑器自己的预览只能压在它们下面，绝不能盖住悬停 / 操作指示。 */
const EDITOR_OVERLAY_Z = MAP_LAYER_Z.operationCursorBox - 1;
const DRAFT_OVERLAY_Z = MAP_LAYER_Z.operationCursorBox - 2;

/** EditorCanvas no longer carries character drag state (CLAR-603). */
export interface EditorCanvasHandle {
  clientToCell: (clientX: number, clientY: number) => CellCoord;
  containsPoint: (clientX: number, clientY: number) => boolean;
  getRect: () => DOMRect | null;
  centerView: () => void;
  /** 视口中心 ± 一格缩放（底栏按钮）：必须与滚轮路径一样把视图标记为用户调整过（见 `zoomByStep` 实现）。 */
  zoomByStep: (direction: 1 | -1) => void;
}

interface EditorCanvasProps {
  gridSize: number;
  cells: CellMap;
  assetsById: Map<number, Asset>;
  regions: DraftRegion[];
  /** FEAT-D02: the map's display constants. */
  style: MapStyle;
  selectedRegionId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  selection: Selection | null;
  activeTool: EditorTool;
  spaceHeld: boolean;
  showRulers: boolean;
  /** 标尺的行列符号按主题编码查。 */
  themeCode: string;
  /** The armed (asset, variant) pair. 足迹尺寸在 variant 上。 */
  pendingVariant: { asset: Asset; variant: AssetVariant } | null;
  regionDraftSelection: Set<string>;
  /**
   * 区域格子编辑会话（`null` = 不在编辑）：有值时点 / 拖格子是往草稿里增删而不是选中，画布同时画出蓝(加) / 红(删)预览。
   */
  regionEdit?: RegionCellEdit | null;
  /** 一笔结束时的结果（`erase` 为真表示这一笔是移除）。 */
  onRegionEditStroke?: (keys: string[], erase: boolean) => void;
  /** Resolved participant highlight (shared with the work preview page). */
  highlight: HighlightState | null;
  /** MOD-802: true while the highlight is fading out (150ms). */
  highlightLeaving?: boolean;
  /** FEAT-D03: 上报自适应算出的值，供「地图基本信息」抽屉作为方格大小的默认值。 */
  onAutoCellSize?: (cellSize: number) => void;
  onSelect: (selection: Selection | null) => void;
  /** 位置条件这类「要的就是点中的那一格」的场景：多格物品的覆盖格按原格上报，不回锚点。 */
  selectExactCell?: boolean;
  onSelectRegion: (id: string | null) => void;
  /** 地图编辑点击区域标题弹信息框；谜题/游戏页不传此 prop。 */
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
      /** FEAT-E03: 手势起于棋盘外的空白处 —— 普通点击仍清空选择，拖动则平移画布。 */
      outside: boolean;
      moved: boolean;
    }
  | { kind: 'erase'; visited: Set<string> }
  /**
   * 区域工具只是自由笔刷：`erase` 整笔固定 —— `Alt` 恒移除，否则由首格决定（已选中 → 这一笔是减），这样单格点错无需另一步清除就能纠正。
   */
  | { kind: 'brush'; keys: Set<string>; erase: boolean }
  /** 区域格子编辑的一笔：形状同 `brush`，区别只在松手后交给 `onRegionEditStroke`（改草稿，不创建选区）。 */
  | { kind: 'regionEdit'; keys: Set<string>; erase: boolean }
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
    themeCode,
    pendingVariant,
    regionDraftSelection,
    regionEdit = null,
    onRegionEditStroke,
    highlight,
    highlightLeaving = false,
    onAutoCellSize,
    onSelect,
    selectExactCell = false,
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
  /** FEAT-D03: 自适应写 `autoCellSize`，地图样式可覆盖它；各图层与命中测试都用生效宽度。 */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const [hover, setHover] = useState<CellCoord | null>(null);
  /** v0.8.7 §8：光标在纸上的像素位置 —— 物品名称提示贴它。 */
  const [hoverPoint, setHoverPoint] = useState<CanvasPoint | null>(null);
  const [brushCells, setBrushCells] = useState<Coord[]>([]);
  /** Set when the pointer sits directly on a region label (§2.2). */
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  /** FEAT-E03: dragging the empty area outside the board pans it. */
  const [panning, setPanning] = useState(false);

  const viewRef = useRef({ zoom, pan, onZoom, onPan, onAutoCellSize });
  viewRef.current = { zoom, pan, onZoom, onPan, onAutoCellSize };
  /** Keeps `centerView` stable when only unrelated style fields change. */
  const styleRef = useRef(style);
  styleRef.current = style;

  const total = gridSize * cellSize;

  /** FEAT-E02: 标尺几何取自地图样式 —— 字号按 `cellSize / BASE_CELL × zoom` 缩放，`gap` 是字到版面的实际距离，条带要跟着一起长。 */
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  /**
   * OPT-A01 §1.2: 重算自适应格宽并重新居中；清 `userPannedRef` 就是重新武装自动适配，「重置视图」（Ctrl+0）也走这里。OPT-B02 §2.2: 内边距不对称 —— 底栏悬浮，高度要多减 72px。
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
  }, [gridSize, showRulers, rulerStrip]);

  /**
   * 视口中心缩放一格（底栏 ± 按钮），与下面 Ctrl+滚轮同构。**必须**在这里置 `userPannedRef`:缩放改标尺 → 重建 `centerView` → 重跑自适应,不标记的话按钮会被立刻居中回 100%（看着像死了）。
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
   * OPT-A01 §1.2 生效时机：挂载与每次 resize 都适配，但只在用户没接管视图（Ctrl+滚轮 / ± / 拖画布）时；「重置视图」重新武装。
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
      const hit = hitTestCell({ x: coord.x, y: coord.y, gridSize, cells, exactCell: selectExactCell });
      if (!hit) {
        onSelect(null);
        return;
      }
      onSelect({ type: 'cell', x: hit.x, y: hit.y });
      onSelectRegion(regionAt(regions, hit.x, hit.y)?.id ?? null);
    },
    [cells, gridSize, onSelect, onSelectRegion, regions, selectExactCell],
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

    /*
     * 区域格子编辑优先于其它工具：会话期间点格子就是增减它，不是选格 / 落笔 / 擦除。起点格已在草稿里则整笔移除（`Alt` 恒移除）。
     */
    if (regionEdit) {
      node.setPointerCapture(event.pointerId);
      const key = coordKey(coord.x, coord.y);
      const erase = brushStrokeErases(regionEdit.cells.has(key), event.altKey);
      const keys = new Set<string>([key]);
      interactionRef.current = { kind: 'regionEdit', keys, erase };
      setBrushCells([[coord.x, coord.y]]);
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
        // 尺寸由形态给；左上角 = 点中的格子，放不下交给调用方提示。
        const size = resolveVariantFootprint(
          pendingVariant.variant,
          pendingVariant.asset.type,
          pendingVariant.asset.decoration,
        );
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

    if (interaction.kind === 'regionEdit') {
      if (!inBounds) return;
      const key = coordKey(coord.x, coord.y);
      interaction.keys.add(key);
      setBrushCells(Array.from(interaction.keys).map((item) => item.split(',').map(Number) as Coord));
      return;
    }
  };

  const handlePointerUp = (_event: ReactPointerEvent<HTMLDivElement>): void => {
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

    if (interaction?.kind === 'regionEdit') {
      const keys = Array.from(interaction.keys);
      setBrushCells([]);
      if (keys.length > 0) onRegionEditStroke?.(keys, interaction.erase);
      return;
    }
  };

  /** FEAT-E04: 棋盘格上一律 `pointer`，棋盘外空白是 `grab`（兼作平移手柄，FEAT-E03）。 */
  const cursor = panning || spaceHeld || activeTool === 'pan'
    ? 'grabbing'
    : hover !== null
      ? 'pointer'
      : 'grab';

  const showPreview =
    activeTool === 'select' && hover !== null && pendingVariant !== null && regionEdit === null;
  const previewSize = pendingVariant
    ? resolveVariantFootprint(
        pendingVariant.variant,
        pendingVariant.asset.type,
        pendingVariant.asset.decoration,
      )
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
  // 物品层与区域标签不接管指针，画布容器是唯一的入口。
  const selectionCell =
    selection?.type === 'cell'
      ? { x: selection.x, y: selection.y }
      : null;

  /** OPT-A05 §4: 鼠标框跟指针，操作框停在选中的格子上；两者由一次解析产出。 */
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

  /**
   * 区域格子编辑预览：蓝 = 加入、红 = 移除。移除部分**不在**草稿里（草稿存编辑后的全集），必须拿已提交的格子减一次才画得出 —— 否则看不到「少了什么」。
   */
  const regionEditOverlay = regionEdit
    ? (() => {
        const region = regions.find((item) => item.id === regionEdit.regionId);
        const before = new Set((region?.cells ?? []).map(([x, y]) => coordKey(x, y)));
        const added: Coord[] = [];
        for (const key of regionEdit.cells) {
          if (!before.has(key)) added.push(key.split(',').map(Number) as Coord);
        }
        const removed: Coord[] = [];
        for (const key of before) {
          if (!regionEdit.cells.has(key)) removed.push(key.split(',').map(Number) as Coord);
        }
        return (
          <div
            className="pointer-events-none absolute left-0 top-0"
            style={{ zIndex: DRAFT_OVERLAY_Z }}
            data-testid="region-edit-preview"
          >
            {added.map(([x, y]) => (
              <div
                key={`edit-add-${x}-${y}`}
                data-region-edit="add"
                className="absolute"
                style={{
                  left: x * cellSize,
                  top: y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: 'rgba(34,197,94,0.28)',
                  boxShadow: 'inset 0 0 0 1px rgb(22,163,74)',
                }}
              />
            ))}
            {removed.map(([x, y]) => (
              <div
                key={`edit-remove-${x}-${y}`}
                data-region-edit="remove"
                className="absolute"
                style={{
                  left: x * cellSize,
                  top: y * cellSize,
                  width: cellSize,
                  height: cellSize,
                  backgroundColor: 'rgba(220,38,38,0.24)',
                  boxShadow: 'inset 0 0 0 1px rgb(220,38,38)',
                }}
              />
            ))}
          </div>
        );
      })()
    : null;

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

  /** FEAT-F01: 标尺条抽成共享组件 `MapRulerStrips`，作品预览才能渲染同一套几何；厚度与编辑器预留的上下左带同源。 */
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
            ...canvasShadowStyle(style, cellSize),
          }}
        />

        {/* 《画布图层优先级规范》§2 — rendered bottom-up; the z-index of each
            layer is pinned by MAP_LAYER_Z so the stacking order matches. */}
        <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
        <MapDecorationLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
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
        {regionEditOverlay}

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
          /* 联动高亮的区域，标题跟着亮（不只是边框线）。 */
          highlightedRegionIds={highlight?.regionBorders.map((border) => border.regionId)}
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
          themeCode={themeCode}
          hover={hover}
          operationCell={selectionCell}
        />
      ) : null}
    </div>
  );
});
