import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Minus, Plus, RotateCcw, Ruler } from 'lucide-react';
import {
  DEFAULT_CELL_SIZE,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type Item,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { ParticipantPanel } from '@/components/map-editor/ParticipantPanel';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapObjectLayer } from '@/components/map/MapItemLayers';
import {
  MapRegionFillLayer,
  MapRegionHighlightLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapRegionLayers';
import {
  MapHighlightLayer,
  MapMouseCursorBoxLayer,
  MapNonStandableMaskLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapOverlayLayers';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import { useCharacters } from '@/hooks/useCharacters';
import { useItems } from '@/hooks/useItems';
import { useHighlight } from '@/hooks/useHighlight';
import { usePuzzle, usePuzzleMapContext } from '@/hooks/usePuzzles';
import { clampZoom, clientToCell, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import {
  collectNoStandCells,
  collectObjectCells,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import { canvasInsets, centeredPan, computeCellSizeForInsets } from '@/lib/canvasSize';
import { cellScale, objectPadding, scaleFontSize } from '@/lib/canvasScale';
import { effectiveCellSize, resolveMapStyle } from '@/lib/mapStyle';
import { resolveHighlight } from '@/lib/highlight';
import { rulerStripSize } from '@/lib/ruler';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationEvent,
  type LinkageActivationState,
} from '@/lib/linkageActivation';

/**
 * FEAT-F01: the preview's ruler toggle. The editor owns its own switch; this
 * key only persists the reader's preference across reloads.
 */
const RULER_STORAGE_KEY = 'loredoku.puzzleview.ruler';

/** Reads the persisted toggle, defaulting to visible (the editor's default). */
function readStoredRulerVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(RULER_STORAGE_KEY) !== 'hidden';
}

/**
 * v0.5.0 FEAT-K01 / §15 Q18 (docs/v0.5.0.md): the puzzle's read-only preview,
 * at `/puzzles/:puzzleId/view`.
 *
 * - the **canvas** comes from `GET /api/puzzles/:id/map` (the referenced map
 *   version, §5.1);
 * - the **roster** and the **palette** come from the puzzle's own draft
 *   (§5.1 / Q16).
 *
 * Everything else — layout, rulers, hover affordances, the read-only
 * `ParticipantPanel` (FIX-F07) and the MOD-802 linkage preview — is unchanged,
 * so the preview stays pixel-identical to the editor's canvas.
 */
export function PuzzleViewPage(): JSX.Element {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const navigate = useNavigate();

  const id = Number(puzzleId);
  const valid = Number.isFinite(id) && id > 0;

  const detailQuery = usePuzzle(valid ? id : null);
  const mapQuery = usePuzzleMapContext(valid ? id : null);
  // A referenced version may point at items/characters that are now inactive.
  const itemsQuery = useItems({});
  const charactersQuery = useCharacters({});

  const {
    highlight,
    show: showHighlight,
    clear: clearHighlight,
    leaving: highlightLeaving,
  } = useHighlight();
  // MOD-802: single-active linkage preview — hover activates, click toggles.
  const [activation, setActivation] = useState<LinkageActivationState>(INACTIVE_ACTIVATION);
  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  /** OPT-902: the cell under the cursor, driving the hover affordances. */
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** OPT-A01 §1.2: stops the automatic re-fit after a manual zoom / pan. */
  const userAdjustedRef = useRef(false);

  const draft = detailQuery.data?.data;
  const mapContext = mapQuery.data;

  useEffect(() => {
    // OPT-G01: the tab is titled with the puzzle's name once the detail lands.
    const name = detailQuery.data?.name;
    document.title = name ? `${name} · 格物` : '谜题预览 · 格物';
  }, [detailQuery.data?.name]);

  const itemsById = useMemo(() => {
    const map = new Map<number, Item>();
    for (const item of itemsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [itemsQuery.data]);

  const charactersById = useMemo(() => {
    const map = new Map<number, Character>();
    for (const character of charactersQuery.data ?? []) map.set(character.id, character);
    return map;
  }, [charactersQuery.data]);

  const cells = useMemo(() => {
    const map = new Map<string, NonNullable<typeof mapContext>['cells'][string]>();
    for (const key of Object.keys(mapContext?.cells ?? {})) {
      const cell = mapContext?.cells[key];
      if (cell) map.set(key, cell);
    }
    return map;
  }, [mapContext]);

  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => draft?.characterSlots ?? [],
    [draft],
  );
  const regions = useMemo(() => mapContext?.regions ?? [], [mapContext]);
  const gridSize = mapContext?.gridSize ?? 0;
  /**
   * v0.3.8 FEAT-D02: the referenced version carries the map's display
   * constants, so a puzzle preview renders exactly like the editor it came
   * from. Q16: the linkage palette is **not** part of `style` any more — the
   * puzzle owns it.
   */
  const style = useMemo(() => resolveMapStyle(mapContext?.style), [mapContext]);
  const linkageColors = useMemo(() => draft?.linkageColors ?? [], [draft]);
  /** OPT-A01 §1.1: adaptive cell width at 100% zoom (shared with the editor). */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;
  /**
   * FEAT-F01 / FEAT-F02: the strip thickness is derived from the map's
   * `style.ruler` with the **same** `rulerStripSize` pass the editor uses, and
   * the result is fed back into the adaptive insets so the reserved top / left
   * bands match the rendered strips pixel for pixel.
   */
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont =
    scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale) * zoom;
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  // ---- OPT-901 §1.2.5 / OPT-902 §2.1~2.4 ----
  const noStandCells = useMemo(
    () => collectNoStandCells(cells, itemsById),
    [cells, itemsById],
  );
  const objectCells = useMemo(() => collectObjectCells(cells), [cells]);
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, noStandCells, objectCells, regions }),
    [hover, noStandCells, objectCells, regions],
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

  /**
   * MOD-802: the highlight is a projection of the single-active state
   * machine, so it stays up until the activation ends and then fades out
   * over 150ms.
   */
  const activeSlot =
    activation.activeParticipantId === null
      ? null
      : slots[activation.activeParticipantId] ?? null;

  useEffect(() => {
    if (!activeSlot) {
      clearHighlight();
      return;
    }
    showHighlight(
      resolveHighlight(activeSlot.linkages, {
        gridSize,
        cells,
        characterSlots: slots,
        regions,
        style,
        linkageColors,
      }),
    );
  }, [activeSlot, gridSize, cells, slots, regions, style, linkageColors, showHighlight, clearHighlight]);

  /**
   * MOD-802 §1.2.5: characters referenced by the active linkage get a
   * param-colour outline (a single `boxShadow` ring, FIX-E04) in the roster.
   */
  const highlightedSlots = useMemo(() => {
    const set = new Set<number>();
    for (const character of highlight?.characters ?? []) set.add(character.slotIndex);
    return set;
  }, [highlight]);

  const highlightColors = useMemo(() => {
    const map = new Map<number, string>();
    for (const character of highlight?.characters ?? []) {
      map.set(character.slotIndex, character.color);
    }
    return map;
  }, [highlight]);

  // A new snapshot must not inherit a stale activation or hover.
  useEffect(() => {
    setActivation(INACTIVE_ACTIVATION);
    setHover(null);
    setLabelRegionId(null);
  }, [mapContext]);

  const handleActivation = (event: LinkageActivationEvent): void =>
    setActivation((state) => reduceLinkageActivation(state, event));

  if (detailQuery.isLoading || mapQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载谜题…
      </div>
    );
  }

  if (!draft || !mapContext || detailQuery.isError || mapQuery.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">谜题不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/puzzles')}>
          返回谜题列表
        </Button>
      </div>
    );
  }

  const mapVersionNo = detailQuery.data?.mapVersionNo ?? mapContext.versionNo;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/puzzles')} title="返回谜题列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{detailQuery.data?.name ?? '谜题'}</span>
            {/* OPT-G01: the referenced map version is a badge, not part of the title. */}
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              v{mapVersionNo}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {gridSize} × {gridSize}
            </span>
            <span className="text-xs text-muted-foreground">只读预览</span>
          </div>
          {detailQuery.data?.description ? (
            <p className="truncate text-xs text-muted-foreground">
              {detailQuery.data.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          {/* FEAT-F01: the reader can hide the strips; the choice is persisted. */}
          <Button
            variant="ghost"
            size="icon"
            className={showRulers ? 'bg-accent text-accent-foreground' : undefined}
            title="显示 / 隐藏标尺"
            aria-label="显示 / 隐藏标尺"
            onClick={() => setShowRulers((current) => !current)}
          >
            <Ruler className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="缩小" onClick={() => zoomBy(-1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <Button variant="ghost" size="icon" title="放大" onClick={() => zoomBy(1)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" title="重置视图" onClick={fit}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          {/* v0.5.7: 视图控件与主题分开，别让主题混进缩放组。 */}
          <span className="mx-1 h-5 w-px bg-border" />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* FIX-F07: the very same matrix panel the editor uses — read-only, so
            there is nothing to drag or remove. */}
        <ParticipantPanel
          slots={slots}
          charactersById={charactersById}
          selectedSlotIndex={null}
          draggingIndex={null}
          activeSlotIndex={activation.activeParticipantId}
          highlightedSlots={highlightedSlots}
          highlightColors={highlightColors}
          readOnly
          onActivateHover={(index) => handleActivation({ type: 'enter', participantId: index })}
          onDeactivateHover={(index) => handleActivation({ type: 'leave', participantId: index })}
          onActivateClick={(index) => handleActivation({ type: 'click', participantId: index })}
        />

        <main
          ref={containerRef}
          className="relative min-h-0 flex-1 overflow-hidden bg-muted/30"
          style={{
            cursor: spaceHeld ? 'grab' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            if (event.button === 1 || spaceHeld) {
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
            <MapBackgroundLayer cells={cells} itemsById={itemsById} cellSize={cellSize} />
            <MapRegionFillLayer regions={regions} gridSize={gridSize} cellSize={cellSize} />
            <MapHighlightLayer
              highlight={highlight}
              regions={regions}
              cellSize={cellSize}
              style={style}
              leaving={highlightLeaving}
            />
            <MapRegionHighlightLayer region={hoveredRegion} cellSize={cellSize} style={style} />
            <MapNonStandableMaskLayer noStandCells={noStandCells} cellSize={cellSize} style={style} />
            <MapRegionOutlineLayer
              regions={regions}
              gridSize={gridSize}
              cellSize={cellSize}
              style={style}
            />
            <MapGridSeparatorLayer gridSize={gridSize} cellSize={cellSize} style={style} />
            <MapObjectLayer
              cells={cells}
              itemsById={itemsById}
              cellSize={cellSize}
              // OPT-C06: object artwork is inset inside its footprint.
              padding={objectPadding(cellSize)}
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
    </div>
  );
}
