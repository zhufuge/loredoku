import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Eraser,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Send,
  Undo2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  GAME_LONG_PRESS_MS,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type Asset,
  type GamePlacementBoard,
  type MapDraft,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PressRing } from '@/components/common/PressRing';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ParticipantPanel } from '@/components/map-editor/ParticipantPanel';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { MapCanvasFrameLayer, MapGridSeparatorLayer } from '@/components/map/MapGridLayers';
import { MapBackgroundLayer, MapItemLayer } from '@/components/map/MapAssetLayers';
import {
  MapGamePlacementLayer,
  MapGamePressRing,
  MapGameToolHintLayer,
} from '@/components/map/MapGameLayers';
import {
  MapRegionHighlightLayer,
  MapRegionOutlineLayer,
} from '@/components/map/MapRegionLayers';
import {
  MapHighlightLayer,
  MapMouseCursorBoxLayer,
  MapBlockingMaskLayer,
  MapRegionLabelLayer,
} from '@/components/map/MapOverlayLayers';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import { useCharacters } from '@/hooks/useCharacters';
import { useGameDetail } from '@/hooks/useGames';
import { useHighlight } from '@/hooks/useHighlight';
import { useAssets } from '@/hooks/useAssets';
import {
  clientToCell,
  clampZoom,
  isInBounds,
  zoomAtPoint,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from '@/lib/grid';
import { readGameProgress, writeGameProgress } from '@/lib/gameProgress';
import { rosterPanelWidthFor } from '@/lib/participantLayout';
import { TOOLBAR_ICON_ACTIVE_CLASS, TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';
import {
  collectBlockingCells,
  collectItemCells,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import { canvasInsets, centeredPan, computeCellSizeForInsets } from '@/lib/canvasSize';
import { cellScale, itemPadding, scaleFontSize } from '@/lib/canvasScale';
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
  formatCellLabel,
  participantPlacementAt,
  placeForbidden,
  placeParticipant,
  avatarPlacedParticipantIds,
  placementAt,
  placementBlockReason,
  resolveToolHint,
  submitPlacement,
  undo,
  validatePlacement,
  type GameOperationMode,
  type GamePlacementState,
  type ParticipantPlacementVariant,
  type PlacementIssue,
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

/**
 * SPEC-G05 §5.2 (docs/v0.4.1.md §5.2) + CLAR-H13 (docs/v0.4.2.md §1.1) + SPEC-J05
 * (docs/v0.4.3.md §3.6): the reason a placement was refused, as a toast. Wording
 * says **编号** wherever the cell's content is meant — the participant themselves
 * never enters the map.
 *
 * The `'elsewhere'` case is about the **avatar** only: candidate 编号 may sit on
 * several cells, so "you already put this one somewhere" is only worth saying
 * when a cell was *confirmed* — and then the player needs to be told which.
 */
function describeBlock(
  block: NonNullable<ReturnType<typeof placementBlockReason>>,
  participantId: number,
  board: ReturnType<typeof createGamePlacementState>['board'],
): string {
  switch (block) {
    case 'elsewhere': {
      // SPEC-J05 §3.6：编号可以多处，唯一的是头像 —— 这条拒绝只在「该参与者的头像
      // 已经确认在别的格子」时出现，所以文案讲头像。
      const at = participantPlacementAt(board, participantId);
      return at
        ? `该参与者的头像已放置在 ${formatCellLabel(at)}，请先清除那一格`
        : '该参与者的头像已放置';
    }
    case 'non-standable':
      return '该格有不可站立的物品，不能放置';
    case 'forbidden':
      return '该格已标记为排除项，请先清除';
    case 'avatar':
      return '该格已放置该参与者的头像';
    // SPEC-J03 §9 Q6：短按点「该格已有该编号」是 **toggle 删除**，不走拒绝
    // 路径。这个 case 保留只为 `PlacementBlock` 的成员完整性（它不会被返回）。
    case 'duplicate':
      return `该格已有编号 ${participantId}`;
    case 'grid-full':
      return '该格编号已满（最多 9 个）';
  }
}

export function GamePage(): JSX.Element {
  // OPT-W04 (docs/v0.4.1.md §4.7): the route parameter is the access path.
  const { slug: slugParam } = useParams();
  const slug = slugParam && slugParam.length > 0 ? slugParam : null;
  const navigate = useNavigate();

  const gameQuery = useGameDetail(slug);
  /** v0.6.2：存档按游戏自己的 slug 分键（数据比路由参数更可信）。 */
  const gameSlug = gameQuery.data?.slug ?? slug;
  // A deployed snapshot may reference items/characters that are now inactive.
  const assetsQuery = useAssets({});
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
  /** FEAT-V01 §8.2: non-null while the "submission rejected" dialog is open. */
  const [validationIssues, setValidationIssues] = useState<PlacementIssue[] | null>(null);
  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<CellCoord | null>(null);
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
  /**
   * v0.7.11：正在被长按的格子 —— 有值时棋盘上画一圈进度环，抬手 / 移出 /
   * 中断即清。`seq` 每次按下递增，环靠它重新挂载、从头画（同一格连按两次
   * 也要重来，不能接着上一轮的满环）。
   */
  const [pressCell, setPressCell] = useState<{ x: number; y: number; seq: number } | null>(null);
  /**
   * v0.7.11：清除按钮上的长按进度环。存的是轮次号（非空 = 环在画），
   * 与格子环共用 `pressSeqRef` —— 两个环不会同时出现，共用一个递增器足够。
   */
  const [clearPress, setClearPress] = useState<number | null>(null);
  const pressSeqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  /** Long-press on the clear button wipes the whole board (SPEC-G04 §10.2). */
  const clearPressRef = useRef<{ timer: number; fired: boolean } | null>(null);
  /**
   * v0.4.0 验收补充 + v0.4.3 CLAR-J01 / SPEC-J02：放置态下在格子上长按 → 放置
   * **参与者头像**（这才是「把参与者放到格子上」，也只有它补同行同列的 ×）；
   * 短按放的是**编号**。与工具栏清除按钮同一模式：定时器触发即生效，随后到来的
   * click 必须被吞掉，否则同一手势会既放头像又放编号。
   */
  const cellPressRef = useRef<{ timer: number; fired: boolean } | null>(null);

  /**
   * v0.6.2：视图缩放与拖拽平移，与只读预览页同一套手感 ——
   * 缩放簇（放大 / 百分比 / 缩小 / 重置）、Ctrl+滚轮、空格或中键拖拽。
   */
  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** 本次指针手势有没有真的拖过画布 —— 拖完那次 click 要吞掉。 */
  const pannedRef = useRef(false);
  /** 用户手动调过视图后，容器尺寸变化不再强制重排（预览页同款豁免）。 */
  const userAdjustedRef = useRef(false);

  /**
   * 存档的两个镜像。事件处理器读「此刻」的值，而不是渲染闭包里的那份 ——
   * 长按定时器与连续点击都在下一次渲染之外触发，闭包可能已经过期。
   */
  const placementRef = useRef(placementState);
  placementRef.current = placementState;
  const submittedRef = useRef(hasSubmitted);
  submittedRef.current = hasSubmitted;

  /**
   * v0.7.1 §7.3: 游戏直接读**谜题版本行**，不再有快照拷贝 —— 画布来自
   * `detail.map`（谜题自带的那份副本），名册与调色板来自 `detail.puzzle`。
   * 内容仍然是冻结的：版本行只读，作者改不动已在线的游戏。
   */
  const detail = gameQuery.data;
  const draft = detail?.map;
  const slots = useMemo<Array<CharacterSlotEntry | null>>(
    () => detail?.puzzle?.characterSlots ?? [],
    [detail],
  );
  const linkageColors = useMemo(() => detail?.puzzle?.linkageColors ?? [], [detail]);
  /**
   * v0.6.3 (docs/v0.6.3.md §3.4): the deployed game renders the roster the way
   * the puzzle was laid out. The column count lives in the puzzle row, and the
   * row is immutable once published — so only re-deploying a new version can
   * move a board that is already online.
   */
  const rosterCols = detail?.puzzle?.rosterCols ?? null;
  const rosterWidth = useMemo(
    () => rosterPanelWidthFor(rosterCols, slots.length),
    [rosterCols, slots.length],
  );

  useEffect(() => {
    document.title = gameQuery.data ? `${gameQuery.data.name} · 格物` : '游戏 · 格物';
  }, [gameQuery.data]);

  const assetsById = useMemo(() => {
    const map = new Map<number, Asset>();
    for (const item of assetsQuery.data ?? []) map.set(item.id, item);
    return map;
  }, [assetsQuery.data]);

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

  const regions = useMemo(() => draft?.regions ?? [], [draft]);
  const gridSize = draft?.gridSize ?? 0;
  const style = useMemo(() => resolveMapStyle(draft?.style), [draft]);
  const [autoCellSize, setAutoCellSize] = useState<number>(DEFAULT_CELL_SIZE);
  const cellSize = effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;
  const rulerScale = cellScale(cellSize);
  const rulerMaxFont = scaleFontSize(style.ruler.fontSize + RULER_ACTIVE_FONT_DELTA, rulerScale);
  const rulerStrip = rulerStripSize({ maxFontSize: rulerMaxFont, gap: style.ruler.gap });

  /**
   * v0.6.2 §3：存档指纹。同 slug 重新部署后网格或名单可能变了，旧坐标与旧编号
   * 都不再有意义 —— `readGameProgress` 会整条丢弃，恢复半张棋盘比空白更让人困惑。
   */
  const progressMeta = useMemo(
    () => ({ gridSize, participantCount: slots.length }),
    [gridSize, slots.length],
  );

  /** 写存档的唯一出口；空盘且没提交过时由 `writeGameProgress` 删键。 */
  const saveProgress = useCallback(
    (board: GamePlacementBoard, submitted: boolean): void => {
      if (!gameSlug) return;
      writeGameProgress(gameSlug, { board, submitted, ...progressMeta });
    },
    [gameSlug, progressMeta],
  );

  /**
   * **所有改变棋盘的操作都从这里走**：算新状态 → 更新 → 顺手把结果落进
   * 本地存档。集中一处，「哪个入口忘了存」就不会变成一个需要逐个排查的问题。
   *
   * `submitted` 只在提交那一步显式传，其余操作沿用当前值。
   */
  const updatePlacement = useCallback(
    (updater: (state: GamePlacementState) => GamePlacementState, submitted?: boolean): void => {
      const current = placementRef.current;
      const next = updater(current);
      if (next === current) return;
      placementRef.current = next;
      setPlacementState(next);
      if (submitted !== undefined) {
        submittedRef.current = submitted;
        setHasSubmitted(submitted);
      }
      saveProgress(next.board, submitted ?? submittedRef.current);
    },
    [saveProgress],
  );

  // ---- OPT-901 §1.2.5 / OPT-902 §2.1~2.4 (shared with the preview) ----
  const blockingCells = useMemo(() => collectBlockingCells(cells, assetsById), [cells, assetsById]);
  const itemCells = useMemo(() => collectItemCells(cells), [cells]);
  const hoverEffects = useMemo(
    () => resolveHoverEffects({ hover, blockingCells, itemCells, regions }),
    [hover, blockingCells, itemCells, regions],
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
    const merged = new Set(blockingCells);
    for (const key of forbiddenCells(placementState.board)) merged.add(key);
    return merged;
  }, [blockingCells, placementState.board]);

  /** SPEC-G02: the hint is a projection of mode × hovered cell. */
  const toolHint = useMemo(() => {
    if (!hover) return null;
    return resolveToolHint({
      mode,
      placement: placementAt(placementState.board, hover.x, hover.y),
      nonStandable: blockingCells.has(cellKey(hover.x, hover.y)),
    });
  }, [mode, hover, placementState.board, blockingCells]);

  const toCell = useCallback(
    (clientX: number, clientY: number): CellCoord | null => {
      const node = containerRef.current;
      if (!node || gridSize === 0) return null;
      const coord = clientToCell(clientX, clientY, {
        rect: node.getBoundingClientRect(),
        pan,
        zoom,
        cellSize,
      });
      return isInBounds(coord, gridSize) ? coord : null;
    },
    [gridSize, pan, zoom, cellSize],
  );

  /**
   * OPT-A01 §1.2: measure the viewport and re-fit the board. The game page has
   * no floating bottom toolbar, hence `showBottomBar: false`.
   *
   * v0.6.2：这也是「重置视图」——回到 100% 并居中，同时清掉「用户调整过」
   * 的标记，让容器尺寸变化重新接管布局。
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

  const fitRef = useRef(fit);
  fitRef.current = fit;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const apply = (): void => {
      // v0.6.2：玩家放大 / 平移之后，改窗口大小不该把视图打回原形。
      if (userAdjustedRef.current) return;
      fitRef.current();
    };
    apply();
    const observer = new ResizeObserver(apply);
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

  /**
   * v0.6.2 §4：按住空格 + 拖拽 = 平移画布，与只读预览页同一套手感。
   *
   * `preventDefault` 挡的是浏览器把空格当成「翻页 / 点击聚焦元素」——
   * 这一页没有任何输入框，不会误伤打字。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.code !== 'Space') return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'Space') setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /**
   * 换一局 / 首次加载：不继承上一局的激活、悬停与棋盘。
   *
   * v0.6.2 §3：棋盘优先从本地存档恢复（同 slug、同网格、同名单才认）。
   * `hydratedKeyRef` 记住已经水合过哪一局 —— StrictMode 的双调用和后续重渲染
   * 都不会把玩家刚摆的东西盖回存档里的那一版。
   */
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draft) return;
    const key = `${gameSlug ?? ''}|${gridSize}|${slots.length}`;
    const firstLoad = hydratedKeyRef.current !== key;
    hydratedKeyRef.current = key;

    setActivation(INACTIVE_ACTIVATION);
    setHover(null);
    setLabelRegionId(null);
    setMode({ kind: 'idle' });
    setValidationIssues(null);
    if (!firstLoad) return;

    const saved = gameSlug ? readGameProgress(gameSlug, progressMeta) : null;
    // 历史栈不落盘：回来时从「当前这一版棋盘」重新开始记，撤销不会跨会话。
    const restored: GamePlacementState = saved
      ? { board: saved.board, past: [], future: [], submittedPastLength: 0 }
      : createGamePlacementState();
    placementRef.current = restored;
    setPlacementState(restored);
    submittedRef.current = saved?.submitted ?? false;
    setHasSubmitted(submittedRef.current);
    // 只有棋盘上真有东西才提示；空盘提交过的存档只恢复那个勾。
    if (saved && Object.keys(saved.board).length > 0) {
      toast.success('已恢复上次的摆放');
    }
  }, [draft, gameSlug, gridSize, slots.length, progressMeta]);

  /**
   * SPEC-G05 §5.3: the roster cards of participants that are already on the
   * board fade out. Derived from the board, so clearing or undoing a placement
   * restores the card with no extra bookkeeping.
   *
   * v0.5.1 SPEC-L05 (docs/v0.5.1.md §5.1): "on the board" now means **the
   * avatar** — a candidate 编号 no longer dims the card, so marking a few
   * possible cells leaves the roster fully readable.
   */
  const placedSlotIndices = useMemo(() => {
    const placed = avatarPlacedParticipantIds(placementState.board);
    const indices = new Set<number>();
    for (const participantId of placed) indices.add(participantId - 1);
    return indices;
  }, [placementState.board]);

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
        // Q16: the palette is the puzzle's; the legacy fallback keeps v0.4.x
        // snapshots (which carried it inside `map.style`) rendering the same.
        linkageColors,
      }),
    );
  }, [activeSlot, gridSize, cells, slots, regions, style, linkageColors, showHighlight, clearHighlight]);

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
   * FEAT-V01 §8: the submit button validates before it submits. Passing opens a
   * "校验通过" dialog and only then sets the undo barrier; failing lists every
   * problem and leaves the barrier alone, so the player can keep working.
   */
  const submit = (): void => {
    const result = validatePlacement({
      board: placementState.board,
      slots,
      nameOf: (participantId) => {
        const slot = slots[participantId - 1];
        return slot ? charactersById.get(slot.characterId)?.name : undefined;
      },
    });
    if (!result.passed) {
      setValidationIssues(result.issues);
      return;
    }
    updatePlacement(submitPlacement, true);
    toast.success('校验通过，已提交');
  };

  /**
   * SPEC-G01 / SPEC-G03 / SPEC-G04 / SPEC-G05 + v0.4.3 SPEC-J02 / SPEC-J03 /
   * SPEC-J05: one cell interaction, dispatched by mode. 放置态下 `variant` 区分
   * **短按（切换编号）**与**长按（放头像）**；其余工具态忽略它。
   *
   * 被规则拒绝时给出说明——长按的那条唯一性是「该参与者的头像已经在别的格子
   * 上」（编号可以多处，所以短按不会再被唯一性挡住），toast 指出头像在哪里，
   * 而不是静默无反应。
   *
   * v0.7.11：返回**是否真的执行了**。长按的进度环靠它决定收场 —— 环画满却什么
   * 都没发生，会读成「按成功了但没反应」，比不画环更糟。被拒时环立刻收回，
   * 由 toast 说明原因。
   */
  const dispatchCell = (x: number, y: number, variant: ParticipantPlacementVariant): boolean => {
    if (mode.kind === 'placing') {
      const block = placementBlockReason({
        board: placementState.board,
        x,
        y,
        participantId: mode.participantId,
        blockingCells,
        variant,
      });
      if (block) {
        toast.error(describeBlock(block, mode.participantId, placementState.board));
        return false;
      }
      updatePlacement((state) =>
        placeParticipant(state, {
          x,
          y,
          participantId: mode.participantId,
          blockingCells,
          gridSize,
          variant,
        }),
      );
      return true;
    }
    if (mode.kind === 'forbidden') {
      updatePlacement((state) => placeForbidden(state, { x, y, blockingCells }));
      return true;
    }
    if (mode.kind === 'clearing') {
      updatePlacement((state) => clearCell(state, { x, y }));
      return true;
    }
    return false;
  };

  /**
   * 放置态下在格子上按下：启动长按定时器（到点放**头像**），同时画上进度环。
   * 没到点就抬手的短按由随后到来的 `click` 收尾 —— 那一路走 SPEC-J03 的
   * **编号切换**。
   *
   * v0.7.11：环与定时器同源（都用 `GAME_LONG_PRESS_MS`），环画满的那一帧就是
   * 头像落下的那一帧。动作被规则拒绝时 `dispatchCell` 返回 false，环立刻收回 ——
   * 不能让一个满环停在那里，那读起来像「已经放好了」。
   */
  const startCellPress = (x: number, y: number): void => {
    const stale = cellPressRef.current;
    if (stale) window.clearTimeout(stale.timer);
    const press = { timer: 0, fired: false };
    pressSeqRef.current += 1;
    setPressCell({ x, y, seq: pressSeqRef.current });
    press.timer = window.setTimeout(() => {
      press.fired = true;
      if (!dispatchCell(x, y, 'image')) setPressCell(null);
    }, GAME_LONG_PRESS_MS);
    cellPressRef.current = press;
  };

  /**
   * 抬手：定时器作废；长按已生效时**保留** `fired`——紧随其后的 click 还要
   * 靠它识别「这一手是长按」并把 click 吞掉。
   *
   * 环在抬手时一律收掉：长按已生效的话，满环套在刚放下的头像上只会挡住它。
   */
  const endCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    if (!press.fired) cellPressRef.current = null;
  };

  /** 移出画布 / 指针中断：连 `fired` 一起丢——不会再有 click 来收尾。 */
  const dropCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    cellPressRef.current = null;
  };

  const startClearPress = (): void => {
    const press = { timer: 0, fired: false };
    pressSeqRef.current += 1;
    setClearPress(pressSeqRef.current);
    press.timer = window.setTimeout(() => {
      press.fired = true;
      // 清空是一次性的，棋盘随即变空 —— 满环留在空棋盘上没有意义，立即收。
      setClearPress(null);
      applyMode({ kind: 'clearing' });
      updatePlacement(clearAll);
      toast.success('已清空全部放置');
    }, GAME_LONG_PRESS_MS);
    clearPressRef.current = press;
  };

  const endClearPress = (): void => {
    setClearPress(null);
    const press = clearPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    clearPressRef.current = null;
    // A completed long-press already acted; only a short tap toggles the mode.
    if (press.fired) return;
    toggleTool('clearing');
  };

  /**
   * v0.6.2 §4：按钮以**视口中心**为锚点缩放。按钮在右栏，但用户看的是画布
   * 中间；以按钮位置为锚点会让棋盘每点一下就往一边跑。
   *
   * 缩小到底 / 放大到顶时 `clampZoom` 返回同一个值，这里直接短路 —— 不做无谓
   * 的 pan 重算。
   */
  const zoomBy = (direction: 1 | -1): void => {
    const next = clampZoom(zoom + direction * ZOOM_STEP);
    if (next === zoom) return;
    userAdjustedRef.current = true;
    const node = containerRef.current;
    if (node) {
      const rect = node.getBoundingClientRect();
      const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      setPan(zoomAtPoint(center, rect, pan, next, zoom));
    }
    setZoom(next);
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
        {/* FEAT-L04: the game list lives at /play now. */}
        <Button variant="outline" onClick={() => navigate('/play')}>
          返回游戏列表
        </Button>
      </div>
    );
  }

  const game = gameQuery.data;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1">
        {/* 左列：上 = 品牌 + 游戏名（v0.5.1 SPEC-L06~L09 精简后的两行），
            下 = 参与者面板（与预览页同一个组件） */}
        <aside
          className="flex shrink-0 flex-col border-r bg-background"
          style={{ width: rosterWidth }}
        >
          <div className="shrink-0 space-y-1 border-b p-3">
            {/* FEAT-L07: 返回箭头后是品牌名，游戏名放下一行。
                v0.5.3 FEAT-N03 (§2): the brand name is the logo itself. */}
            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                icon={<ArrowLeft className="h-4 w-4" />}
                label="返回游戏列表"
                side="right"
                className={TOOLBAR_ICON_HOVER_CLASS}
                onClick={() => navigate('/play')}
              />
              <BrandLogo height={16} />
              {/* v0.5.7: 玩家端没有 AppShell 头部，主题开关挂在左栏这一行右侧。 */}
              <ThemeToggle className="ml-auto" />
            </div>
            <p className="truncate pl-1 text-sm font-semibold" title={game.name}>
              {game.name} {gridSize}x{gridSize}
            </p>
          </div>
          <div className="flex min-h-0 flex-1">
            <ParticipantPanel
              slots={slots}
              charactersById={charactersById}
              cols={rosterCols}
              selectedSlotIndex={null}
              draggingIndex={null}
              activeSlotIndex={activation.activeParticipantId}
              highlightedSlots={highlightedSlots}
              highlightColors={highlightColors}
              readOnly
              placedSlotIndices={placedSlotIndices}
              onActivateHover={(index) => handleActivation({ type: 'enter', participantId: index })}
              onDeactivateHover={(index) => {
                // SPEC-G03+ BUG-G02：放置态下移开
                // 任意卡片都恢复已武装参与者的激活。必须走幂等的 `restore`——
                // 用 `click` 时，离开的恰是武装者自己的卡片就等同于「再点一次」，
                // 激活会被 toggle 关掉。
                if (mode.kind === 'placing') {
                  setActivation((state) =>
                    reduceLinkageActivation(state, {
                      type: 'restore',
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
            // v0.6.2：按住空格 / 中键时是抓手，格内放东西是 pointer，其余普通光标。
            cursor: spaceHeld ? 'grab' : hoverEffects.cell ? 'pointer' : 'default',
            touchAction: 'none',
          }}
          onPointerDown={(event) => {
            if (event.button === 1 || (event.button === 0 && spaceHeld)) {
              // v0.6.2 §4：空格 + 左键 或 中键 = 平移，不是放置。
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              userAdjustedRef.current = true;
              pannedRef.current = false;
              panRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
              return;
            }
            if (event.button !== 0) return;
            if (mode.kind !== 'placing') return;
            const cell = toCell(event.clientX, event.clientY);
            if (!cell) return;
            startCellPress(cell.x, cell.y);
          }}
          onPointerMove={(event) => {
            if (panRef.current) {
              pannedRef.current = true;
              setPan({
                x: event.clientX - panRef.current.x,
                y: event.clientY - panRef.current.y,
              });
              return;
            }
            setHover(toCell(event.clientX, event.clientY));
          }}
          onPointerUp={() => {
            panRef.current = null;
            endCellPress();
          }}
          onPointerCancel={() => {
            panRef.current = null;
            dropCellPress();
          }}
          onPointerLeave={() => {
            panRef.current = null;
            dropCellPress();
            setHover(null);
          }}
          onWheel={(event) => {
            // v0.6.2 §4：Ctrl / ⌘ + 滚轮以指针为锚点缩放（与预览页一致）。
            if (!(event.ctrlKey || event.metaKey)) return;
            const node = containerRef.current;
            if (!node) return;
            event.preventDefault();
            const next = clampZoom(zoom + (event.deltaY > 0 ? -1 : 1) * ZOOM_STEP);
            if (next === zoom) return;
            userAdjustedRef.current = true;
            const rect = node.getBoundingClientRect();
            setPan(zoomAtPoint({ x: event.clientX, y: event.clientY }, rect, pan, next, zoom));
            setZoom(next);
          }}
          onClick={(event) => {
            // 刚拖过画布：这一下 click 是拖拽手势的尾巴，不是放东西。
            if (pannedRef.current) {
              pannedRef.current = false;
              return;
            }
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

            {/* 《画布图层优先级规范》§2 — bottom-up, pinned by MAP_LAYER_Z.
                SPEC-G01: the game page drops 操作光标框 and adds the two
                game-only layers above 区域标签. */}
            <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={cellSize} />
            <MapHighlightLayer
              highlight={highlight}
              regions={regions}
              cellSize={cellSize}
              style={style}
              leaving={highlightLeaving}
            />
            <MapRegionHighlightLayer region={hoveredRegion} cellSize={cellSize} style={style} />
            <MapBlockingMaskLayer blockingCells={maskCells} cellSize={cellSize} style={style} />
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

            {/* 层 4 · 工具提示层 — SPEC-G02 */}
            <MapGameToolHintLayer
              hint={toolHint}
              cell={hoverEffects.cell}
              cellSize={cellSize}
              slots={slots}
            />

            {/* v0.7.11：长按进度环 —— 按住 500ms 的等待可见化（SPEC-J02） */}
            <MapGamePressRing
              cell={pressCell}
              cellSize={cellSize}
              durationMs={GAME_LONG_PRESS_MS}
              seq={pressCell?.seq ?? 0}
            />

            {/* 层 5 · 游戏放置层 — SPEC-G01 */}
            <MapGamePlacementLayer
              board={placementState.board}
              slots={slots}
              charactersById={charactersById}
              cellSize={cellSize}
              /*
               * v0.6.4 §3: 触碰 / 点击参与者时，放大展示地图中该参与者的头像
               * 与编号，提示当前放置的情况。面板说的是 0 基槽位号，棋盘从 1
               * 编号——和放置态同样 +1。悬停与点击都走激活态，所以摸一下和
               * 点一下效果一致。
               */
              activeParticipantId={
                activation.activeParticipantId === null
                  ? null
                  : activation.activeParticipantId + 1
              }
              /*
               * v0.7.11：正在长按的那一格 —— 长按落地后头像在这里落定。
               * 环还在（抬手前）就说明这一格是「刚刚」放下的，不需要再记一个
               * 时间戳：抬手即清环，窗口自然结束。
               */
              settleKey={pressCell ? `${pressCell.x},${pressCell.y}` : null}
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
              zoom={zoom}
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
            className={cn(
              'h-12 w-full',
              mode.kind === 'forbidden' ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
            )}
            title="禁止符号：标记该格为排除项"
            onClick={() => toggleTool('forbidden')}
          >
            <X className="h-5 w-5 text-destructive" />
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'relative h-12 w-full',
              mode.kind === 'clearing' ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
            )}
            title="清除工具：清除该格放置；长按清空全部"
            onPointerDown={startClearPress}
            onPointerUp={endClearPress}
            onPointerLeave={endClearPress}
          >
            <Eraser className="h-5 w-5" />
            {/*
             * v0.7.11：长按 500ms 清空全部 —— 与棋格长按画同一圈进度环。
             * 两个长按此前都没有过程反馈，用户只能猜「按住够不够久」；
             * 一致的环让「按住 500ms」这件事在界面上只有一种样子。
             */}
            {clearPress !== null ? (
              <PressRing
                size={40}
                durationMs={GAME_LONG_PRESS_MS}
                seq={`clear-${clearPress}`}
                strokeWidth={2.5}
                radiusRatio={0.46}
                color="hsl(var(--primary))"
                className="left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              />
            ) : null}
          </Button>
          <Button
            variant="ghost"
            className={cn('h-12 w-full', TOOLBAR_ICON_HOVER_CLASS)}
            title={canUndo(placementState) ? '回退上一步' : '没有可回退的操作'}
            disabled={!canUndo(placementState)}
            onClick={() => updatePlacement(undo)}
          >
            <Undo2 className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'h-12 w-full',
              hasSubmitted ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
            )}
            title={hasSubmitted ? '已提交，可继续摆放后再次提交' : '提交当前摆放（先校验）'}
            onClick={submit}
          >
            {hasSubmitted ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
          </Button>

          {/* v0.6.2 §4：视图簇 —— 放大 / 百分比 / 缩小 / 重置视图，下面接标尺开关。 */}
          <div className="mt-1 flex w-full flex-col items-center gap-1 border-t pt-2">
            <IconButton
              variant="ghost"
              icon={<Plus className="h-4 w-4" />}
              label="放大"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              disabled={zoom >= ZOOM_MAX}
              onClick={() => zoomBy(1)}
            />
            <span className="w-full text-center text-2xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <IconButton
              variant="ghost"
              icon={<Minus className="h-4 w-4" />}
              label="缩小"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              disabled={zoom <= ZOOM_MIN}
              onClick={() => zoomBy(-1)}
            />
            <IconButton
              variant="ghost"
              icon={<RotateCcw className="h-4 w-4" />}
              label="重置视图"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              onClick={fit}
            />
            <IconButton
              variant="ghost"
              icon={<Ruler className="h-4 w-4" />}
              label="显示 / 隐藏标尺"
              side="right"
              className={cn(showRulers ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS)}
              onClick={() => setShowRulers((current) => !current)}
            />
          </div>

          {/* SPEC-G04 §6.4: step counter */}
          <div className="mt-auto w-full border-t pt-2 text-center text-2xs leading-relaxed text-muted-foreground">
            已放置 {countPlacements(placementState.board)} 个
            <br />
            可回退 {undoSteps} 步
          </div>
        </aside>
      </div>

      {/* FEAT-V01 §8.2: 校验未通过 → 列出全部问题（按编号排序），关闭后继续摆放 */}
      <Dialog
        open={validationIssues !== null}
        onOpenChange={(open) => {
          if (!open) setValidationIssues(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>提交未通过</DialogTitle>
            <DialogDescription>
              共 {validationIssues?.length ?? 0} 项问题，修正后可以再次提交。
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
            {validationIssues?.map((issue, index) => (
              <li key={`${issue.participantId}-${issue.code}-${index}`} className="flex gap-2">
                <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">
                  {issue.code === 'unplaced'
                    ? '未放置'
                    : issue.code === 'row'
                      ? '同行'
                      : issue.code === 'column'
                        ? '同列'
                        : '位置条件'}
                </span>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidationIssues(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
