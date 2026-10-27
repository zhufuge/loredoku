import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Hand, Minus, Plus, RotateCcw, Ruler } from 'lucide-react';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import {
  DEFAULT_CELL_SIZE,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type Asset,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapItemLayer } from '@/components/map/MapAssetLayers';
import {
  MapRegionHighlightLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapRegionLayers';
import {
  MapMouseCursorBoxLayer,
  MapBlockingMaskLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapOverlayLayers';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import { useAssets } from '@/hooks/useAssets';
import { useMapCanvas } from '@/hooks/useMapCanvas';
import { clampZoom, clientToCell, isInBounds, startsPan, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import {
  collectBlockingCells,
  collectItemCells,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import { canvasInsets, centeredPan, computeCellSizeForInsets } from '@/lib/canvasSize';
import { cellScale, itemPadding, scaleFontSize } from '@/lib/canvasScale';
import { effectiveCellSize, resolveMapStyle } from '@/lib/mapStyle';
import { rulerStripSize } from '@/lib/ruler';

/**
 * FEAT-F01: the preview's ruler toggle. The editor owns its own switch; this
 * key only persists the reader's preference across reloads.
 */
const RULER_STORAGE_KEY = 'loredoku.mapview.ruler';

/** Reads the persisted toggle, defaulting to visible (the editor's default). */
function readStoredRulerVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(RULER_STORAGE_KEY) !== 'hidden';
}

/**
 * 只读画布预览，路由 `/maps/:mapId/views`。
 *
 * v0.7.1：**一条 URL 只由 `:mapId` 决定看什么**。`maps` 合并后草稿行与版本行
 * 都自带 `data`，所以不再有「草稿行 → 去血统里找最新版本号」这一步，`?v=`
 * 整个退役：
 *
 * | `:mapId` 命中 | 渲染 |
 * |---|---|
 * | 版本行 | 该行 `data`（发布时冻结的快照） |
 * | 草稿行 | 该行 `data`；`null` 时显示「该草稿还没有画布」 |
 * | 软删版本行 | 照常渲染（读取口不过滤软删，与 fork 源同口径） |
 *
 * It is the old work preview page with the participant half removed: a map
 * version is a frozen canvas, and participants moved to puzzles in v0.5.0
 * (SPEC-K12 / §5.1), so there is no roster to show here — the canvas is the
 * whole entry. Everything else (layout, rulers, hover affordances, the OPT-A01
 * adaptive fit) is unchanged from the page this replaced.
 */
export function MapViewPage(): JSX.Element {
  const { mapId: mapIdParam } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const mapId = Number(mapIdParam);
  const valid = Number.isFinite(mapId) && mapId > 0;

  /**
   * v0.7.4 (docs/v0.7.4.md §3)：从编辑器头部的「预览」进来时（`state.from =
   * 'editor'`），返回键回编辑器 —— 预览就是为了「看一眼再改」，退到地图列表等于
   * 把作者丢出去。直接打开这条 URL 的读者仍回列表。
   */
  const fromEditor = (location.state as { from?: string } | null)?.from === 'editor';
  const backTarget = fromEditor ? `/maps/${mapId}/edit` : '/maps';
  const backTitle = fromEditor ? '返回编辑器' : '返回地图列表';

  const mapQuery = useMapCanvas(valid ? mapId : Number.NaN);
  // A published snapshot may reference items that are now inactive.
  const assetsQuery = useAssets({});

  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /**
   * 手形开关：打开后左键直接拖动视图，不必按空格或中键。**默认打开** —— 预览页
   * 只读，左键没有别的含义，默认能拖才符合「看画」的直觉。
   */
  const [panMode, setPanMode] = useState(true);
  /** OPT-902: the cell under the cursor, driving the hover affordances. */
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** OPT-A01 §1.2: stops the automatic re-fit after a manual zoom / pan. */
  const userAdjustedRef = useRef(false);

  const entry = mapQuery.data?.map;
  const draft = mapQuery.data?.draft;

  useEffect(() => {
    // OPT-G01: the tab is titled with the map name once the response lands.
    document.title = entry ? `${entry.name} · 格物` : '地图预览 · 格物';
  }, [entry]);

  const assetsById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const item of assetsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [assetsQuery.data]);

  const cells = useMemo(() => {
    const map = new Map<string, NonNullable<typeof draft>['cells'][string]>();
    for (const key of Object.keys(draft?.cells ?? {})) {
      const cell = draft?.cells[key];
      if (cell) map.set(key, cell);
    }
    return map;
  }, [draft]);

  const regions = useMemo(() => draft?.regions ?? [], [draft]);
  const gridSize = draft?.gridSize ?? 0;
  /**
   * v0.3.8 FEAT-D02: the snapshot carries the map's display constants, so a
   * published version renders exactly like the editor it came from.
   */
  const style = useMemo(() => resolveMapStyle(draft?.style), [draft]);
  /** OPT-A01 §1.1: adaptive cell width at 100% zoom (shared with the editor). */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;
  /**
   * FEAT-F01 / FEAT-F02: the strip thickness is derived from the snapshot's
   * `style.ruler` with the **same** `rulerStripSize` pass the editor uses, and
   * the result is fed back into the adaptive insets so the reserved top / left
   * bands match the rendered strips pixel for pixel.
   */
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  // ---- OPT-901 §1.2.5 / OPT-902 §2.1~2.4 ----
  const blockingCells = useMemo(
    () => collectBlockingCells(cells, assetsById),
    [cells, assetsById],
  );
  const itemCells = useMemo(() => collectItemCells(cells), [cells]);
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, blockingCells, itemCells, regions }),
    [hover, blockingCells, itemCells, regions],
  );
  const hoveredRegionId = labelRegionId ?? hoverEffects.regionId;
  const hoveredRegion = hoveredRegionId
    ? regions.find((region) => region.id === hoveredRegionId) ?? null
    : null;

  /** Maps a client point to a board cell, or `null` when outside the board. */
  const toCell = (clientX: number, clientY: number): CellCoord | null => {
    const node = containerRef.current;
    if (!node || gridSize === 0) return null;
    const coord = clientToCell(clientX, clientY, {
      rect: node.getBoundingClientRect(),
      pan,
      zoom,
      cellSize,
    });
    return isInBounds(coord, gridSize) ? coord : null;
  };

  /**
   * OPT-A01 §1.2: measure the viewport and re-fit the board. Clears the
   * manual-adjustment flag, so this doubles as "重置视图".
   *
   * FEAT-F02: the inset carries `showRulers` / `rulerSize`, so the adaptive
   * pass reserves exactly the bands the ruler strips occupy. The preview has no
   * floating bottom toolbar, hence `showBottomBar: false`.
   */
  const fit = useCallback((): void => {
    const node = containerRef.current;
    userAdjustedRef.current = false;
    if (!node || gridSize === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const insets = canvasInsets({
      showRulers,
      showBottomBar: false,
      rulerSize: rulerStrip,
    });
    const next = computeCellSizeForInsets({ width: rect.width, height: rect.height, gridSize, insets });
    setAutoCellSize((previous) => (previous === next ? previous : next));
    setZoom(1);
    setPan(centeredPan(rect, insets, gridSize, effectiveCellSize(next, style), 1));
  }, [gridSize, showRulers, rulerStrip, style]);

  // The ResizeObserver callback must always see the latest `fit` (it depends on
  // the ruler toggle and on the computed strip thickness), so the effect keeps
  // a ref instead of closing over one particular render's closure.
  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      if (userAdjustedRef.current) return;
      fitRef.current();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize]);

  // FEAT-F01 §4: toggling the strips changes the reserved bands, so the board
  // is re-fitted once (and the reader's choice is persisted).
  useEffect(() => {
    fitRef.current();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RULER_STORAGE_KEY, showRulers ? 'visible' : 'hidden');
    }
  }, [showRulers]);

  useEffect(() => {
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const zoomBy = (direction: 1 | -1): void => {
    const rect = containerRef.current?.getBoundingClientRect() ?? null;
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    if (rect) {
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setPan(zoomAtPoint(center, rect, pan, next, zoom));
    }
    setZoom(next);
  };

  if (mapQuery.isLoading) {
    return <LoadingScreen caption="正在加载地图…" />;
  }

  if (!valid || mapQuery.isError || !entry) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">地图不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/maps')}>
          返回地图列表
        </Button>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">该草稿还没有画布，去编辑器里先初始化。</p>
        <Button variant="outline" onClick={() => navigate('/maps')}>
          返回地图列表
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton
            variant="ghost"
            icon={<ArrowLeft className="h-4 w-4" />}
            label={backTitle}
            onClick={() => navigate(backTarget)}
          />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{entry.name}</span>
            {/* OPT-G01: 版本是徽标而非标题的一部分；草稿行标「草稿」。 */}
            <span className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground">
              {entry.versionNo !== null ? `v${entry.versionNo}` : '草稿'}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-2xs text-secondary-foreground">
              {gridSize} × {gridSize}
            </span>
            <span className="text-xs text-muted-foreground">只读预览</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            icon={<Hand className="h-4 w-4" />}
            label="平移视图（拖动画布）"
            className={panMode ? 'bg-accent text-accent-foreground' : undefined}
            aria-pressed={panMode}
            onClick={() => setPanMode((current) => !current)}
          />
          {/* FEAT-F01: the reader can hide the strips; the choice is persisted. */}
          <IconButton
            variant="ghost"
            icon={<Ruler className="h-4 w-4" />}
            label="显示 / 隐藏标尺"
            className={showRulers ? 'bg-accent text-accent-foreground' : undefined}
            onClick={() => setShowRulers((current) => !current)}
          />
          <IconButton
            variant="ghost"
            icon={<Minus className="h-4 w-4" />}
            label="缩小"
            onClick={() => zoomBy(-1)}
          />
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            variant="ghost"
            icon={<Plus className="h-4 w-4" />}
            label="放大"
            onClick={() => zoomBy(1)}
          />
          <IconButton
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" />}
            label="重置视图"
            onClick={fit}
          />
          {/* v0.5.7: 视图控件与主题分开，别让主题混进缩放组。 */}
          <span className="mx-1 h-5 w-px bg-border" />
          <ThemeToggle />
        </div>
      </header>

      <main
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-muted/30"
        style={{
          cursor: spaceHeld || panMode ? 'grab' : 'default',
          touchAction: 'none',
        }}
        onPointerDown={(event) => {
          if (startsPan({ button: event.button, spaceHeld, panMode })) {
            event.currentTarget.setPointerCapture(event.pointerId);
            userAdjustedRef.current = true;
            panRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
          }
        }}
        onPointerMove={(event) => {
          // OPT-902: the hover affordances follow the cursor even while panning.
          setHover(toCell(event.clientX, event.clientY));
          if (!panRef.current) return;
          setPan({
            x: event.clientX - panRef.current.x,
            y: event.clientY - panRef.current.y,
          });
        }}
        onPointerUp={() => {
          panRef.current = null;
        }}
        onPointerCancel={() => {
          panRef.current = null;
        }}
        onPointerLeave={() => setHover(null)}
        onWheel={(event) => {
          if (!(event.ctrlKey || event.metaKey)) return;
          const node = containerRef.current;
          if (!node) return;
          event.preventDefault();
          const next = clampZoom(zoom + (event.deltaY > 0 ? -1 : 1) * ZOOM_STEP);
          if (next === zoom) return;
          userAdjustedRef.current = true;
          const rect = node.getBoundingClientRect();
          setPan(
            zoomAtPoint({ x: event.clientX, y: event.clientY }, rect, pan, next, zoom),
          );
          setZoom(next);
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
            style={{ width: total, height: total, zIndex: MAP_LAYER_Z.canvasBase }}
          />

          {/* 《画布图层优先级规范》§2 — bottom-up, pinned by MAP_LAYER_Z. */}
          <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
          <MapRegionHighlightLayer region={hoveredRegion} cellSize={cellSize} style={style} />
          <MapBlockingMaskLayer blockingCells={blockingCells} cellSize={cellSize} style={style} />
          <MapRegionOutlineLayer
            regions={regions}
            gridSize={gridSize}
            cellSize={cellSize}
            style={style}
          />
          <MapGridSeparatorLayer gridSize={gridSize} cellSize={cellSize} style={style} />
          <MapItemLayer
            cells={cells}
            assetsById={assetsById}
            cellSize={cellSize}
            // OPT-C06: object artwork is inset inside its footprint.
            padding={itemPadding(cellSize)}
            hover={hover}
          />

          <MapRegionLabelLayer
            regions={regions}
            cellSize={cellSize}
            style={style}
            hoveredRegionId={hoveredRegionId}
            onHover={setLabelRegionId}
          />

          <MapCanvasFrameLayer gridSize={gridSize} cellSize={cellSize} style={style} />

          {/* 层 1 — 鼠标提示框（预览页无操作提示框）. */}
          <MapMouseCursorBoxLayer
            cell={hoverEffects.cell}
            blocked={hoverEffects.blocked}
            cellSize={cellSize}
            style={style}
          />
        </div>

        {/* FEAT-F01: the shared ruler strips. The preview has no operation
            cursor box, so `operationCell` stays `null` — only the hovered
            row / column turns dark grey. */}
        {showRulers ? (
          <MapRulerStrips
            gridSize={gridSize}
            cellSize={cellSize}
            zoom={zoom}
            pan={pan}
            total={total}
            style={style}
            hover={hover}
          />
        ) : null}
      </main>
    </div>
  );
}
