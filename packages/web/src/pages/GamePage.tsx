import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Eraser,
  Loader2,
  Ruler,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  GAME_DIFFICULTY_COLORS,
  GAME_DIFFICULTY_LABELS,
  GAME_LONG_PRESS_MS,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type Item,
  type MapDraft,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { ParticipantPanel } from '@/components/editor/ParticipantPanel';
import {
  MapBackgroundLayer,
  MapCanvasFrameLayer,
  MapGamePlacementLayer,
  MapGameToolHintLayer,
  MapGridSeparatorLayer,
  MapHighlightLayer,
  MapMouseCursorBoxLayer,
  MapNonStandableMaskLayer,
  MapObjectLayer,
  MapRegionFillLayer,
  MapRegionHighlightLayer,
  MapRegionLabelLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapLayers';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import { useCharacters } from '@/hooks/useCharacters';
import { useGameDetail } from '@/hooks/useGames';
import { useHighlight } from '@/hooks/useHighlight';
import { useItems } from '@/hooks/useItems';
import { clientToCell, isInBounds } from '@/lib/grid';
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
import {
  canUndo,
  cellKey,
  clearAll,
  clearCell,
  countPlacements,
  createGamePlacementState,
  forbiddenCells,
  placeForbidden,
  placeParticipant,
  placementAt,
  resolveToolHint,
  submitPlacement,
  undo,
  type GameOperationMode,
  type GamePlacementState,
  type ParticipantPlacementVariant,
} from '@/lib/gamePlacement';

/**
 * FEAT-G03 (docs/v0.4.0.md §6): the game page — a player-facing three-column
 * layout that reuses the work preview's map and roster verbatim and adds the
 * placement interaction (SPEC-G01 ~ SPEC-G04).
 *
 * It deliberately does **not** use `AppShell`: this is a play surface, not the
 * maker's console.
 */

/** FEAT-G03 §6.3: the ruler toggle, persisted per reader like the preview's. */
const RULER_STORAGE_KEY = 'loredoku.gameview.ruler';

function readStoredRulerVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(RULER_STORAGE_KEY) !== 'hidden';
}

