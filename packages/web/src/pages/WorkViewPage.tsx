import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Minus, Plus, RotateCcw } from 'lucide-react';
import {
  DEFAULT_CELL_SIZE,
  MAP_LAYER_Z,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type Item,
  type MapDraft,
} from '@murdoku/shared';
import { Button } from '@/components/ui/button';
import { GenderBadge } from '@/components/character/GenderBadge';
import {
  MapBackgroundLayer,
  MapCanvasFrameLayer,
  MapMouseCursorBoxLayer,
  MapGridSeparatorLayer,
  MapHighlightLayer,
  MapNonStandableMaskLayer,
  MapObjectLayer,
  MapRegionOutlineLayer,
  MapRegionFillLayer,
  MapRegionHighlightLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapLayers';
import { useCharacters } from '@/hooks/useCharacters';
import { useItems } from '@/hooks/useItems';
import { useHighlight } from '@/hooks/useHighlight';
import { useWorkDetail } from '@/hooks/useVersions';
import { clampZoom, clientToCell, isInBounds, zoomAtPoint, ZOOM_STEP } from '@/lib/grid';
import {
  collectNoStandCells,
  collectObjectCells,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import { canvasInsets, centeredPan, computeCellSizeForInsets } from '@/lib/canvasSize';
import { objectPadding } from '@/lib/canvasScale';
import { effectiveCellSize, resolveMapStyle } from '@/lib/mapStyle';
import { resolveHighlight } from '@/lib/highlight';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationEvent,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import { cn } from '@/lib/utils';

export function WorkViewPage(): JSX.Element {
  const { workId } = useParams<{ workId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const projectId = Number(searchParams.get('project') ?? '');
  const versionNo = Number(searchParams.get('v') ?? '');
  const valid = Number.isFinite(projectId) && Number.isFinite(versionNo);

  const detailQuery = useWorkDetail(valid ? projectId : null, valid ? versionNo : null);
  // A published snapshot may reference items/characters that are now inactive.
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
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null);
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

  const draft = detailQuery.data?.data as MapDraft | undefined;

  useEffect(() => {
    document.title = `作品 #${workId ?? '—'} 预览 · Murdoku Maker`;
  }, [workId]);

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
    const map = new Map<string, MapDraft['cells'][string]>();
    for (const key of Object.keys(draft?.cells ?? {})) {
      const cell = draft?.cells[key];
      if (cell) map.set(key, cell);
    }
    return map;
  }, [draft]);

  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => draft?.characterSlots ?? [],
    [draft],
  );
  const regions = useMemo(() => draft?.regions ?? [], [draft]);
  const gridSize = draft?.gridSize ?? 0;
  /**
   * v0.3.8 FEAT-D02: the snapshot carries the map's display constants, so a
   * published work renders exactly like the editor it came from.
   */
  const style = useMemo(() => resolveMapStyle(draft?.style), [draft]);
  /** OPT-A01 §1.1: adaptive cell width at 100% zoom (shared with the editor). */
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;

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
   */
  const fit = (): void => {
    const node = containerRef.current;
    userAdjustedRef.current = false;
    if (!node || gridSize === 0) return;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const insets = canvasInsets();
    const next = computeCellSizeForInsets({ width: rect.width, height: rect.height, gridSize, insets });
    setAutoCellSize((previous) => (previous === next ? previous : next));
    setZoom(1);
    setPan(centeredPan(rect, insets, gridSize, effectiveCellSize(next, style), 1));
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      if (userAdjustedRef.current) return;
      fit();
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize]);

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
      }),
    );
  }, [activeSlot, gridSize, cells, slots, regions, style, showHighlight, clearHighlight]);

  // A new snapshot must not inherit a stale activation or hover.
  useEffect(() => {
    setActivation(INACTIVE_ACTIVATION);
    setHover(null);
    setLabelRegionId(null);
  }, [draft]);

  const handleActivation = (event: LinkageActivationEvent): void =>
    setActivation((state) => reduceLinkageActivation(state, event));

  if (detailQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载作品…
      </div>
    );
  }

  if (!draft || detailQuery.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">作品不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/works')}>
          返回作品列表
        </Button>
      </div>
    );
  }

  const participants = slots
    .map((slot, index) => ({ slot, index }))
    .filter((entry): entry is { slot: CharacterSlotEntry; index: number } => entry.slot !== null);

  // MOD-802 §1.2.5: characters referenced by the active linkage get a 3px
  // param-colour outline (and a slight scale-up) in the roster.
  const highlightColors = new Map<number, string>();
  for (const character of highlight?.characters ?? []) {
    highlightColors.set(character.slotIndex, character.color);
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/works')} title="返回作品列表">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">
              {detailQuery.data?.notes ?? '作品'} v{versionNo}
            </span>
            <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
              {gridSize} × {gridSize}
            </span>
            <span className="text-xs text-muted-foreground">只读预览</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r bg-background">
          {/* MOD-802: no trigger tabs — hover previews, click pins the preview */}
          <div
            className="shrink-0 border-b px-3 text-center"
            style={{ height: 36, lineHeight: '36px', fontSize: 13, fontWeight: 600, color: '#1F2937' }}
          >
            参与者 {participants.length}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
            {participants.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">该作品暂无参与者</p>
            ) : (
              participants.map(({ slot, index }) => {
                const character = charactersById.get(slot.characterId);
                const themeColor = slot.themeColor ?? '#FFFFFF';
                const isWhiteTheme = themeColor.toUpperCase() === '#FFFFFF';
                const avatar = character?.avatarThumbUrl ?? character?.avatarUrl;
                const isActive = activation.activeParticipantId === index;
                const linkedColor = highlightColors.get(index);
                return (
                  <button
                    key={`${slot.characterId}-${index}`}
                    type="button"
                    onPointerEnter={() => handleActivation({ type: 'enter', participantId: index })}
                    onPointerLeave={() => handleActivation({ type: 'leave', participantId: index })}
                    onMouseEnter={() => setHoveredSlot(index)}
                    onMouseLeave={() => setHoveredSlot(null)}
                    onClick={() => handleActivation({ type: 'click', participantId: index })}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md border p-2 text-left transition-colors',
                      hoveredSlot === index ? 'border-primary bg-accent' : 'hover:border-primary',
                    )}
                    // FIX-E04: one highlight frame only, matching the editor.
                    style={
                      linkedColor
                        ? { boxShadow: `0 0 0 2px ${linkedColor}` }
                        : isActive
                          ? { boxShadow: '0 0 0 2px hsl(var(--primary))' }
                          : undefined
                    }
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: themeColor,
                        // FIX-E04: the outline lives on the slot row, so the
                        // avatar only scales up.
                        transform: linkedColor ? 'scale(1.08)' : undefined,
                        transition: 'transform 150ms linear',
                        border: isWhiteTheme ? '1px solid #D1D5DB' : 'none',
                      }}
                    >
                      {avatar ? (
                        <img
                          src={avatar}
                          alt={character?.name ?? ''}
                          draggable={false}
                          className="h-[82%] w-[82%] rounded-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {character?.name?.slice(0, 1) ?? '?'}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-sm">
                          {character?.name ?? `#${slot.characterId}`}
                        </span>
                        <GenderBadge gender={character?.gender} />
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        参与者框 #{index + 1}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>

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
        </main>
      </div>
    </div>
  );
}
