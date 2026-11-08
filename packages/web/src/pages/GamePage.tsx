import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Plus, RotateCcw, Ruler, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULT_CELL_SIZE,
  GAME_LONG_PRESS_MS,
  GAME_PRESS_RING_DELAY_MS,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
  type Asset,
  type GamePlacementBoard,
  type GameToolIconKind,
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
  type GamePlacementPulse,
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
import { GameBrief } from '@/components/game/GameBrief';
import { useHighlight } from '@/hooks/useHighlight';
import {
  clientToCanvasPoint,
  clientToCell,
  clampZoom,
  isInBounds,
  zoomAtPoint,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
  type CanvasPoint,
} from '@/lib/grid';
import { readGameProgress, writeGameProgress } from '@/lib/gameProgress';
import { useProvidedGameSource, type GameSource } from '@/lib/gameSource';
import {
  clearGameTimer,
  formatElapsed,
  readGameTimer,
  writeGameTimer,
} from '@/lib/gameTimer';
import { resolveForbiddenSymbolImage } from '@/lib/forbiddenSymbol';
import { TOOL_ICON_FALLBACKS, resolveToolIcons, type ToolIconRender } from '@/lib/toolIcons';
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
import { canvasShadowStyle, effectiveCellSize, resolveMapStyle } from '@/lib/mapStyle';
import { resolveHighlight } from '@/lib/highlight';
import { rulerStripSize } from '@/lib/ruler';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationEvent,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import {
  allParticipantsPlaced,
  canUndo,
  canPlaceForbidden,
  cellKey,
  clearAll,
  clearCell,
  countPlacements,
  createGamePlacementState,
  forbiddenCells,
  avatarPlacedParticipantIds,
  modeAfterPlacement,
  placeForbidden,
  placeParticipant,
  placementAt,
  placementBlockReason,
  resolveToolHint,
  summarizeIssues,
  toggleForbidden,
  undo,
  validatePlacement,
  type GameOperationMode,
  type GamePlacementState,
  type ParticipantPlacementVariant,
  type PlacementBlame,
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

/**
 * v0.7.11：刚放下的编号 / 禁止符号挂多久的 `place-pop` 类。
 *
 * 动画本身只有 180ms；多留一段是为了让**同一帧里放下的另一格**（按住滑动）也
 * 各自挂着自己的类，而不是互相顶掉。过了这个窗口就摘掉，免得以后任何一次重挂载
 * 把旧格子再「盖章」一遍。
 */
const GAME_PLACE_PULSE_MS = 400;

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
 * v0.7.11：`'avatar'`（长按的正是这位头像自己所在的那一格）返回 `null` ——
 * 什么都不做已经是最正确的回应，再弹一句「这里已经有他的头像了」纯属噪音。
 * 原先那条「已经放在别处」的拒绝也随**搬家**一起消失了。
 *
 * v0.7.12：`'forbidden'` 也返回 `null` —— `×` 格在放置态下是**静默的无效果**
 * （需求：「参与者编号点击时无效果」）。提示层在这种格子上已经不再画编号，
 * 点下去再弹一句「请先清除」就成了一次自相矛盾的对话。
 */
function describeBlock(
  block: NonNullable<ReturnType<typeof placementBlockReason>>,
  participantId: number,
): string | null {
  switch (block) {
    case 'non-standable':
      return '该格有不可站立的物品，不能放置';
    case 'forbidden':
      return null;
    case 'avatar':
      return null;
    // SPEC-J03 §9 Q6：短按点「该格已有该编号」是 **toggle 删除**，不走拒绝
    // 路径。这个 case 保留只为 `PlacementBlock` 的成员完整性（它不会被返回）。
    case 'duplicate':
      return `该格已有编号 ${participantId}`;
    case 'grid-full':
      return '该格编号已满（最多 9 个）';
  }
}

/**
 * v0.8.7 §7：工具栏上的画 —— 作者给这一枚配了图就画图，没配就是内置的 lucide 图标。
 *
 * 深色界面要翻一次：与禁止符号同一条理由（图多半是「深墨画在透明底上」，按浅色
 * 地图纸挑的），`invert` 翻明度、`hue-rotate-180` 把色相转回来，否则红印会变青。
 */
function GameToolIcon({
  render,
  name,
}: {
  render: ToolIconRender | undefined;
  name: GameToolIconKind;
}): JSX.Element {
  if (!render) {
    const Fallback = TOOL_ICON_FALLBACKS[name];
    return <Fallback className="h-5 w-5" />;
  }
  return (
    <img
      src={render.imageUrl}
      alt=""
      draggable={false}
      data-testid={`${name}-tool-icon`}
      className="h-5 w-5 select-none object-contain dark:invert dark:hue-rotate-180"
    />
  );
}

/**
 * v0.9.0（docs/v0.9.0.md §2）：这一层只剩「谁来供数据」这一个决定。
 *
 * - 外面套了 `GameSourceScope`（播放器）：用外面给的那份，**一行 api 代码都不引**；
 * - 没套（工坊 / 线上）：自己套一份 api 实现 —— 也就是 v0.9.0 之前的行为，逐字节不变。
 *
 * 拆成两个组件而不是「条件调用 hook」：`useGameDetail` 一被调用就会发请求，
 * 播放器里一次都不该发。
 */
export function GamePage(): JSX.Element {
  const provided = useProvidedGameSource();
  if (!provided) {
    /**
     * 没有来源 = 这个入口没有资格渲染游戏页。工坊与线上走的是
     * `pages/ApiGamePage`（router 里直接挂它），播放器走 `PlayerGamePage`
     * （先套一层 bundle source）。两者都给了 source，所以这条分支只在
     * 「有人把 GamePage 挂进了一个新路由却忘了给数据源」时触发。
     */
    throw new Error('GamePage 需要 GameSourceScope：工坊请用 ApiGamePage，播放器请用 PlayerGamePage');
  }
  return <GameView source={provided} />;
}

/**
 * 渲染层。两个入口共用这一份 —— 它不认识 axios，也不认识包，只认一个 `GameSource`。
 * 去掉数据来源之后剩下的就是这 1500 行画布 / 名册 / 工具栏。
 */
export function GameView({ source }: { source: GameSource }): JSX.Element {
  /**
   * OPT-W04 (docs/v0.4.1.md §4.7): the route parameter is the access path.
   *
   * v0.9.0 §3：播放器的路由参数叫 `key`（`/loredoku/:code/play/:key`），工坊叫
   * `slug`；主题那一段在工坊是部署 slug（`themeSlug`）、在播放器是主题编码（`code`）。
   * 两个入口共用一个组件，参数名就都收在这里，别处只认 `slug` / `themeQuery`。
   */
  const params = useParams<{ slug?: string; key?: string; themeSlug?: string; code?: string }>();
  const slug = (params.slug ?? params.key) || null;
  /** 主题那一段：工坊是部署 slug，播放器是主题编码。只用来取名字与拼返回地址。 */
  const themeRef = params.themeSlug ?? params.code ?? null;
  const navigate = useNavigate();
  /**
   * v0.8.0（docs/v0.8.0.md §16.6）：从合辑进来时（`/play/theme/:slug/:key`），
   * 左栏顶部要给一个**回到那个主题**的入口 —— 只靠浏览器返回，玩家玩到第 3 关
   * 就已经不知道自己是从哪一串里进来的了。从单局入口进来时这里什么也不出现：
   * 它表示「你从哪来」，不是装饰。
   */
  const themeQuery = source.useTheme(themeRef);

  const gameQuery = source.useGame(slug);
  /**
   * v0.6.2：存档按游戏自己的 slug 分键（数据比路由参数更可信）。
   * v0.9.0 §4：**键的身份交给 source** —— 线上仍是 slug（已有进度不能作废），
   * 播放器是 `bundle:<主题code>:<key>`，两套键互不相通。
   */
  const storageId = gameQuery.data
    ? source.storageId(gameQuery.data.slug)
    : slug
      ? source.storageId(slug)
      : null;
  // A deployed snapshot may reference items/characters that are now inactive.
  const assetsQuery = source.useAssets();
  const charactersQuery = source.useCharacters();

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
  /**
   * v0.7.11：提交的结果。`null` = 弹窗关着。
   *
   * 通过 / 未通过共用同一个弹窗：两者都是「这一局到这里有个结论」，只是下一个
   * 动作不同（再玩一次 / 继续游戏）。未通过时只带**谁不对**，不带行列坐标 ——
   * 详细清单像一张调试报告，玩家真正要做的是回去看那几个人。
   */
  const [result, setResult] = useState<
    | { kind: 'passed'; elapsedMs: number }
    | { kind: 'failed'; blame: PlacementBlame[] }
    | null
  >(null);
  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState<CellCoord | null>(null);
  /** v0.8.7 §8：光标在纸上的像素位置 —— 物品名称提示贴它，不贴物品。 */
  const [hoverPoint, setHoverPoint] = useState<CanvasPoint | null>(null);
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
  const clearPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);
  /**
   * v0.4.0 验收补充 + v0.4.3 CLAR-J01 / SPEC-J02：放置态下在格子上长按 → 放置
   * **参与者头像**（这才是「把参与者放到格子上」，也只有它补同行同列的 ×）；
   * 短按放的是**编号**。与工具栏清除按钮同一模式：定时器触发即生效，随后到来的
   * click 必须被吞掉，否则同一手势会既放头像又放编号。
   *
   * v0.7.11：两个长按都多一个 `ringTimer` —— 进度环延迟 160ms 才挂载，单点
   * （抬手早于 160ms）就什么都不闪。
   */
  const cellPressRef = useRef<{ timer: number; ringTimer: number; fired: boolean } | null>(null);

  /**
   * v0.7.11：按住滑动连续操作。
   *
   * `lastKey` 是这一笔最后落过的格子；`painted` 一旦为真，这一笔就不再是「点击」，
   * 抬手后的 `click` 必须吞掉。`start` 记着按下的那一格 —— 滑动时第一格也要落，
   * 但按下那一刻**不能**直接落（放置态下它还是长按的头像入口，先落编号会让长按
   * 从「编号格」开始，画面上先闪一个编号再变成头像）。
   */
  const paintRef = useRef<{
    start: CellCoord;
    lastKey: string;
    painted: boolean;
  } | null>(null);
  /** 刚放下的编号 / 禁止符号，按格子键索引；见 `MapGamePlacementLayer` 的 `pulse`。 */
  const [pulse, setPulse] = useState<GamePlacementPulse>({});
  const pulseTimersRef = useRef<Map<string, number>>(new Map());

  /**
   * v0.6.2：视图缩放与拖拽平移，与只读预览页同一套手感 ——
   * 缩放簇（放大 / 百分比 / 缩小 / 重置）、Ctrl+滚轮、空格或中键拖拽。
   */
  const [zoom, setZoom] = useState(1);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** 本次指针手势有没有真的拖过画布 —— 拖完那次 click 要吞掉。 */
  const pannedRef = useRef(false);
  /**
   * v0.7.11：本次手势有没有**按住滑过格子**（连续放置 / 连续擦除）。有的话，
   * 抬手时那一记 `click` 是手势的尾巴，已经处理过了 —— 必须吞掉，否则同一格会
   * 被切换两次（放上又取消）。
   */
  const paintedRef = useRef(false);
  /** 用户手动调过视图后，容器尺寸变化不再强制重排（预览页同款豁免）。 */
  const userAdjustedRef = useRef(false);

  /**
   * 存档的镜像。事件处理器读「此刻」的值，而不是渲染闭包里的那份 ——
   * 长按定时器、按住滑动、连续点击都在下一次渲染之外触发，闭包可能已经过期。
   * 滑动一次会连着放好几格，`dispatchCell` 必须基于**最新**棋盘计算，
   * 否则同一帧里的第二次放置会拿着旧棋盘把第一次覆盖掉。
   */
  const placementRef = useRef(placementState);
  placementRef.current = placementState;

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
  /**
   * v0.7.14（docs/v0.7.14.md §3）：题面的两段文字。
   *
   * **旧版本行没有这两个键** —— 已发布的游戏是一份冻住的 JSON，v0.7.14 之前
   * 发布的那批里既没有 `clues` 也没有 `ending`。所以这里一律按「没有」处理：
   * 绝不假设服务端补过默认值（`absorbLegacyPuzzleDraft` 只归一层级，不补字段）。
   */
  const puzzleDescription = detail?.puzzle?.description ?? '';
  const puzzleClues = useMemo(() => detail?.puzzle?.clues ?? [], [detail]);
  const puzzleEnding = (detail?.puzzle?.ending ?? '').trim();
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

  /**
   * v0.8.7 §4：这一局禁止符号画什么 —— **谜题自己配的 → 主题的缺省 → `×`**。
   *
   * 主题那一份按**这一局的主题编码**查（§19）；`useWorkspace()` 在播放页是 `null`，
   * 所以走的是「主题列表摊成表」那条路，与难度分级同一个 hook 家族。
   * `null` 仍是两边都没有，两个游戏图层退回原来那枚 `×`（放置层黑字、提示层绿字）。
   *
   * v0.9.0 §2：查表的活儿挪进 `source` —— 播放器的包里每一关已经烤好了最终结果
   * （`bundleService` 把主题那张补进了关卡 JSON），所以那边一律返回 `null`。
   */
  const forbiddenSymbol = useMemo(
    () =>
      resolveForbiddenSymbolImage(
        detail?.puzzle?.forbiddenSymbol,
        source.themeForbiddenSymbol(detail?.themeCode),
        source.fileUrl,
      ),
    [detail, source],
  );

  /**
   * v0.8.7 §7：工具栏三枚动作按钮（清除 / 撤回 / 提交）画什么 —— 同一套顺序：
   * **谜题自己的 → 主题的 → 内置图标**。主题那一份同样按这一局的主题编码查。
   */
  const toolIcons = useMemo(
    () =>
      resolveToolIcons(
        detail?.puzzle?.toolIcons,
        source.themeToolIcons(detail?.themeCode),
        source.fileUrl,
      ),
    [detail, source],
  );

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

  /** 写存档的唯一出口；空盘时由 `writeGameProgress` 删键。 */
  const saveProgress = useCallback(
    (board: GamePlacementBoard): void => {
      if (!storageId) return;
      writeGameProgress(storageId, { board, ...progressMeta });
    },
    [storageId, progressMeta],
  );

  /**
   * **所有改变棋盘的操作都从这里走**：算新状态 → 更新 → 顺手把结果落进
   * 本地存档。集中一处，「哪个入口忘了存」就不会变成一个需要逐个排查的问题。
   */
  const updatePlacement = useCallback(
    (updater: (state: GamePlacementState) => GamePlacementState): void => {
      const current = placementRef.current;
      const next = updater(current);
      if (next === current) return;
      placementRef.current = next;
      setPlacementState(next);
      saveProgress(next.board);
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
   * v0.8.7 §8：同一套换算，但不除格子大小 —— 得到的是「光标在纸上的哪个像素」。
   * 物品名称提示要用它，格子多大都不影响「指头在哪儿」这件事。
   */
  const toCanvasPoint = useCallback(
    (clientX: number, clientY: number): CanvasPoint | null => {
      const node = containerRef.current;
      if (!node) return null;
      return clientToCanvasPoint(clientX, clientY, {
        rect: node.getBoundingClientRect(),
        pan,
        zoom,
        cellSize,
      });
    },
    [pan, zoom, cellSize],
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
   * v0.7.11：计时（秒级）。
   *
   * 需求是「打开游戏时开始、关掉页面记到本地、下次进来接着走、点提交为止」。
   * 这里存的是**累计用时**而不是开始时间戳：两次会话之间的墙钟差里混着吃饭、
   * 睡觉、关电脑的时间，那不是玩家在想的时长。每秒 tick 一次只为刷新显示，
   * 落盘则是每 5 秒 + 页面隐藏 / 卸载时各一次。
   *
   * 三个 ref 分工：`elapsedRef` 是已累计的毫秒，`runningSinceRef` 是当前这一段
   * 的起点（`null` = 停表）。显示值 `elapsedMs` 只是它们的一次投影。
   */
  const [elapsedMs, setElapsedMs] = useState(0);
  const [timerRunning, setTimerRunning] = useState(true);
  const elapsedRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);

  const currentElapsed = useCallback((): number => {
    const since = runningSinceRef.current;
    return since === null ? elapsedRef.current : elapsedRef.current + (Date.now() - since);
  }, []);

  /** 停表：把当前这一段并进累计值，并立刻落盘。返回停在第几毫秒。 */
  const pauseTimer = useCallback((): number => {
    const value = currentElapsed();
    elapsedRef.current = value;
    runningSinceRef.current = null;
    setElapsedMs(value);
    setTimerRunning(false);
    if (storageId) writeGameTimer(storageId, progressMeta, value);
    return value;
  }, [currentElapsed, storageId, progressMeta]);

  const resumeTimer = useCallback((): void => {
    if (runningSinceRef.current !== null) return;
    runningSinceRef.current = Date.now();
    setElapsedMs(elapsedRef.current);
    setTimerRunning(true);
  }, []);

  /** 重新计时：清零、清掉本地记录、从这一帧重新走。 */
  const resetTimer = useCallback((): void => {
    elapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    setElapsedMs(0);
    setTimerRunning(true);
    if (storageId) clearGameTimer(storageId);
  }, [storageId]);

  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => {
      const since = runningSinceRef.current;
      if (since === null) return;
      setElapsedMs(elapsedRef.current + (Date.now() - since));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  /**
   * 落盘的时机：每 5 秒一次（意外关闭最多丢 5 秒），页面隐藏 / 卸载时各补一次。
   * 为什么不是每秒：localStorage 是同步写，秒针每跳一次就写一条 JSON 没必要。
   */
  useEffect(() => {
    if (!storageId) return;
    const persist = (): void => {
      writeGameTimer(storageId, progressMeta, currentElapsed());
    };
    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') persist();
    };
    const interval = window.setInterval(persist, 5000);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      persist();
    };
  }, [storageId, progressMeta, currentElapsed]);

  /** 刚放下的字形动效过期清理（`place-pop` 只在这一小段时间里挂着）。 */
  useEffect(
    () => () => {
      for (const timer of pulseTimersRef.current.values()) window.clearTimeout(timer);
      pulseTimersRef.current.clear();
    },
    [],
  );

  /**
   * 换一局 / 首次加载：不继承上一局的激活、悬停与棋盘。
   *
   * v0.6.2 §3：棋盘优先从本地存档恢复（同 slug、同网格、同名单才认）。
   * `hydratedKeyRef` 记住已经水合过哪一局 —— StrictMode 的双调用和后续重渲染
   * 都不会把玩家刚摆的东西盖回存档里的那一版。
   *
   * v0.7.11：计时也在这里接上（同一条指纹），并且**不再提示**「已恢复上次的
   * 摆放」—— 棋盘回来了是默认行为，不是一条需要读的新闻。
   */
  const hydratedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draft) return;
    const key = `${storageId ?? ''}|${gridSize}|${slots.length}`;
    const firstLoad = hydratedKeyRef.current !== key;
    hydratedKeyRef.current = key;

    setActivation(INACTIVE_ACTIVATION);
    setHover(null);
    setHoverPoint(null);
    setLabelRegionId(null);
    setMode({ kind: 'idle' });
    setResult(null);
    if (!firstLoad) return;

    const saved = storageId ? readGameProgress(storageId, progressMeta) : null;
    // 历史栈不落盘：回来时从「当前这一版棋盘」重新开始记，撤销不会跨会话。
    const restored: GamePlacementState = saved
      ? { board: saved.board, past: [], future: [] }
      : createGamePlacementState();
    placementRef.current = restored;
    setPlacementState(restored);

    const savedElapsed = storageId ? readGameTimer(storageId, progressMeta) : 0;
    elapsedRef.current = savedElapsed;
    runningSinceRef.current = Date.now();
    setElapsedMs(savedElapsed);
    setTimerRunning(true);
  }, [draft, storageId, gridSize, slots.length, progressMeta]);

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

  /**
   * v0.7.12：提交的前置条件 —— 名单上每位都**已经有头像**。
   *
   * 没放完就允许提交，只能得到一份「谁还没放」的清单，而这份清单在棋盘上本来
   * 就看得见（名册里淡掉的是已放的，亮着的就是还没放的）。禁掉这个按钮，把
   * 「还差谁」提前到按下之前回答，而不是按下之后再数一遍。
   *
   * 编号不算数：它是草稿（见 `allParticipantsPlaced`）。
   */
  const readyToSubmit = useMemo(
    () => allParticipantsPlaced(placementState.board, slots),
    [placementState.board, slots],
  );

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

  const nameOf = useCallback(
    (participantId: number): string | undefined => {
      const slot = slots[participantId - 1];
      return slot ? charactersById.get(slot.characterId)?.name : undefined;
    },
    [slots, charactersById],
  );

  /**
   * v0.7.11：提交 = **结算**，不是打勾。
   *
   * - 停表：点下提交这一刻的用时就是这一局的成绩（读弹窗的时间不算）；
   * - 通过 → 弹窗给出用时与「再玩一次」；
   * - 未通过 → 弹窗只说**谁不对**（`summarizeIssues` 归并过的名单），给
   *   「继续游戏 / 重新开始」。继续游戏会重新走表 —— 玩家要接着想。
   *
   * 提交状态不再落盘、按钮也不再变成勾：那是上一版把「核对过」当成进度的做法，
   * 而进度本来就是棋盘本身。
   */
  const submit = (): void => {
    // v0.7.12：按钮已经禁用，这里再做一次守卫 —— 快捷键 / 测试 / 旧闭包都可能绕过。
    if (!readyToSubmit) return;
    const elapsed = pauseTimer();
    const validation = validatePlacement({
      board: placementRef.current.board,
      slots,
      nameOf,
    });
    if (!validation.passed) {
      setResult({ kind: 'failed', blame: summarizeIssues(validation.issues, nameOf) });
      return;
    }
    setResult({ kind: 'passed', elapsedMs: elapsed });
  };

  /**
   * v0.7.11：重新开始 / 再玩一次 —— 棋盘、历史、计时一起归零。
   *
   * 「清空历史记录」是字面意义上的：`past` / `future` 都丢掉，所以重开这一局
   * 之后撤销不会把上一局的摆放捞回来。
   */
  const restart = useCallback((): void => {
    const fresh = createGamePlacementState();
    placementRef.current = fresh;
    setPlacementState(fresh);
    setResult(null);
    setMode({ kind: 'idle' });
    setActivation(INACTIVE_ACTIVATION);
    setPulse({});
    saveProgress(fresh.board);
    resetTimer();
  }, [saveProgress, resetTimer]);

  /**
   * v0.7.12：关上未通过的弹窗 = 继续这一局，秒表也要接着走。
   *
   * 之前只有「继续游戏」按钮会重启计时；点右上角的 × 或按 Esc 关掉，秒表就
   * 停在那里 —— 同一个动作两条路径，其中一条把玩家的成绩冻住了。通过的弹窗
   * 不受此影响：那一局已经结算，表就该停着。
   */
  const closeResult = (): void => {
    if (result?.kind === 'failed') resumeTimer();
    setResult(null);
  };

  /** 未通过时「继续游戏」：关上弹窗，接着走表、接着摆。 */
  const continueGame = (): void => {
    setResult(null);
    resumeTimer();
  };

  /**
   * v0.7.11：给刚放下的编号 / 禁止符号挂一次「盖章」动效。
   *
   * 用一张「格子键 → 参与者编号」的表而不是单个「最后一格」：按住滑动会连着
   * 放好几格，单值会让前一格的字形在动画播到一半时被摘掉类，缩放猛地弹回原样。
   * 每一格 400ms 后自己过期（动画只有 180ms），表不会越积越大。
   */
  const markPulse = (key: string, participantId: number | null): void => {
    setPulse((previous) => ({ ...previous, [key]: participantId }));
    const timers = pulseTimersRef.current;
    const existing = timers.get(key);
    if (existing !== undefined) window.clearTimeout(existing);
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        setPulse((previous) => {
          if (!(key in previous)) return previous;
          const next = { ...previous };
          delete next[key];
          return next;
        });
      }, GAME_PLACE_PULSE_MS),
    );
  };

  /**
   * SPEC-G01 / SPEC-G03 / SPEC-G04 / SPEC-G05 + v0.4.3 SPEC-J02 / SPEC-J03 /
   * SPEC-J05: one cell interaction, dispatched by mode. 放置态下 `variant` 区分
   * **短按（切换编号）**与**长按（放头像）**；其余工具态忽略它。
   *
   * v0.7.11：
   * - 棋盘一律读 `placementRef.current`。按住滑动会在**同一个事件循环**里连着
   *   调用好几次，读渲染闭包里的 `placementState` 会让后一次把前一次覆盖掉。
   * - `quiet` 让滑动经过的不可放置格**不出 toast**：划过一行十来格，弹十几个
   *   错误提示既挡住棋盘又说不清是哪一格。单点仍然照常说明原因。
   * - 返回**是否真的执行了**：长按的进度环靠它决定收场 —— 环画满却什么都没发生，
   *   会读成「按成功了但没反应」，比不画环更糟。
   */
  const dispatchCell = (
    x: number,
    y: number,
    variant: ParticipantPlacementVariant,
    options?: { quiet?: boolean },
  ): boolean => {
    const board = placementRef.current.board;
    if (mode.kind === 'placing') {
      const block = placementBlockReason({
        board,
        x,
        y,
        participantId: mode.participantId,
        blockingCells,
        variant,
      });
      if (block) {
        const message = describeBlock(block, mode.participantId);
        if (message && !options?.quiet) toast.error(message);
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
      if (variant === 'number') markPulse(cellKey(x, y), mode.participantId);
      /**
       * v0.8.5：头像落下之后，手上就没有东西了 —— 名册那张卡的选中环跟着退掉。
       * 规则本身在 `modeAfterPlacement` 里（编号不受影响，见那里的注释）。
       *
       * v0.8.7：退的还有**触碰态**。之前这里只 `setMode`，于是名册上那道 2px
       * 主色环、棋盘上这位参与者的联动高亮与放大头像一起留了下来 —— 头像明明
       * 已经落定，界面还在说「这位正被拿着」。放置态结束就是整手操作结束，
       * 走 `applyMode`（它已经把「离开放置态 → `escape`」这条规矩收在一处，
       * 见 SPEC-G04）。
       */
      const nextMode = modeAfterPlacement(mode, variant);
      if (nextMode !== mode) applyMode(nextMode);
      return true;
    }
    if (mode.kind === 'forbidden') {
      const key = cellKey(x, y);
      const before = placementRef.current.board[key] ?? null;
      /**
       * v0.7.12：`×` 是一支开关 —— 已经有 `×` 的格子再点一下就收回它
       * （`toggleForbidden`）。这一支要求来自「点错了只好切橡皮」的绕路。
       */
      if (before?.kind === 'forbidden') {
        updatePlacement((state) => toggleForbidden(state, { x, y, blockingCells }));
        return true;
      }
      // v0.7.12：放不进去（不可站立 / 头像格）时不播「刚放下」的动效 ——
      // 那一格本来就没有 `×` 可放。
      if (!canPlaceForbidden({ board: placementRef.current.board, x, y, blockingCells })) {
        return false;
      }
      updatePlacement((state) => placeForbidden(state, { x, y, blockingCells }));
      markPulse(key, null);
      return true;
    }
    if (mode.kind === 'clearing') {
      updatePlacement((state) => clearCell(state, { x, y }));
      return true;
    }
    return false;
  };

  /**
   * 放置态下在格子上按下：启动长按定时器（到点放**头像**）。没到点就抬手的
   * 短按由随后到来的 `click` 收尾 —— 那一路走 SPEC-J03 的**编号切换**。
   *
   * v0.7.11 两件事：
   * - 环**延迟** 160ms 才挂载。单点根本不会长按，之前它却会在按下的第一帧就
   *   闪出来 —— 那是在预告一件不会发生的事。因此环只画剩下的 340ms，画满的
   *   那一帧仍然是头像落下的那一帧。
   * - 动作被规则拒绝时 `dispatchCell` 返回 false，环立刻收回：不能让一个满环
   *   停在那里冒充「已经放好了」。
   */
  const startCellPress = (x: number, y: number, participantId: number): void => {
    /**
     * v0.7.12：这一格根本放不进去 —— 整段手势都不开始。
     *
     * 不可站立的格子、已经标了 `×` 的格子、以及这位参与者自己的头像格：长按
     * 500ms 的**结果**是不存在的（`placeParticipant` 会原样返回）。但环会照画
     * 一圈满的，画满那一刻却什么都没发生 —— 那是界面在替玩家宣布一件没做成的事。
     * 需求给的说法是「不出现圆圈，不提示，就是无效果」，所以这里在按下的一刻就
     * 退回，连定时器都不挂。
     *
     * 这条判断只针对**长按（头像）**。短按（编号）走的是另一套：非站立格仍会
     * 说明原因，`×` 格与头像格则同样静默 —— 见 `describeBlock`。
     */
    const refused = placementBlockReason({
      board: placementRef.current.board,
      x,
      y,
      participantId,
      blockingCells,
      variant: 'image',
    });
    if (refused) return;

    const stale = cellPressRef.current;
    if (stale) {
      window.clearTimeout(stale.timer);
      window.clearTimeout(stale.ringTimer);
    }
    const press = { timer: 0, ringTimer: 0, fired: false };
    pressSeqRef.current += 1;
    const seq = pressSeqRef.current;
    press.ringTimer = window.setTimeout(() => {
      // 已经抬手 / 换了手势：这一圈不该再出现。
      if (cellPressRef.current !== press) return;
      setPressCell({ x, y, seq });
    }, GAME_PRESS_RING_DELAY_MS);
    press.timer = window.setTimeout(() => {
      press.fired = true;
      if (!dispatchCell(x, y, 'image')) setPressCell(null);
    }, GAME_LONG_PRESS_MS);
    cellPressRef.current = press;
  };

  /**
   * 抬手：两个定时器都作废；长按已生效时**保留** `fired`——紧随其后的 click
   * 还要靠它识别「这一手是长按」并把 click 吞掉。
   *
   * 环在抬手时一律收掉：长按已生效的话，满环套在刚放下的头像上只会挡住它。
   */
  const endCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    if (!press.fired) cellPressRef.current = null;
  };

  /** 移出画布 / 指针中断：连 `fired` 一起丢——不会再有 click 来收尾。 */
  const dropCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    cellPressRef.current = null;
  };

  /**
   * v0.7.11：按住滑动 = 不是长按。定时器与环一起作废，`fired` 也不需要保留 ——
   * 这一笔后面的 click 由 `paintedRef` 吞掉，不靠 `fired`。
   */
  const cancelCellPress = (): void => {
    setPressCell(null);
    const press = cellPressRef.current;
    if (!press) return;
    window.clearTimeout(press.timer);
    window.clearTimeout(press.ringTimer);
    cellPressRef.current = null;
  };

  const startClearPress = (): void => {
    const press = { timer: 0, ringTimer: 0, fired: false };
    pressSeqRef.current += 1;
    const seq = pressSeqRef.current;
    // 与格子上的环同一个延迟：单点（切换清除工具）不该闪一圈。
    press.ringTimer = window.setTimeout(() => {
      if (clearPressRef.current !== press) return;
      setClearPress(seq);
    }, GAME_PRESS_RING_DELAY_MS);
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
    window.clearTimeout(press.ringTimer);
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

  const undoSteps = placementState.past.length;

  if (gameQuery.isLoading) {
    return <LoadingScreen caption="正在加载游戏…" />;
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
            中 = 题面（描述 + 全局线索），下 = 参与者面板（与预览页同一个组件）。

            v0.7.14：这三段之间**不画线**。它们读起来是同一段话的段落 —— 哪一局、
            要做什么、多出什么条件、这些人怎么站；一条横线会把「条件」和「人」切成
            两个互不相干的区域，而线索说的正是这些人。
            （原本标题区有 `border-b`，那条线正好压在参与者框头顶。） */}
        <aside
          className="flex shrink-0 flex-col border-r bg-background"
          style={{ width: rosterWidth }}
        >
          <div className="shrink-0 space-y-1 p-3">
            {/* FEAT-L07: 返回箭头后是品牌名，游戏名放下一行。
                v0.5.3 FEAT-N03 (§2): the brand name is the logo itself. */}
            <div className="flex items-center gap-1">
              <IconButton
                variant="ghost"
                icon={<ArrowLeft className="h-4 w-4" />}
                label={themeRef ? '返回主题' : '返回游戏列表'}
                side="right"
                className={TOOLBAR_ICON_HOVER_CLASS}
                onClick={() => navigate(themeRef ? source.themeHref(themeRef) : source.listHref())}
              />
              {themeRef ? (
                <Link
                  to={source.themeHref(themeRef)}
                  className="min-w-0 truncate text-xs text-muted-foreground hover:text-foreground"
                  title="回到这个主题"
                >
                  {themeQuery.data?.name ?? '主题'}
                </Link>
              ) : (
                <BrandLogo height={16} />
              )}
              {/* v0.5.7: 玩家端没有 AppShell 头部，主题开关挂在左栏这一行右侧。 */}
              <ThemeToggle className="ml-auto" />
            </div>
            {/*
              * v0.7.12：计时挪到标题行最右边 —— 它是「这一局」的元信息，与名字、
              * 尺寸同一行；放在右栏底部被步数挤着，反而像第三条统计。不要图标，
              * 只留粗体淡色的 `mm:ss`。
              */}
            <div className="flex items-baseline gap-2 pl-1">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={game.name}>
                {game.name} {gridSize}x{gridSize}
              </p>
              <span
                data-testid="game-timer"
                className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground"
                title="本局用时（提交后停止）"
              >
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          </div>

          {/*
            v0.7.14（docs/v0.7.14.md §4）：题面。描述在上、全局线索在下，钉在标题
            与名册之间 —— 三样东西同时在视野里，谁也不用滚动去换另一个。
            没有内容时组件自己返回 `null`，所以这里不必先判空。
          */}
          <GameBrief description={puzzleDescription} clues={puzzleClues} />

          <div className="flex min-h-0 flex-1">
            <ParticipantPanel
              slots={slots}
              charactersById={charactersById}
              cols={rosterCols}
              /*
               * v0.7.11：游戏页的名册也有「选中」—— 手上正拿着的那位（放置态），
               * 不是鼠标碰巧路过的那位。选中态是一道 3px 的连续主色边（描边 +
               * 外扩同色，中间不留缝，见 `PARTICIPANT_SELECTED_RING`），带一次
               * 180ms 的鼓起。
               */
              selectedSlotIndex={mode.kind === 'placing' ? mode.participantId - 1 : null}
              draggingIndex={null}
              activeSlotIndex={activation.activeParticipantId}
              highlightedSlots={highlightedSlots}
              highlightColors={highlightColors}
              readOnly
              // v0.7.11：去掉「参与者 5/5」那行标题 —— 玩家端上面已经有一行。
              hideHeader
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
            if (mode.kind === 'idle') return;
            const cell = toCell(event.clientX, event.clientY);
            if (!cell) return;
            /**
             * v0.7.11：按住滑动连续操作。按下这一刻**不落任何东西** ——
             * 放置态下它还可能是长按（放头像）的起点，先落编号会让同一手势
             * 先闪一个编号再变成头像。真正落笔发生在指针进入第二个格子时。
             */
            paintedRef.current = false;
            paintRef.current = {
              start: cell,
              lastKey: cellKey(cell.x, cell.y),
              painted: false,
            };
            if (mode.kind === 'placing') startCellPress(cell.x, cell.y, mode.participantId);
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
            const cell = toCell(event.clientX, event.clientY);
            setHover(cell);
            setHoverPoint(toCanvasPoint(event.clientX, event.clientY));

            const paint = paintRef.current;
            if (!paint || !cell) return;
            // 长按已经放了头像：这一笔到此为止，不再往别的格子刷编号。
            if (cellPressRef.current?.fired) return;
            const key = cellKey(cell.x, cell.y);
            if (key === paint.lastKey) return;
            if (!paint.painted) {
              paint.painted = true;
              // 滑出了第一格 = 拖动，不是长按。
              cancelCellPress();
              // 起点那一格也要落：它同样是「划过的格子」。
              dispatchCell(paint.start.x, paint.start.y, 'number', { quiet: true });
            }
            paint.lastKey = key;
            dispatchCell(cell.x, cell.y, 'number', { quiet: true });
          }}
          onPointerUp={(event) => {
            panRef.current = null;
            const paint = paintRef.current;
            paintRef.current = null;
            if (paint && !paint.painted && !cellPressRef.current?.fired) {
              /**
               * 划得太快时浏览器可能一个 `pointermove` 都没给（按下与抬手之间
               * 直接换了格子）。抬手时才发现的话，补上起点与落点这两格。
               */
              const cell = toCell(event.clientX, event.clientY);
              if (cell && cellKey(cell.x, cell.y) !== paint.lastKey) {
                paint.painted = true;
                cancelCellPress();
                dispatchCell(paint.start.x, paint.start.y, 'number', { quiet: true });
                dispatchCell(cell.x, cell.y, 'number', { quiet: true });
              }
            }
            if (paint?.painted) paintedRef.current = true;
            endCellPress();
          }}
          onPointerCancel={() => {
            panRef.current = null;
            paintRef.current = null;
            dropCellPress();
          }}
          onPointerLeave={() => {
            panRef.current = null;
            paintRef.current = null;
            dropCellPress();
            setHover(null);
            setHoverPoint(null);
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
            // 刚按住滑过格子：已经落过笔了，这一下也是尾巴。
            if (paintedRef.current) {
              paintedRef.current = false;
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
            {/* v0.8.7 §6：这张纸的投影 —— 外框色压一层透明度，向右下偏 6px 的硬影。 */}
            <div
              className="absolute left-0 top-0 bg-background"
              style={{
                width: total,
                height: total,
                zIndex: MAP_LAYER_Z.canvasBase,
                ...canvasShadowStyle(style),
              }}
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
              gridSize={gridSize}
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
            />

            {/* 层 4 · 工具提示层 — SPEC-G02 */}
            <MapGameToolHintLayer
              hint={toolHint}
              cell={hoverEffects.cell}
              cellSize={cellSize}
              slots={slots}
              forbiddenSymbol={forbiddenSymbol}
            />

            {/* v0.7.11：长按进度环 —— 按住 500ms 的等待可见化（SPEC-J02）。
                环延迟 160ms 才挂载，所以只画剩下的 340ms。 */}
            <MapGamePressRing
              cell={pressCell}
              cellSize={cellSize}
              durationMs={GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS}
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
              /* v0.7.11：刚放下的编号 / 禁止符号各「盖章」一次。 */
              pulse={pulse}
              /* v0.8.6：配置了图片时，放下的禁止符号画那张图而不是 `×`。 */
              forbiddenSymbol={forbiddenSymbol}
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
            {/*
              v0.8.6：这条谜题给禁止符号配了图，工具按钮就画**同一张图** ——
              按钮上是什么，落下去就是什么（v0.6.4 给编号立下的规矩，v0.8.6 已用
              在工具提示层）。没配时才退回那枚红色 `×` 字形。

              深色界面要翻一次：这些图多半是「深墨画在透明底上」（作者是按浅色的
              地图纸挑的），直接放在 `bg-background` 上等于没有。`invert` 把明度
              翻过来，`hue-rotate-180` 再把色相转回去 —— 只用 `invert` 的话，一枚
              红印在深色下会变成青色。
            */}
            {forbiddenSymbol ? (
              <img
                src={forbiddenSymbol.imageUrl}
                alt=""
                draggable={false}
                data-testid="forbidden-tool-icon"
                className="h-5 w-5 select-none object-contain dark:invert dark:hue-rotate-180"
              />
            ) : (
              <X className="h-5 w-5 text-destructive" />
            )}
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
            <GameToolIcon render={toolIcons.clear} name="clear" />
            {/*
             * v0.7.11：长按 500ms 清空全部 —— 与棋格长按画同一圈进度环。
             * 两个长按此前都没有过程反馈，用户只能猜「按住够不够久」；
             * 一致的环让「按住 500ms」这件事在界面上只有一种样子。
             */}
            {clearPress !== null ? (
              <PressRing
                size={40}
                durationMs={GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS}
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
            <GameToolIcon render={toolIcons.undo} name="undo" />
          </Button>
          {/*
            * v0.7.11：提交按钮不再变成勾 —— 提交是一次**结算**，不是一个要记住
            * 的状态。勾只会在下一次进来时变成一句谎话（玩家看到自己没做过的勾）。
            * v0.7.12：没放完不能提交（编号不算放置）。
            */}
          <Button
            variant="ghost"
            className={cn('h-12 w-full', TOOLBAR_ICON_HOVER_CLASS)}
            title={
              readyToSubmit ? '提交当前摆放（先校验）' : '还有参与者没放好，放完才能提交'
            }
            disabled={!readyToSubmit}
            onClick={submit}
          >
            <GameToolIcon render={toolIcons.submit} name="submit" />
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

          {/* SPEC-G04 §6.4: step counter —— v0.7.12 起计时不再在这里（见标题行） */}
          <div className="mt-auto w-full border-t pt-2 text-center text-2xs leading-relaxed text-muted-foreground">
            已放置 {countPlacements(placementState.board)} 个
            <br />
            可回退 {undoSteps} 步
          </div>
        </aside>
      </div>

      {/*
        v0.7.11：提交的两种结局共用一个弹窗。
        - 通过：用时 + 再玩一次；
        - 未通过：只说谁不对（不展开行列坐标）+ 继续游戏 / 重新开始。
        两种都用 `Dialog`，不是 `AlertDialog` —— 这里不是「要不要删除」那种确认，
        而是一局结束后的结算。
      */}
      <Dialog
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) closeResult();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {result?.kind === 'passed' ? '提交通过' : '提交未通过'}
            </DialogTitle>
            <DialogDescription>
              {result?.kind === 'passed'
                ? `用时 ${formatElapsed(result.elapsedMs)}。`
                : '下面这些参与者的位置还不对，改完可以再提交一次。'}
            </DialogDescription>
          </DialogHeader>

          {/*
            v0.7.14（docs/v0.7.14.md §4）：结束语。作者的一句话，通过时才出现。
            **不给它加标签**（不写「结束语：」）—— 那是作者的声音，不是界面在说话；
            换成楷体、和上面的用时之间隔一条细线，就够把「这是另一件事」说清楚。
          */}
          {result?.kind === 'passed' && puzzleEnding.length > 0 ? (
            <p className="whitespace-pre-wrap border-t pt-3 font-kai text-sm leading-[1.9] text-foreground/90">
              {puzzleEnding}
            </p>
          ) : null}

          {result?.kind === 'failed' ? (
            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2 text-xs">
              {result.blame.map((entry) => (
                <li key={entry.participantId} className="flex items-center gap-2">
                  <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-2xs text-destructive">
                    {entry.reason === 'unplaced' ? '未放置' : '位置不对'}
                  </span>
                  <span>{entry.label}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <DialogFooter>
            {result?.kind === 'passed' ? (
              <>
                <Button variant="outline" onClick={closeResult}>
                  关闭
                </Button>
                <Button onClick={restart}>再玩一次</Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={continueGame}>
                  继续游戏
                </Button>
                <Button onClick={restart}>重新开始</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