export function GamePage(): JSX.Element {
  const { gameId: gameIdParam } = useParams();
  const navigate = useNavigate();
  const gameId = Number(gameIdParam ?? '');
  const validGameId = Number.isFinite(gameId) && gameId > 0;

  const gameQuery = useGameDetail(validGameId ? gameId : null);
  // A deployed snapshot may reference items/characters that are now inactive.
  const itemsQuery = useItems({});
  const charactersQuery = useCharacters({});

  const {
    highlight,
    show: showHighlight,
    clear: clearHighlight,
    leaving: highlightLeaving,
  } = useHighlight();
  // MOD-802: the very same single-active state machine the preview uses.
  const [activation, setActivation] = useState<LinkageActivationState>(INACTIVE_ACTIVATION);
  // SPEC-G04: the toolbar / roster form one mutually exclusive mode selector.
  const [mode, setMode] = useState<GameOperationMode>({ kind: 'idle' });
  const [placementState, setPlacementState] = useState<GamePlacementState>(
    createGamePlacementState,
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Long-press on the clear button wipes the whole board (SPEC-G04 §10.2). */
  const clearPressRef = useRef<{ timer: number; fired: boolean } | null>(null);
  /**
   * v0.4.0 验收补充：放置态下在格子上长按 → 放置参与者头像（短按放编号）。
   * 与工具栏清除按钮同一模式：定时器触发即生效，随后到来的 click 必须被
   * 吞掉，否则同一手势会既放头像又放编号。
   */
  const cellPressRef = useRef<{ timer: number; fired: boolean } | null>(null);

  const draft = gameQuery.data?.data;

  useEffect(() => {
    document.title = gameQuery.data ? `${gameQuery.data.name} · 格物` : '游戏 · 格物';
  }, [gameQuery.data]);

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
  const style = useMemo(() => resolveMapStyle(draft?.style), [draft]);
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont = scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale);
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  // ---- OPT-901 §1.2.5 / OPT-902 §2.1~2.4 (shared with the preview) ----
  const noStandCells = useMemo(() => collectNoStandCells(cells, itemsById), [cells, itemsById]);
  const objectCells = useMemo(() => collectObjectCells(cells), [cells]);
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, noStandCells, objectCells, regions }),
    [hover, noStandCells, objectCells, regions],
  );
  const hoveredRegionId = labelRegionId ?? hoverEffects.regionId;
  const hoveredRegion = hoveredRegionId
    ? regions.find((region) => region.id === hoveredRegionId) ?? null
    : null;

  /**
   * SPEC-G01 §7.1: a placed `×` lights up the same mask the map's own
   * non-standable items use, so both read as "you may not put anything here".
   */
  const maskCells = useMemo(() => {
    const merged = new Set(noStandCells);
    for (const key of forbiddenCells(placementState.board)) merged.add(key);
    return merged;
  }, [noStandCells, placementState.board]);

  /** SPEC-G02: the hint is a projection of mode × hovered cell. */
  const toolHint = useMemo(() => {
    if (!hover) return null;
    return resolveToolHint({
      mode,
      placement: placementAt(placementState.board, hover.x, hover.y),
      nonStandable: noStandCells.has(cellKey(hover.x, hover.y)),
    });
  }, [mode, hover, placementState.board, noStandCells]);

  const themeColors = useMemo(() => {
    const map = new Map<number, string>();
    slots.forEach((slot, index) => {
      if (slot) map.set(index + 1, slot.themeColor ?? '#000000');
    });
    return map;
  }, [slots]);

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const node = containerRef.current;
      if (!node || gridSize === 0) return null;
      const coord = clientToCell(clientX, clientY, {
        rect: node.getBoundingClientRect(),
        pan,
        zoom: 1,
        cellSize,
      });
      return isInBounds(coord, gridSize) ? coord : null;
    },
    [gridSize, pan, cellSize],
  );

  /**
   * OPT-A01 §1.2: measure the viewport and re-fit the board. The game page has
   * no floating bottom toolbar, hence `showBottomBar: false`.
   *
   * v0.4.0 验收补充：画布固定自适应——没有手动平移 / 缩放，也就不存在
   * 「用户调整过就不再重算」的豁免，容器变化一律重新适应。
   */
  const fit = useCallback((): void => {
    const node = containerRef.current;
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
    setPan(centeredPan(rect, insets, gridSize, effectiveCellSize(next, style), 1));
  }, [gridSize, showRulers, rulerStrip, style]);

  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    fitRef.current();
    const observer = new ResizeObserver(() => fitRef.current());
    observer.observe(node);
    return () => observer.disconnect();
  }, [gridSize]);

  useEffect(() => {
    fitRef.current();
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(RULER_STORAGE_KEY, showRulers ? 'visible' : 'hidden');
    }
  }, [showRulers]);

  // SPEC-G03 §9.1 / SPEC-G04: Escape leaves whichever mode is active.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setMode({ kind: 'idle' });
      setActivation((state) => reduceLinkageActivation(state, { type: 'escape' }));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // A new game must not inherit a stale activation, hover or board.
  useEffect(() => {
    setActivation(INACTIVE_ACTIVATION);
    setHover(null);
    setLabelRegionId(null);
    setMode({ kind: 'idle' });
    setPlacementState(createGamePlacementState());
    setHasSubmitted(false);
  }, [draft]);

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

  const handleActivation = (event: LinkageActivationEvent): void =>
    setActivation((state) => reduceLinkageActivation(state, event));

  /**
   * SPEC-G03 §9.1: clicking a roster card arms that participant for placement
   * **and** runs the preview's click-activation, so the linkage highlights
   * appear exactly as they do on the work preview.
   *
   * The panel speaks **0-based** slot indices, while the placement layer numbers
   * participants from 1 (SPEC-G01 §7.1) — so the mode carries `index + 1`.
   */
  const handleCardClick = (index: number): void => {
    const participantId = index + 1;
    if (mode.kind === 'placing' && mode.participantId === participantId) {
      setMode({ kind: 'idle' });
      setActivation((state) => reduceLinkageActivation(state, { type: 'escape' }));
      return;
    }
    setMode({ kind: 'placing', participantId });
    setActivation((state) => reduceLinkageActivation(state, { type: 'click', participantId: index }));
  };

  /** SPEC-G04: leaving the placing state also ends the linkage preview. */
  const applyMode = (next: GameOperationMode): void => {
    setMode(next);
    if (next.kind !== 'placing') {
      setActivation((state) => reduceLinkageActivation(state, { type: 'escape' }));
    }
  };

  const toggleTool = (tool: 'forbidden' | 'clearing'): void => {
    applyMode(mode.kind === tool ? { kind: 'idle' } : { kind: tool });
  };

  /**
   * SPEC-G01 / SPEC-G03 / SPEC-G04: one cell interaction, dispatched by mode.
   * 放置态下 `variant` 区分短按（编号）与长按（头像）；其余工具态忽略它。
   */
  const dispatchCell = (x: number, y: number, variant: ParticipantPlacementVariant): void => {
    if (mode.kind === 'placing') {
      setPlacementState((state) =>
        placeParticipant(state, {
          x,
          y,
          participantId: mode.participantId,
          noStandCells,
          variant,
        }),
      );
      return;
    }
    if (mode.kind === 'forbidden') {
      setPlacementState((state) => placeForbidden(state, { x, y, noStandCells }));
      return;
    }
    if (mode.kind === 'clearing') {
      setPlacementState((state) => clearCell(state, { x, y }));
    }
  };

  /** 放置态下在格子上按下：启动长按定时器（到点放头像）。 */
  const startCellPress = (x: number, y: number): void => {
    const stale = cellPressRef.current;
    if (stale) window.clearTimeout(stale.timer);
    const press = { timer: 0, fired: false };
    press.timer = window.setTimeout(() => {
      press.fired = true;
      dispatchCell(x, y, 'image');
    }, GAME_LONG_PRESS_MS);
    cellPressRef.current = press;
  };

  /**
   * 抬手：定时器作废；长按已生效时**保留** `fired`——紧随其后的 click 还要
   * 靠它识别「这一手是长按」并把 click 吞掉。
   */
  const endCellPress = (): void => {
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    if (!press.fired) cellPressRef.current = null;
  };

  /** 移出画布 / 指针中断：连 `fired` 一起丢——不会再有 click 来收尾。 */
  const dropCellPress = (): void => {
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    cellPressRef.current = null;
  };

  const startClearPress = (): void => {
    const press = { timer: 0, fired: false };
    press.timer = window.setTimeout(() => {
      press.fired = true;
      applyMode({ kind: 'clearing' });
      setPlacementState((state) => clearAll(state));
      toast.success('已清空全部放置');
    }, GAME_LONG_PRESS_MS);
    clearPressRef.current = press;
  };

  const endClearPress = (): void => {
    const press = clearPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    clearPressRef.current = null;
    // A completed long-press already acted; only a short tap toggles the mode.
    if (press.fired) return;
    toggleTool('clearing');
  };

  const undoSteps = Math.max(0, placementState.past.length - placementState.submittedPastLength);

  if (gameQuery.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        正在加载游戏…
      </div>
    );
  }

  if (!gameQuery.data || gameQuery.isError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">游戏不存在或加载失败。</p>
        <Button variant="outline" onClick={() => navigate('/games')}>
          返回游戏列表
        </Button>
      </div>
    );
  }

  const game = gameQuery.data;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* 左列：上 = 游戏信息，下 = 参与者面板（与预览页同一个组件） */}
        <aside className="flex w-[256px] shrink-0 flex-col border-r bg-background">
          <div className="shrink-0 space-y-3 border-b p-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate('/games')}
                title="返回游戏列表"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="truncate text-sm font-semibold" title={game.name}>
                {game.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40">
                {game.coverUrl ? (
                  <img
                    src={game.coverUrl}
                    alt={game.name}
                    draggable={false}
                    className="no-drag h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-lg font-semibold text-muted-foreground/60">
                    {game.name.trim().charAt(0) || '游'}
                  </span>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-medium text-white"
                    style={{ backgroundColor: GAME_DIFFICULTY_COLORS[game.difficulty] }}
                  >
                    {GAME_DIFFICULTY_LABELS[game.difficulty]}
                  </span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground">
                    {gridSize} × {gridSize}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  来自作品 v{game.versionNo} · 参与者 {slots.filter(Boolean).length} 人
                </p>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              点击参与者后，点击格子放置编号，长按格子放置头像；用右侧工具标记排除项或清除放置。
            </p>
          </div>
          <div className="flex min-h-0 flex-1">
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
              onDeactivateHover={(index) => {
                // SPEC-G03（v0.4.0 验收补充）：放置态下移开另一张卡片时，恢复
                // 已武装参与者的激活——放置状态不随悬停结束而退出，只有再次点击
                // 参与者或工具按钮才退出（`handleCardClick` / `applyMode`）。
                if (mode.kind === 'placing') {
                  setActivation((state) =>
                    reduceLinkageActivation(state, {
                      type: 'click',
                      participantId: mode.participantId - 1,
                    }),
                  );
                  return;
                }
                handleActivation({ type: 'leave', participantId: index });
              }}
              onActivateClick={handleCardClick}
            />
          </div>
        </aside>

        {/* 中列：与预览页一致的地图 + 两个游戏图层 */}
        <main
          ref={containerRef}
          className="relative min-h-0 flex-1 select-none overflow-hidden bg-muted/30"
          style={{
            // v0.4.0 验收补充：画布固定自适应，空白处不可拖拽平移，也无缩放，
            // 因此空白处就是普通光标；格内仍是 pointer。
            cursor: hoverEffects.cell ? 'pointer' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (mode.kind !== 'placing') return;
            const cell = toCell(event.clientX, event.clientY);
            if (!cell) return;
            startCellPress(cell.x, cell.y);
          }}
          onPointerMove={(event) => {
            setHover(toCell(event.clientX, event.clientY));
          }}
          onPointerUp={endCellPress}
          onPointerCancel={dropCellPress}
          onPointerLeave={() => {
            dropCellPress();
            setHover(null);
          }}
          onClick={(event) => {
            const press = cellPressRef.current;
            if (press?.fired) {
              // 长按已经放了头像，这次 click 是同一手势的尾巴，吞掉。
              cellPressRef.current = null;
              return;
            }
            const cell = toCell(event.clientX, event.clientY);
            if (!cell) return;
            dispatchCell(cell.x, cell.y, 'number');
          }}
        >
          <div
            className="absolute left-0 top-0"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              transformOrigin: '0 0',
              width: total,
              height: total,
            }}
          >
            <div
              className="absolute left-0 top-0 bg-background"
              style={{ width: total, height: total, zIndex: MAP_LAYER_Z.canvasBase }}
            />

            {/* 《画布图层优先级规范》§2 — bottom-up, pinned by MAP_LAYER_Z.
                SPEC-G01: the game page drops 操作光标框 and adds the two
                game-only layers above 区域标签. */}
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
            <MapNonStandableMaskLayer noStandCells={maskCells} cellSize={cellSize} style={style} />
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

            {/* 层 4 · 工具提示层 — SPEC-G02 */}
            <MapGameToolHintLayer
              hint={toolHint}
              cell={hoverEffects.cell}
              cellSize={cellSize}
              themeColors={themeColors}
            />

            {/* 层 5 · 游戏放置层 — SPEC-G01 */}
            <MapGamePlacementLayer
              board={placementState.board}
              slots={slots}
              charactersById={charactersById}
              cellSize={cellSize}
            />

            <MapCanvasFrameLayer gridSize={gridSize} cellSize={cellSize} style={style} />

            {/* 层 1 — 鼠标提示框（游戏页无操作提示框）。 A placed `×` counts
                as blocked too, so the cursor turns red on marked cells. */}
            <MapMouseCursorBoxLayer
              cell={hoverEffects.cell}
              blocked={
                hoverEffects.blocked ||
                (hoverEffects.cell !== null &&
                  maskCells.has(cellKey(hoverEffects.cell.x, hoverEffects.cell.y)))
              }
              cellSize={cellSize}
              style={style}
            />
          </div>

          {showRulers ? (
            <MapRulerStrips
              gridSize={gridSize}
              cellSize={cellSize}
              zoom={1}
              pan={pan}
              total={total}
              style={style}
              hover={hover}
            />
          ) : null}
        </main>

        {/* 右列：工具栏（SPEC-G04） */}
        <aside className="flex w-[84px] shrink-0 flex-col items-center gap-2 border-l bg-background p-2">
          <Button
            variant="ghost"
            className={`h-12 w-full ${mode.kind === 'forbidden' ? 'bg-accent text-accent-foreground' : ''}`}
            title="禁止符号：标记该格为排除项"
            onClick={() => toggleTool('forbidden')}
          >
            <X className="h-5 w-5 text-red-500" />
          </Button>
          <Button
            variant="ghost"
            className={`h-12 w-full ${mode.kind === 'clearing' ? 'bg-accent text-accent-foreground' : ''}`}
            title="清除工具：清除该格放置；长按清空全部"
            onPointerDown={startClearPress}
            onPointerUp={endClearPress}
            onPointerLeave={endClearPress}
          >
            <Eraser className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            className="h-12 w-full"
            title={canUndo(placementState) ? '回退上一步' : '没有可回退的操作'}
            disabled={!canUndo(placementState)}
            onClick={() => setPlacementState((state) => undo(state))}
          >
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            className={`h-12 w-full ${hasSubmitted ? 'bg-accent text-accent-foreground' : ''}`}
            title={hasSubmitted ? '已提交，可继续摆放后再次提交' : '提交当前摆放'}
            onClick={() => {
              setPlacementState((state) => submitPlacement(state));
              setHasSubmitted(true);
              toast.success('已提交');
            }}
          >
            {hasSubmitted ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </Button>

          {/* v0.4.0 验收补充：视图簇（缩小 / 百分比 / 放大 / 重置）已移除——
              画布固定自适应，没有平移也没有缩放，只保留标尺开关。 */}
          <div className="mt-1 flex flex-col items-center gap-1 border-t pt-2">
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
          </div>

          {/* SPEC-G04 §6.4: step counter */}
          <div className="mt-auto w-full border-t pt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
            已放置 {countPlacements(placementState.board)} 个
            <br />
            可回退 {undoSteps} 步
          </div>
        </aside>
      </div>
    </div>
  );
}
