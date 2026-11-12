import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Minus, Plus, RotateCcw, Ruler, X } from 'lucide-react';
import {
  DEFAULT_CELL_SIZE,
  GAME_CHECK_RING_SWEEP_MS,
  GAME_CHECK_STEP_MS,
  GAME_VERDICT_HOLD_MS,
  GAME_CLEAR_LONG_PRESS_MS,
  GAME_LONG_PRESS_MS,
  GAME_PRESS_RING_DELAY_MS,
  MAP_LAYER_Z,
  RULER_ACTIVE_FONT_DELTA,
  UI_Z,
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
import { PressSweep } from '@/components/common/PressSweep';
import {
  DIALOG_OVERLAY_TINT_CLASS,
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
  MapGameCheckLayer,
  MapGamePlacementLayer,
  MapGamePressRing,
  MapGameToolHintLayer,
  type GamePlacementPulse,
  type GamePlacementWave,
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
import { VerdictMark } from '@/components/game/VerdictMark';
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
import { nextUnfinishedLevel, type GameLevelRef } from '@/lib/gameCatalog';
import {
  clearGameCompletion,
  readGameCompletion,
  recordGameCompletion,
} from '@/lib/gameCompletion';
import { useProvidedGameSource, type GameSource } from '@/lib/gameSource';
import {
  resetGameTimer,
  formatElapsed,
  readGameTimer,
  writeGameTimer,
} from '@/lib/gameTimer';
import { resolveMarkImage } from '@/lib/mark';
import { resolveRingImage } from '@/lib/ring';
import { resolveCheckColors } from '@/lib/checkStyle';
import { TOOL_ICON_FALLBACKS, resolveToolIcons, type ToolIconRender } from '@/lib/toolIcons';
import { rosterPanelWidthFor } from '@/lib/participantLayout';
import { TOOLBAR_ICON_ACTIVE_CLASS, TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';
import {
  collectBlockingCells,
  collectItemCells,
  resolveHoverEffects,
} from '@/lib/canvasLayers';
import {
  canvasInsets,
  centeredPan,
  computeCellSizeForInsets,
  computeWidthFitCellSize,
  isPortraitViewport,
  portraitInsets,
  portraitStageHeight,
  topAlignedPan,
} from '@/lib/canvasSize';
import { verdictMarkScale } from '@/lib/verdictMark';
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
  createGamePlacementState,
  forbiddenCells,
  avatarCellOf,
  avatarPlacedParticipantIds,
  autoForbiddenWavePlan,
  modeAfterPlacement,
  placeForbidden,
  placeParticipant,
  placementAt,
  placementBlockReason,
  resolveToolHint,
  toggleForbidden,
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

/**
 * v0.7.11：刚放下的编号 / 标记挂多久的 `place-pop` 类。
 *
 * 动画本身只有 180ms；多留一段是为了让**同一帧里放下的另一格**（按住滑动）也
 * 各自挂着自己的类，而不是互相顶掉。过了这个窗口就摘掉，免得以后任何一次重挂载
 * 把旧格子再「盖章」一遍。
 */
const GAME_PLACE_PULSE_MS = 400;

/**
 * v0.9.8：橡皮擦掉一格时，「退场动效演完」到「真的从棋盘上删掉」之间隔多久。
 *
 * 与 `--motion-base`（180ms）同档：动效是缩小淡出，删早了会被截在半路，删晚了
 * 那格已经透明却还占着「不可站立」的判定。留 40ms 给动画的收尾帧。
 */
const GAME_ERASE_MS = 220;

/**
 * v0.10.1：落子补出来的 `×` 每圈晚多少毫秒 —— 水波纹的波速。
 *
 * 45ms 是「看得出一圈一圈，又不至于等到不耐烦」的那一档：一圈最多 24 格，
 * 最远的格子距落子格 23 圈，末圈在 1035ms 之后才淡入；再快（30ms）就成了「雾
 * 一样整体浮出来」，再慢（80ms）在 24×24 的棋盘上要等近两秒。
 *
 * 与 `place-pop` 的 180ms 同量级 —— 每一圈自己只演 180ms，圈与圈之间留 45ms
 * 的步进，于是总能看到三四个圈同时在扩散。
 */
const GAME_FORBIDDEN_WAVE_STEP_MS = 45;

/**
 * v0.10.1：一批水波纹挂多久。末圈延迟 + 动画时长 + 一点余量。
 *
 * 摘类不是为了让动效停（`both` 已经把它停在末帧），而是让**下一波**能重新挂上
 * 同名类。这个窗口内玩家再落一子，就直接换 `animation-name`（见 `forbiddenWaveAlt`）。
 */
const GAME_FORBIDDEN_WAVE_MS = 1200;

function readStoredRulerVisible(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(RULER_STORAGE_KEY) !== 'hidden';
}

/**
 * v0.9.3 §2：提交时逐人圈一遍的**名单** —— 按序号排，只有落了头像的才有格子可圈。
 *
 * 「通过 / 未通过」直接取自判卷结果（`issues` 里有这位的编号就是没过）。判卷与
 * 呈现因此用的是同一份结论，不会出现「圈是绿的、名单里却有他」。
 *
 * 只圈**落了头像**的人：编号格上没有人形，圈住一堆数字说不清是在核对谁。没
 * 落头像的那几位不上动画 —— 棋盘上没有可圈的格子；结论弹窗也不再列名字
 * （v0.9.4），只把绿圈的数量写成 `x/n 正确`。
 */
interface CheckItem {
  participantId: number;
  cell: CellCoord;
  passed: boolean;
}

function buildCheckItems(
  board: GamePlacementBoard,
  slots: Array<CharacterSlotEntry | null>,
  issues: readonly PlacementIssue[],
): CheckItem[] {
  const failed = new Set(issues.map((issue) => issue.participantId));
  const items: CheckItem[] = [];
  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const cell = avatarCellOf(board, participantId);
    if (!cell) return;
    items.push({ participantId, cell, passed: !failed.has(participantId) });
  });
  return items;
}

/**
 * v0.9.4：核对期间四处**各自完整**的遮罩 —— 左栏、右栏、中列留白、画布底色层。
 *
 * 不再用全屏四块挖洞：
 * - 左右两栏本来就是独立的 `aside`，各盖一层即可（挡点击）；
 * - 中列（`main`）那一层铺满整个地图区，`z = saveMask(40)`，压住标尺条带与画布
 *   四周的留白；它**低于**画布纸（`canvasBase` 容器在校验时抬到 `saveMask+1`），
 *   所以棋盘本身照常明亮，只有纸以外的部分被压暗；
 * - 画布底色层那一层塞进 `canvasBase` 里（纸底之上、其余图层之下），只压暗没铺
 *   背景图的格子，铺了图 / 物品 / 头像 / 校验圈的格子照常亮。
 *
 * 颜色统一取弹窗 overlay 的 `DIALOG_OVERLAY_TINT_CLASS`，四处不会各说一套。
 */
function CheckScrim({
  area,
  className,
  style,
}: {
  area: 'left' | 'right' | 'canvas' | 'center';
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-testid="check-scrim"
      data-scrim-area={area}
      className={cn(DIALOG_OVERLAY_TINT_CLASS, className)}
      style={style}
    />
  );
}

/**
 * v0.8.7 §7：工具栏上的画 —— 作者给这一枚配了图就画图，没配就是内置的 lucide 图标。
 *
 * 深色界面要翻一次：与标记同一条理由（图多半是「深墨画在透明底上」，按浅色
 * 地图纸挑的），`invert` 翻明度、`hue-rotate-180` 把色相转回来，否则红印会变青。
 */
function GameToolIcon({
  render,
  name,
}: {
  render: ToolIconRender | undefined;
  name: GameToolIconKind;
}): JSX.Element {
  /**
   * v0.9.0 §17：四枚工具按钮的图标统一放大到 32px（`h-8 w-8`）。内置图标与作者
   * 上传的图**共用这一处尺寸** —— 否则「配了图反而变小」会像是上传坏了。
   * 按钮仍是 48px 触屏档，图标四周各留 8px；长按清除的那道扇形是填在按钮
   * 底下的（v0.9.2 §5），不与图标抢地方。
   *
   * v0.10.1 竖屏：图标仍是 2rem（`h-8 w-8`，与桌面同档），底栏高度收到 54px ——
   * 手指点在手机屏上要的是「够大够近」，不是「图标越大越好」：2rem 的图标配
   * 54 高的长条钮，四枚一排铺满屏宽，比原来 44px 的方钮好按，又不至于把
   * 棋盘和名册的高度抢掉。桌面端不动。
   */
  if (!render) {
    const Fallback = TOOL_ICON_FALLBACKS[name];
    return <Fallback className="h-8 w-8" />;
  }
  return (
    <img
      src={render.imageUrl}
      alt=""
      draggable={false}
      data-testid={`${name}-tool-icon`}
      className="h-8 w-8 select-none object-contain dark:invert dark:hue-rotate-180"
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
 *
 * v0.9.5 追加：**换关 = 换一局**，所以这里按关卡把实际渲染层整个换掉。
 *
 * 为什么 `key` 必须下到这一层：`GameView` 是所有入口的汇合点 —— 线上 / 工坊是
 * `ApiGamePage → GameView`，播放器是 `PlayerGamePage → GamePage → GameView`。
 * 把 `key` 加在 `GamePage` 上只覆盖播放器那一条（实测线上路径根本没经过它，
 * 换关后缩放仍停在上一关的 130%）。加在这一层，于是**每一个**入口都自动得到
 * 「换关即重建」，将来再接第三个入口也不会漏。
 *
 * `key` 变了 React 就卸载旧的 `GameViewForLevel`、挂一个新的：缩放 / 平移、
 * 放置模式、联动激活、长按环、刚放下的脉冲表、计时器、结算状态全部回到初值，
 * 再由新一关自己的数据重新水合。
 *
 * 为什么必须是 `key` 而不是在渲染层里逐个 `setXxx` 重置：逐关状态有二三十个
 * （下面那一大片 `useState` / `useRef`），靠一份「换关时要清哪些」的清单去维护，
 * 漏一个就是这一处 bug 的重演。`key` 是唯一一处能保证「全都归零」的写法。
 *
 * 路由参数在**外面**读：`params.slug`（线上 / 工坊）与 `params.key`（播放器）
 * 是两个名字，收成一处之后渲染层不必再关心自己在哪个入口。
 */
export function GameView({ source }: { source: GameSource }): JSX.Element {
  const params = useParams<{ slug?: string; key?: string }>();
  const levelKey = (params.slug ?? params.key) || '';
  return <GameViewForLevel key={levelKey} source={source} />;
}

/**
 * 一关的渲染层本体。**不要直接用它** —— 它带着「上一次换关留下来的状态」，
 * 只有外面那层 `key` 才能保证换关时清零（见 `GameView`）。
 */
function GameViewForLevel({ source }: { source: GameSource }): JSX.Element {
  /**
   * OPT-W04 (docs/v0.4.1.md §4.7): the route parameter is the access path.
   *
   * v0.9.0 §3：播放器的路由参数叫 `key`（`/loredoku/:code/play/:key`），工坊叫
   * `slug`。两个入口共用一个组件，参数名就都收在这里，别处只认 `slug`。
   *
   * v0.9.2：合辑（`/play/theme/:themeSlug/:slug`）连同 `theme_deployments` 两张表
   * 一起删了，于是这里不再有「从哪个主题进来」这一档 —— 顶栏恒为 `loredoku` 与
   * 「返回游戏列表」，与播放器、工坊单局入口三处一致。
   */
  const params = useParams<{ slug?: string; key?: string; code?: string }>();
  const slug = (params.slug ?? params.key) || null;
  const navigate = useNavigate();

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
  /**
   * v0.9.5：整份关卡清单 —— 只为定案卡上那枚「下一关」。顺序就是列表页看到的
   * 那一份（线上 `/api/games`、播放器 `manifest.games`，两者都已按作者排的
   * `sort_weight, slug` 排好），所以「下一关」永远是「列表里下一张卡」。
   *
   * 读不出来（接口失败 / 包里没清单）→ `null`，那枚按钮不出现。
   */
  const catalogQuery = source.useCatalog();

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
   * 动作不同（再玩一次 / 继续游戏）。
   *
   * v0.9.4：未通过**不再带名单**。棋盘上那几圈已经把谁不对画出来了，弹窗再
   * 列一遍编号 / 位置是第三遍重复；这里只留一句「未能结案」，外加一个不带
   * 身份信息的计数（`x/n 正确`）—— 数量告诉玩家差多远，不点名。
   *
   * `correct` / `total` 是**按下提交那一刻**的快照，和棋盘上的绿圈同源；弹窗
   * 背后玩家没法改棋盘（遮罩 + 结论层），但结算卡也不该跟着后来的状态变。
   */
  const [result, setResult] = useState<
    | { kind: 'passed'; elapsedMs: number }
    | { kind: 'failed'; correct: number; total: number }
    | null
  >(null);
  /**
   * v0.9.3 §2：提交后的**逐人校验**。
   *
   * 提交不再直接弹结论：先把棋盘上的参与者按序号挨个圈一遍，圈完才给结果。
   * 这一步不是计算（答案早就有了），是**让人看见核对的过程** —— 之前按下提交，
   * 弹窗立刻盖上来，玩家连自己哪一格被算成「不对」都不知道。
   *
   * `revealed` 是「已经圈过几位」。它同时决定画几个圈、以及什么时候收尾。
   * 结算弹窗出现后这一份仍留着 —— 那些圈就是背景里的一张结论图，关弹窗时一起撤。
   */
  const [checkRun, setCheckRun] = useState<{
    items: CheckItem[];
    revealed: number;
    runId: number;
  } | null>(null);
  const checkRunIdRef = useRef(0);
  /** 校验序列落定之后要弹的那份结论 —— 提前算好，等最后一圈扫完再交出去。 */
  const pendingResultRef = useRef<
    | { kind: 'passed'; elapsedMs: number }
    | { kind: 'failed'; correct: number; total: number }
    | null
  >(null);
  const [showRulers, setShowRulers] = useState<boolean>(readStoredRulerVisible);

  /**
   * v0.10.1：当前是不是「竖屏窄屏」—— 棋盘按宽度铺满、视图簇收起。
   *
   * 判定口径是**窗口**的宽高（`window.innerWidth < 768 && innerHeight > innerWidth`），
   * 与右栏那串 `portrait:max-md:` 媒体查询是同一个条件；之所以两边都写，是因为
   * CSS 只能管「显示不显示」，管不了「格子怎么算」。数字必须一致，
   * `PORTRAIT_BREAKPOINT` 是两边共同的出处（见 `lib/canvasSize.ts`）。
   *
   * 只影响渲染，不落盘：转屏、拖窗口都会重新 `fit` 一遍。
   */
  const [portraitFit, setPortraitFit] = useState(false);

  /**
   * v0.10.1：描述弹框是否开着（见头部那枚「谜题描述」图标）。
   *
   * 只跟 `portraitFit` 配套使用：竖屏上面板里不再画描述（`GameBrief` 的
   * `hideDescription`），改成右上角一枚图标点开。桌面端描述仍留在左栏面板里，
   * 那枚图标根本不渲染 —— 它比主题开关还不常按。
   */
  const [descriptionOpen, setDescriptionOpen] = useState(false);

  /**
   * v0.9.6：这一关**已完成**（进页面时读到的通过记录）。
   *
   * 它和 `result` 不是一件事：`result` 是「刚刚结算完、结算卡开着」，`finished`
   * 是「这一关以前就结案了」。后者让页面一进来就摆出结案遮罩、表停在 00:00，
   * 直到玩家点「再玩一次」。
   *
   * 声明放在最前面的 state 区（而不是计时那一带）是因为 `hoverEffects` 的
   * `useMemo` 要读它，必须比那个 `useMemo` 先声明，否则 TDZ。
   */
  const [finished, setFinished] = useState(false);

  /**
   * v0.9.7：**结案的那一局，整块画布与名册都不再接指针**。
   *
   * 用户：「定案的游戏里，有地图遮罩，就不要有鼠标和地图及物品人物的交互」。
   *
   * 两层防守，缺一不可：
   * 1. 两个容器挂 `pointer-events-none`（挡 hit-testing），遮罩与头部各自
   *    `pointer-events-auto` 恢复；
   * 2. **所有入口 handler 再短路一次** —— CSS 只挡命中，遮罩接住的事件仍会
   *    沿 React 树冒泡回 `<main>`，不守住这一层，格子照样会亮、会落笔。
   *
   * 这也是为什么 `hoverEffects` 从源头收到 `hover: null`：不管冒泡把 state
   * 写成什么，画出来的都是 `NO_HOVER_EFFECTS`。
   */
  const interactionLocked = finished;
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
  /** 刚放下的编号 / 标记，按格子键索引；见 `MapGamePlacementLayer` 的 `pulse`。 */
  const [pulse, setPulse] = useState<GamePlacementPulse>({});
  const pulseTimersRef = useRef<Map<string, number>>(new Map());
  /**
   * v0.9.8：**落笔令牌 + 落笔格** —— 点下去放一枚 `×` 时两样一起动。
   *
   * - `forbiddenPop` 让提示层在**两支同款动画**之间换名字（`forbidden-pop` /
   *   `forbidden-pop-alt`）：`animation-name` 一变，CSS 动画就从头播。只增不减。
   * - `forbiddenPopCell` 是**刚落笔的那一格**；动效只在这一格上演，窗口一关归
   *   `null`。这枚 `×` 跟着指针走、是同一个 DOM 节点 —— 不按格子收窄的话，
   *   点完立刻挪到隔壁格，它会带着类飞过去又弹一次。
   *
   * **不用 React `key` 重挂载来重播**：那样 `<img>` 会有一帧没画出来，身后刚
   * 落下的那枚 `×` 从缝里露一下再被盖回去 —— 玩家以为「放下的 × 浮上来闪了
   * 一下」。换 `animation-name` 不碰元素身份，画面不断。
   */
  const [forbiddenPop, setForbiddenPop] = useState(0);
  const [forbiddenPopCell, setForbiddenPopCell] = useState<string | null>(null);
  const forbiddenPopTimerRef = useRef<number | null>(null);
  /** v0.9.8：正在退场的格子（橡皮点掉它了）；见 `MapGamePlacementLayer` 的 `erasing`。 */
  const [erasing, setErasing] = useState<ReadonlySet<string>>(() => new Set());
  const eraseTimersRef = useRef<Map<string, number>>(new Map());
  /**
   * v0.10.1：刚落子那一圈自动补出来的 `×` —— 格子键 → 入场延迟（毫秒）。
   * 见 `MapGamePlacementLayer` 的 `wave`。
   */
  const [forbiddenWave, setForbiddenWave] = useState<GamePlacementWave>({});
  /** 这一波用哪支动画名；每落一子翻转一次，让同名元素也能重播。 */
  const [forbiddenWaveAlt, setForbiddenWaveAlt] = useState(false);
  const forbiddenWaveTimerRef = useRef<number | null>(null);

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
   * v0.8.7 §4：这一局标记画什么 —— **谜题自己配的 → 主题的缺省 → `×`**。
   *
   * 主题那一份按**这一局的主题编码**查（§19）；`useWorkspace()` 在播放页是 `null`，
   * 所以走的是「主题列表摊成表」那条路，与难度分级同一个 hook 家族。
   * `null` 仍是两边都没有，两个游戏图层退回原来那枚 `×`（放置层黑字、提示层绿字）。
   *
   * v0.9.0 §2：查表的活儿挪进 `source` —— 播放器的包里每一关已经烤好了最终结果
   * （`bundleService` 把主题那张补进了关卡 JSON），所以那边一律返回 `null`。
   */
  const mark = useMemo(
    () =>
      resolveMarkImage(
        detail?.puzzle?.mark,
        source.themeMark(detail?.themeCode),
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

  /**
   * v0.9.2 §2；v0.9.5 起长按计时环与提交校验圈**合并成一张** —— 所以这里只解析
   * 一次，两个图层共用。作者在主题里配了图就画那张，没配就是各自的内置细弧。
   * 只有主题一档：环属于「这个世界的操作手感」，不是某一关的内容。
   */
  const ringImage = useMemo(
    () => resolveRingImage(source.themeRing(detail?.themeCode), source.fileUrl),
    [detail, source],
  );

  /**
   * v0.9.3 §2；v0.9.5 起只剩两档颜色（圈图见上面的 `ringImage`）。主题没配过就是
   * 内置绿 / 红（见 `lib/checkStyle.ts`），所以这里拿到的永远是一份能直接用的样式。
   */
  const checkStyle = useMemo(
    () => resolveCheckColors(source.themeCheckColors(detail?.themeCode)),
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
  /*
   * v0.10.1：竖屏下格子大小只认「按宽度铺满」算出来的那个数 —— 地图样式里写死的
   * cellSize（比如 36）会让 24×24 又变成 864px 宽，把「自适应宽度」抵消掉。
   * 横屏与桌面仍然听样式的（作者配了就用他的）。
   */
  const cellSize = portraitFit ? autoCellSize : effectiveCellSize(autoCellSize, style);
  const total = gridSize * cellSize;

  /*
   * v0.10.0：手机上棋盘只有 236 见方，而「定案」遮罩那套版式（128px 的两个字）
   * 是照桌面 480 起的棋盘定的 —— 不缩就会竖着顶出遮罩、印甩到棋盘外，底下那颗
   * 「再玩一次」也被压住。按棋盘边长等比缩，字、印、偏移的相对位置一点都不变。
   */
  const verdictScale = verdictMarkScale(total);

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
   * v0.9.5：定案卡的「下一关」。
   *
   * 「下一关」＝列表里排在**当前这一关之后、还没通过**的第一关。三件事各自的出处：
   * - 顺序：`source.useCatalog()`（两个入口都是列表页那一份，作者排好的先后说了算）；
   * - 「还没通过」：逐关读本地通过记录（`lib/gameCompletion.ts`）—— 那一关可能是在
   *   别的会话里通过的，内存里没有它的状态可读；
   * - 跳转：`source.gameHref(key)`，两个入口的路由前缀不同，由 source 给。
   *
   * 只算一次、存在 `result.kind === 'passed'` 那一刻的渲染里：清单通常在进页面时
   * 就取到了，`useMemo` 的依赖也只有它和当前这一关。
   */
  const nextLevel = useMemo<GameLevelRef | null>(() => {
    const levels = catalogQuery.data;
    if (!levels || levels.length === 0 || !slug) return null;
    return nextUnfinishedLevel(levels, slug, (level) =>
      Boolean(
        readGameCompletion(source.storageId(level.key), { gridSize: level.gridSize }),
      ),
    );
  }, [catalogQuery.data, slug, source]);

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
    () =>
      resolveHoverEffects({
        /*
         * v0.9.7：**结案后不画任何 hover 效果**。
         *
         * 光靠 CSS `pointer-events-none` 挡不住：定案遮罩自己 `pointer-events-auto`
         * 接住指针之后，事件会沿 React 树冒泡回 `<main>` 的 `onPointerMove`，
         * `setHover` 照样写状态，光标框 / 物品抬起 / 区域高亮就会隔着遮罩亮起来。
         * 这里从源头给 `resolveHoverEffects` 一个 `hover: null`，让三样效果一起
         * 归零 —— 不管冒泡把状态写成什么，画出来的都是 `NO_HOVER_EFFECTS`。
         */
        hover: interactionLocked ? null : hover,
        blockingCells,
        itemCells,
        regions,
      }),
    [hover, interactionLocked, blockingCells, itemCells, regions],
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
    /*
     * v0.10.1：竖屏下棋盘**按宽度铺满**，而不是「宽高取小」。
     *
     * 窄屏上那一簇放大 / 缩小 / 重置已经收掉（见右栏视图簇的 `portrait:` 类），
     * 玩家既没法把棋盘缩小、也没有中键 / 空格去平移 —— 一旦按老算法取「宽高较
     * 小的那个」，24×24 的棋盘会被 32px 的下限撑到 864 宽，屏幕里只看得到左上
     * 一角，剩下的永远够不着。改成以宽度为准、下限放到 8px，整张图就在屏内。
     *
     * 标尺在竖屏下也一起不画：开关都收起来了，还把 28px 的刻度条留着，等于
     * 让玩家为一条关不掉的边付宽度。
     *
     * 量的是 **window** 而不是画布容器 —— 要和 `portrait:max-md:` 那串媒体查询
     * 判同一件事，否则会出现「按钮收起来了、棋盘还按桌面排」。jsdom 里窗口是
     * 1024×768，所以既有用例仍走桌面分支。
     */
    const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
    const viewportHeight = typeof window === 'undefined' ? 0 : window.innerHeight;
    const portrait = isPortraitViewport(viewportWidth, viewportHeight);
    setPortraitFit(portrait);
    /*
     * v0.10.1：竖屏用自己那一套四边留白（左右 8、上下 12），桌面那套
     * （`CANVAS_PADDING + EXTRA_MARGIN` = 每边 40）在 375 宽的屏上等于白扔两列半
     * 格子。上下比左右多 4px：棋盘上边贴着标题、下边贴着题面面板，四面一样宽会
     * 读成「两块拼在一起」；再多给也不成 —— 竖屏一屏就这么高，上下多占的每一
     * 像素都是从下面的线索与名册里扣的。
     */
    const insets = portrait
      ? portraitInsets()
      : canvasInsets({ showRulers, showBottomBar: false, rulerSize: rulerStrip });
    const next = portrait
      ? computeWidthFitCellSize({ width: rect.width, gridSize, insets })
      : computeCellSizeForInsets({ width: rect.width, height: rect.height, gridSize, insets });
    setAutoCellSize((previous) => (previous === next ? previous : next));
    setZoom(1);
    const placed = portrait ? next : effectiveCellSize(next, style);
    setPan(
      portrait
        ? topAlignedPan(rect, insets, gridSize, placed, 1)
        : centeredPan(rect, insets, gridSize, placed, 1),
    );
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
  /**
   * v0.9.5：这一局的水合跑完了吗 —— 计时落盘的那条 effect 靠它挡住「读之前先写」。
   * 见那条 effect 上的注释（这是 v0.7.11 续计时在真浏览器里失效的根因）。
   */
  const [hydrated, setHydrated] = useState(false);

  /**
   * v0.9.6：定案遮罩停完之后弹结算卡的那个定时器。它必须能被打断 ——
   * 玩家在 1 秒内点「再玩一次」或离开时，晚到的弹窗会盖在一个已经重置的棋盘上。
   */
  const verdictTimerRef = useRef<number | null>(null);
  /**
   * v0.9.6：这一版结案遮罩是「刚通过」还是「已完成再进入」。
   *
   * 只用来决定**印章动效**：刚通过时演一次「印下去」，再进入是既成事实不演。
   * 其余表现（定案 + 印 + 再玩一次）两版一样。
   */
  const revisitedRef = useRef(false);
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
    // v0.9.8：表一旦重新走起来，这一局就不再是「已定案」的了。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId]);

  /** 重新计时：清零、清掉本地记录、从这一帧重新走。 */
  const resetTimer = useCallback((): void => {
    elapsedRef.current = 0;
    runningSinceRef.current = Date.now();
    setElapsedMs(0);
    setTimerRunning(true);
    // v0.9.6：只归零用时，保留「最后离开时间」—— 重新开始也算「来玩过」。
    if (storageId) resetGameTimer(storageId, progressMeta);
    // v0.9.8：重开一局，完成时间就该跟着一起清掉（计时与完成时间不共存）。
    if (storageId) clearGameCompletion(storageId);
  }, [storageId, progressMeta]);

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
   *
   * v0.9.5 修：**水合之前不落盘**。
   *
   * 真浏览器里 `gameQuery.data` 是异步来的，所以这一页会先渲染一次「画布还没到」
   * 的形态（`progressMeta.gridSize === 0`），再渲染一次真的。上一次的那条 effect
   * 在依赖变化时会先跑一次清理 —— 那一刻 `elapsedRef` 还是 0，于是 `persist()`
   * 写进一个「0 毫秒」，而 `writeGameTimer` 对 0 的处理是**删键**。它跑在下面那条
   * 水合 effect 之前，删的正是水合要读的那条计时 —— 结果是「关掉页面再回来，
   * 秒表从 00:00 重新开始」，v0.7.11 的续计时在真浏览器里从来没有生效过。
   *
   * jsdom 用例看不出来：那边 `useGameDetail` 的 mock 第一次渲染就有数据。
   *
   * 修法只加一道闸：`hydrated` 为假时这条 effect 直接返回（不挂定时器、也不注册
   * 卸载落盘）。水合跑完才落盘，读与写就不会抢在同一个时刻。
   *
   * 同一道闸顺带挡住 v0.9.5 发现的第二个口子：**换关**。从定案卡点「下一关」跳到
   * 另一关时组件不重建，新一关的数据还在路上（`draft` 为空 ⇒ `gridSize = 0`），
   * 而秒表里留着上一关的累计值。旧版这里会一次一次把「上一关的用时 + 指纹 0」
   * 写进**新一关**的计时键，既串了成绩，留下的还是一条读不回来的垃圾。
   * 现在 `draft` 没到就把 `hydrated` 打回 false，等新一关读完自己的存档再开闸。
   *
   * `gridSize > 0` 是最后一道保险：指纹为 0 的条目 `readGameTimer` 永远读不回来，
   * 写它没有任何意义。
   */
  useEffect(() => {
    if (!storageId || !hydrated || gridSize <= 0) return;
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
  }, [storageId, progressMeta, currentElapsed, hydrated, gridSize]);

  /** 刚放下的字形动效过期清理（`place-pop` 只在这一小段时间里挂着）。 */
  useEffect(
    () => () => {
      for (const timer of pulseTimersRef.current.values()) window.clearTimeout(timer);
      pulseTimersRef.current.clear();
      // v0.9.8：擦除的定时器同理 —— 到点会对着已卸载的组件 setState。
      for (const timer of eraseTimersRef.current.values()) window.clearTimeout(timer);
      eraseTimersRef.current.clear();
      // v0.9.8：落笔令牌的归零定时器同理。
      if (forbiddenPopTimerRef.current !== null) {
        window.clearTimeout(forbiddenPopTimerRef.current);
        forbiddenPopTimerRef.current = null;
      }
      // v0.10.1：水波纹的收尾定时器同理。
      if (forbiddenWaveTimerRef.current !== null) {
        window.clearTimeout(forbiddenWaveTimerRef.current);
        forbiddenWaveTimerRef.current = null;
      }
      // v0.9.6：定案遮罩那颗「停一秒再弹窗」的定时器也要撤 —— 否则离开页面后它
      // 还会对着一个已经卸载的组件 setState。
      if (verdictTimerRef.current !== null) {
        window.clearTimeout(verdictTimerRef.current);
        verdictTimerRef.current = null;
      }
    },
    [],
  );

  /**
   * v0.9.7：结案那一刻把残留的悬停 / 激活 / 放置态收干净。
   *
   * 玩家可能是「鼠标正停在某格上」时通过的；指针被 `pointer-events-none` 挡住
   * 之后，那个格子的操作光标框 / 名册高亮不会自己收到 `pointerleave`，会一直
   * 亮在定案遮罩底下。这里在 `finished` 转真时显式清一次。
   */
  useEffect(() => {
    if (!finished) return;
    setHover(null);
    setHoverPoint(null);
    setLabelRegionId(null);
    setActivation(INACTIVE_ACTIVATION);
    setMode({ kind: 'idle' });
  }, [finished]);

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
    /**
     * v0.9.5：**先关闸，再决定要不要开**。
     *
     * 换关时这一页不重建：`slug` 变了、新一关的数据还没到，`draft` 是空。这个
     * 瞬间必须让计时落盘停下来 —— 否则旧闭包会拿着上一关的累计毫秒去写新一关
     * 的键（`gridSize` 也还是上一关的值，指纹一路对不上）。关闸之后，下面读到
     * 新一关自己的存档那一刻再置真。
     */
    if (!draft) {
      setHydrated(false);
      return;
    }
    const key = `${storageId ?? ''}|${gridSize}|${slots.length}`;
    const firstLoad = hydratedKeyRef.current !== key;
    hydratedKeyRef.current = key;
    if (firstLoad) setHydrated(false);

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
    /**
     * v0.9.6：**已完成再进入 → 定格 00:00**。
     *
     * 用户给的规则：「已完成再次进入，定格 00:00，点再玩一次时再开始计时」。
     * 所以这一局不是「接着上次走」，而是「已经结案了，等你想重玩」。表停着、
     * 数字归零，`replay()` 才把它放回跑道。
     */
    const alreadyDone = Boolean(
      storageId && readGameCompletion(storageId, { gridSize }),
    );
    const startFrom = alreadyDone ? 0 : savedElapsed;
    // 已完成再进入：结案遮罩上要多一颗「再玩一次」、且不播印章动效。
    revisitedRef.current = alreadyDone;
    elapsedRef.current = startFrom;
    runningSinceRef.current = alreadyDone ? null : Date.now();
    setElapsedMs(startFrom);
    setTimerRunning(!alreadyDone);
    setFinished(alreadyDone);
    /**
     * v0.9.5：读完了才允许落盘。这一行必须排在 `readGameProgress` /
     * `readGameTimer` 之后 —— 它一置真，计时那条 effect 立即开始每 5 秒写一次。
     */
    setHydrated(true);
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

  /**
   * v0.9.6：**这一关已经结案** —— 右侧四枚动作按钮全部置灰。
   *
   * 用户：「校验通过后，右侧按钮都置灰不能用」。理由也成立：棋盘已经定格在
   * 结案那一帧，再让玩家摆一颗头像、退一步、提交一次，改的是一局已经结束的
   * 棋；要动就得先点「再玩一次」，那是一个明确的重开动作。
   */
  const toolsLocked = finished;

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

  const handleActivation = (event: LinkageActivationEvent): void => {
    /* v0.9.7：结案后名册不再联动高亮（冒泡可能绕过 pointer-events-none）。 */
    if (interactionLocked) return;
    setActivation((state) => reduceLinkageActivation(state, event));
  };

  /**
   * SPEC-G03 §9.1: clicking a roster card arms that participant for placement
   * **and** runs the preview's click-activation, so the linkage highlights
   * appear exactly as they do on the work preview.
   *
   * The panel speaks **0-based** slot indices, while the placement layer numbers
   * participants from 1 (SPEC-G01 §7.1) — so the mode carries `index + 1`.
   */
  const handleCardClick = (index: number): void => {
    if (interactionLocked) return;
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
   * - 通过 → 定案（结束语 + 再玩一次）；
   * - 未通过 → v0.9.4 给「x/n 正确。未能结案」，不列名单，给
   *   「继续游戏 / 重新开始」。继续游戏会重新走表 —— 玩家要接着想。
   *
   * 提交状态不再落盘、按钮也不再变成勾：那是上一版把「核对过」当成进度的做法，
   * 而进度本来就是棋盘本身。
   *
   * v0.9.3 §2：结论不再立刻弹 —— 先按序号把参与者**逐个圈一遍**，圈完再结算。
   * 判卷结果照旧一次算完（`validatePlacement`），只是分了先后呈现：玩家得看得见
   * 「哪一位被圈成了什么颜色」，否则那几句「位置不对」仍然要自己回去找。
   */
  const submit = (): void => {
    // v0.7.12：按钮已经禁用，这里再做一次守卫 —— 快捷键 / 测试 / 旧闭包都可能绕过。
    // v0.9.3：校验进行中再按也不算 —— 那会让棋盘被圈第二遍。
    if (!readyToSubmit || checkRun) return;
    const elapsed = pauseTimer();
    const board = placementRef.current.board;
    const validation = validatePlacement({ board, slots, nameOf });

    const items = buildCheckItems(board, slots, validation.issues);
    /**
     * v0.9.4 追加：失败卡里的 `x/n 正确`。
     *
     * `x` 就是这一轮会被圈成**绿色**的人数（`buildCheckItems` 用同一份 issues
     * 判 passed），`n` 是名单里真正要找的人数；没落头像的人必然带 `unplaced`
     * issue，所以不会混进 `x`。数字与玩家看见的圈一一对应，不另算一套。
     */
    const correct = items.filter((item) => item.passed).length;
    const total = slots.filter((slot) => slot !== null).length;

    checkRunIdRef.current += 1;
    setCheckRun({ items, revealed: 0, runId: checkRunIdRef.current });
    /**
     * v0.9.5：通过 = **结案**，要落一条记录（用时 + 完成时刻 + 那枚印），列表页
     * 据此盖印并写出完成用时。
     *
     * 写在这里而不是等结算卡出现：读者是「玩家按下了提交、答对了」这一刻，与
     * 弹窗何时弹出无关 —— 玩家关掉页面、中途刷新，结案都不该丢。`recordGameCompletion`
     * 自己保证「首次为准、指纹对不上就不写」，这里不必再判一次。
     *
     * 印的地址取**此刻已经解析好的**那一份（谜题 → 主题 → 内置，见 `lib/toolIcons.ts`）：
     * 列表页拿不到关卡级的工具图标，通过那一刻是唯一一次手里有它的时机。
     *
     * 返回值不往 `result` 里带：结案卡自己**不报成绩**（v0.9.3 §3），用时只写进
     * 记录给列表页读。`completion` 因此只是一个「写完了」的凭据，页面不留它。
     */
    if (validation.passed) {
      recordGameCompletion(
        storageId ?? '',
        { gridSize },
        { elapsedMs: elapsed, stampUrl: toolIcons.submit?.imageUrl ?? null },
      );
    }
    /*
     * 一个参与者的棋盘（理论上不会有）也要有结论 —— 空序列会让定时器那一侧
     * 立刻收尾，所以这里不特殊处理，交给下面那条 effect 的 `revealed >= length`。
     */
    pendingResultRef.current = validation.passed
      ? { kind: 'passed', elapsedMs: elapsed }
      : { kind: 'failed', correct, total };
  };

  /**
   * v0.9.3 §2：逐人推进。
   *
   * 每 `GAME_CHECK_STEP_MS` 揭一位：先把这一位的圈画上，再等下一拍。最后一位
   * 揭完之后再等一拍才落结论 —— 让最末那一圈也扫满，不然它会在半路上被弹窗盖住。
   *
   * v0.9.6：**通过**的那一路不直接弹窗 —— 先把地图方格蒙住、盖上「定案 + 印章」
   * （印章带动效），停 `GAME_VERDICT_HOLD_MS` 让印落定，再弹结算卡。
   * 未通过照旧立刻弹（`x/n 正确` 那张卡没有仪式，玩家要接着改）。
   */
  useEffect(() => {
    if (!checkRun) return;
    const timer = window.setTimeout(() => {
      if (checkRun.revealed < checkRun.items.length) {
        setCheckRun({ ...checkRun, revealed: checkRun.revealed + 1 });
        return;
      }
      const pending = pendingResultRef.current;
      pendingResultRef.current = null;
      if (pending?.kind === 'passed') {
        /*
         * 通过：先撤掉逐人校验的圈与遮罩，换成「定案」那张大遮罩 —— 圈是过程，
         * 定案是结论，两样同时出现会读成「还在校验」。
         */
        setCheckRun(null);
        setFinished(true);
        verdictTimerRef.current = window.setTimeout(() => {
          verdictTimerRef.current = null;
          setResult(pending);
        }, GAME_VERDICT_HOLD_MS);
        return;
      }
      setResult(pending);
    }, GAME_CHECK_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [checkRun]);

  /**
   * v0.7.11：重新开始 / 再玩一次 —— 棋盘、历史、计时一起归零。
   *
   * 「清空历史记录」是字面意义上的：`past` / `future` 都丢掉，所以重开这一局
   * 之后撤销不会把上一局的摆放捞回来。
   *
   * v0.9.6：它同时是「从结案状态回到奔跑状态」的唯一出口 —— 已完成那一版遮罩上
   * 的「再玩一次」也走这里（见 `replay`）。
   */
  const restart = useCallback((): void => {
    const fresh = createGamePlacementState();
    placementRef.current = fresh;
    setPlacementState(fresh);
    setResult(null);
    setCheckRun(null);
    setFinished(false);
    setMode({ kind: 'idle' });
    setActivation(INACTIVE_ACTIVATION);
    setPulse({});
    // v0.9.8：正在退场的格子也一起收 —— 那些 timer 到点会去清一个已经清空的盘。
    for (const timer of eraseTimersRef.current.values()) window.clearTimeout(timer);
    eraseTimersRef.current.clear();
    setErasing(new Set());
    saveProgress(fresh.board);
    resetTimer();
  }, [saveProgress, resetTimer]);

  /**
   * v0.9.6：已完成那一版遮罩上的「再玩一次」。
   *
   * 与 `restart` 的差别只有一处：**先撤掉定案遮罩再重置**。清盘之后再撤遮罩会让
   * 玩家看见一帧空棋盘顶着「定案」，像结算卡还没收干净。
   */
  const replay = (): void => {
    setFinished(false);
    // 下一局若再通过，是新的一次「刚盖上去」—— 动效要重新播。
    revisitedRef.current = false;
    restart();
  };

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
    // v0.9.3 §2：棋盘上那几圈结论跟着弹窗一起撤 —— 留着会读成「还在结算中」。
    setCheckRun(null);
  };

  /** 未通过时「继续游戏」：关上弹窗，接着走表、接着摆。 */
  const continueGame = (): void => {
    setResult(null);
    setCheckRun(null);
    resumeTimer();
  };

  /**
   * v0.7.11：给刚放下的编号挂一次「盖章」动效。
   *
   * 用一张「格子键 → 参与者编号」的表而不是单个「最后一格」：按住滑动会连着
   * 放好几格，单值会让前一格的字形在动画播到一半时被摘掉类，缩放猛地弹回原样。
   * 每一格 400ms 后自己过期（动画只有 180ms），表不会越积越大。
   *
   * v0.9.8：`×` 不再走这里 —— 见 `dispatchCell` 的 forbidden 分支。
   */
  const markPulse = (key: string, participantId: number): void => {
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
   * v0.9.8：让悬停的那枚 `×` 弹一次 —— 令牌 +1，并把动效**钉在刚落笔的那一格**。
   *
   * `GAME_PLACE_PULSE_MS`（400ms）之后两样一起收：令牌留着不动（它是 `key` 的
   * 替代品，改回去也算一次变化），`popCell` 归 `null` —— 窗口一关，指针再进来
   * 就只是静止的一枚 `×`。
   *
   * 为什么要 `popCell`：这枚 `×` 跟着指针走，是**同一个** DOM 节点。只告诉它
   * 「现在该弹」，玩家点完立刻挪到隔壁格，它就带着类飞过去、在新格子上又弹一次。
   */
  const pulseForbiddenHint = (key: string): void => {
    setForbiddenPop((previous) => previous + 1);
    setForbiddenPopCell(key);
    if (forbiddenPopTimerRef.current !== null) {
      window.clearTimeout(forbiddenPopTimerRef.current);
    }
    forbiddenPopTimerRef.current = window.setTimeout(() => {
      forbiddenPopTimerRef.current = null;
      setForbiddenPopCell(null);
    }, GAME_PLACE_PULSE_MS);
  };

  /**
   * v0.10.1：落子之后，让这一手补出来的 `×` 一圈一圈地浮出来。
   *
   * `plan` 是 `autoForbiddenWavePlan` 算好的「格子键 → 距落子格几圈」。这里把圈号
   * 换算成延迟写进 `forbiddenWave`，放置层照延迟给每枚 `×` 挂入场动画 —— 于是
   * 距落子格 1 圈的先生，2 圈的晚 45ms，依此类推，看起来就是一圈水波推出去。
   *
   * 两支动画名交替（`forbiddenWaveAlt`）：连落两位时，第二波如果沿用同名，
   * 已经在演的元素不会重头播；换 `key` 又会丢一帧。换 `animation-name` 两头都躲开。
   */
  const pulseForbiddenWave = (plan: Array<{ key: string; ring: number }>): void => {
    if (plan.length === 0) return;
    const next: Record<string, number> = {};
    for (const cell of plan) next[cell.key] = cell.ring * GAME_FORBIDDEN_WAVE_STEP_MS;
    setForbiddenWave(next);
    setForbiddenWaveAlt((previous) => !previous);
    if (forbiddenWaveTimerRef.current !== null) {
      window.clearTimeout(forbiddenWaveTimerRef.current);
    }
    forbiddenWaveTimerRef.current = window.setTimeout(() => {
      forbiddenWaveTimerRef.current = null;
      setForbiddenWave({});
    }, GAME_FORBIDDEN_WAVE_MS);
  };

  /**
   * v0.9.8：橡皮点掉一格 —— **先演退场，再删**。
   *
   * 直接 `clearCell` 的话，格子上的东西是瞬间消失的：玩家只看到画面重绘了一次，
   * 分不清刚擦掉的是哪一格，按住滑过一片时更是完全跟不上。这里先把格子记进
   * `erasing`（放置层据此挂 `erase-out`：缩小 + 淡出），动画放完才真的删。
   *
   * 每一格各记各的 timer：按住滑过好几格时，几段退场应当并排演，而不是后一格
   * 把前一格的定时器顶掉 —— 那会让前一格永远停在半透明状态。
   */
  const eraseCell = (x: number, y: number): void => {
    const key = cellKey(x, y);
    const timers = eraseTimersRef.current;
    // 已经在退场：这一格不再重启动画，否则按住来回蹭会把动画一直按在第一帧。
    if (timers.has(key)) return;
    setErasing((previous) => {
      if (previous.has(key)) return previous;
      const next = new Set(previous);
      next.add(key);
      return next;
    });
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key);
        setErasing((previous) => {
          if (!previous.has(key)) return previous;
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        updatePlacement((state) => clearCell(state, { x, y }));
      }, GAME_ERASE_MS),
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
   * - 返回**是否真的执行了**：长按的进度环靠它决定收场 —— 环画满却什么都没发生，
   *   会读成「按成功了但没反应」，比不画环更糟。
   *
   * v0.9.1 §4：放置被拒一律**静默** —— 不再弹吐司。原先唯一还会说话的是
   * 「该格编号已满」，但它和之前删掉的几条一样属于噪音：格子上的编号已经写满
   * 九个，玩家看得见；再弹一句只是挡住棋盘。`quiet`（滑动时压掉提示）因此也
   * 一并退场，拒绝路径只剩 `return false`。
   */
  const dispatchCell = (x: number, y: number, variant: ParticipantPlacementVariant): boolean => {
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
      if (block) return false;
      /**
       * v0.10.1：落头像（长按 / 拖动确认）之后，同行同列补出来的 `×` 按圈依次
       * 浮出来，像水波从落点推出去。
       *
       * 计划必须在**落子之前**算：`placeParticipant` 只回一个状态，说不出「这一手
       * 新添了哪几格」，而波纹要的是按圈排好的次序。先用同一份输入算一遍，落盘时
       * 走的是同一个 `autoForbiddenCells`，两者不会跑偏。
       */
      const wavePlan = autoForbiddenWavePlan({
        board,
        x,
        y,
        gridSize,
        blockingCells,
        variant,
      });
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
      if (wavePlan) pulseForbiddenWave(wavePlan);
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
      // v0.7.12：放不进去（不可站立 / 头像格）时什么都不做 —— 那一格本来就没有
      // `×` 可放。
      if (!canPlaceForbidden({ board: placementRef.current.board, x, y, blockingCells })) {
        return false;
      }
      // v0.9.8：放下的 `×` 静默出现，不再挂 `markPulse` —— 演入场动效的是跟着
      // 指针悬停的那一枚（`MapGameToolHintLayer`），放置本身没有可看的动作。
      //
      // 而且是**落笔这一刻、在这一格**才演：提示层按 `forbiddenPop` 换动画名，
      // 并只在自己正停在 `popCell` 时挂类 —— 指针只是移动不该有动效。
      updatePlacement((state) => placeForbidden(state, { x, y, blockingCells }));
      pulseForbiddenHint(cellKey(x, y));
      return true;
    }
    if (mode.kind === 'clearing') {
      const key = cellKey(x, y);
      // 空格上什么都不会发生 —— 连动效都不该有，那一格本来就没东西可擦。
      if (!placementRef.current.board[key]) return false;
      eraseCell(x, y);
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
     * v0.9.1 §4：短按（编号）现在同样静默 —— 放置被拒一律不弹提示，于是两类
     * 手势在「放不进去」这件事上的反馈完全一致：环不画、话不说、棋盘不动。
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
      // v0.9.1 §4：不再弹「已清空全部放置」—— 棋盘当场变空本身就是反馈。
      setClearPress(null);
      applyMode({ kind: 'clearing' });
      updatePlacement(clearAll);
      // v0.9.2 §3：清空是「整盘抹掉」，比棋格的 500ms 更长（800ms）——
      // 两者后果不是一个量级，触发阈值也不该一样轻。
    }, GAME_CLEAR_LONG_PRESS_MS);
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
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* 左列：上 = 品牌 + 游戏名（v0.5.1 SPEC-L06~L09 精简后的两行），
            中 = 题面（描述 + 全局线索），下 = 参与者面板（与预览页同一个组件）。

            v0.7.14：这三段之间**不画线**。它们读起来是同一段话的段落 —— 哪一局、
            要做什么、多出什么条件、这些人怎么站；一条横线会把「条件」和「人」切成
            两个互不相干的区域，而线索说的正是这些人。
            （原本标题区有 `border-b`，那条线正好压在参与者框头顶。） */}
        <aside
          className={cn(
            'relative flex shrink-0 flex-col border-r bg-background',
            /*
             * v0.10.1 竖屏：左栏**不再是一栏**，而是把它的孩子直接摊到外层那一列
             * 上（`display: contents`）—— 于是「头部留在最上面」「题面 + 名册落到
             * 地图下面、工具栏上面」只靠 `order` 就能排出来，DOM 一个节点都不用搬。
             *
             * 为什么不真的搬 DOM：右栏必须仍是 `querySelectorAll('aside')` 的最后
             * 一个，左栏必须仍是第一个且 `style.width` 是那一串像素（既有用例钉着）；
             * 再者 `ParticipantPanel` 与编辑器共用，结构越少动越好。
             */
            'max-md:contents',
            /* v0.9.7：结案后名册 / 题面不再接指针（见 interactionLocked）。 */
            interactionLocked && 'pointer-events-none',
          )}
          style={{ width: rosterWidth }}
        >
          {/*
            * v0.9.4：左栏自己一层完整遮罩。它是独立的 `relative` 容器，
            * 不需要和地图区共用全屏遮罩，也不需要挖洞。遮罩接指针 —— 核对期间
            * 名册 / 题面 / 主题开关都不该还能点。
            *
            * v0.9.4（追加）：`-right-px` 让这一层越过左栏自己的右边框 ——
            * 那条边框正是「左栏 / 中列」的分隔线，`inset-0` 只盖到内边距盒、
            * 盖不到边框，于是分隔线会比四周更亮地留在那里。越过 1px 之后它与
            * 中列遮罩（同档同色）在这条线上交叠，分隔线一起被压暗。
            */}
          {checkRun && !result && !finished ? (
            <CheckScrim
              area="left"
              /*
               * v0.10.1 竖屏：左栏是 `display: contents`，没有自己的盒子，
               * 这一层 `absolute` 找不到可依附的位置 —— 竖屏不画它（桌面端照旧）。
               * 结案锁指针不受影响：`pointer-events: none` 照常从 `<aside>` 继承
               * 给它的孩子们，标题块自己的 `pointer-events-auto` 也照常豁免。
               */
              className="absolute inset-y-0 left-0 -right-px max-md:hidden"
              style={{ zIndex: UI_Z.saveMask }}
            />
          ) : null}
          {/*
            * v0.9.7：结案后名册 / 题面不再接指针；**但这一行是例外** ——
            * 用户明确「定案游戏里，可以点击返回和切换日夜模式」。
            * 父层 `pointer-events-none` 之下，子元素用 `pointer-events-auto` 显式
            * 恢复（CSS 允许），于是返回箭头与主题开关照常可点，下面的题面、
            * 名册仍然锁着。
            */}
          <div
            className={cn(
              'shrink-0 p-3',
              /*
               * v0.10.1 竖屏：头部收成**一行** —— 返回、游戏标题、计时排队，主题
               * 开关推到最右。桌面仍是「品牌一行、标题一行」两行。
               *
               * 实现上没另起一套 DOM：第一行容器在竖屏是 `display: contents`，
               * 它的孩子（返回按钮、主题开关）直接成为这一行 flex 的成员，再用
               * `order` 把顺序拨成「返回 → 标题 → 计时 → 主题」。品牌 logo 在竖屏
               * 藏起来 —— 一行里再塞个 logo，标题就没地方了。
               */
              'max-md:flex max-md:items-center max-md:gap-2 max-md:order-1 max-md:py-2',
              'md:space-y-1',
              interactionLocked && 'pointer-events-auto',
            )}
          >
            {/* FEAT-L07: 返回箭头后是品牌名，游戏名放下一行。
                v0.5.3 FEAT-N03 (§2): the brand name is the logo itself. */}
            <div className="flex items-center gap-1 max-md:contents">
              <IconButton
                variant="ghost"
                icon={<ArrowLeft className="h-4 w-4" />}
                label="返回游戏列表"
                side="right"
                className={cn(TOOLBAR_ICON_HOVER_CLASS, 'max-md:order-1 max-md:shrink-0')}
                onClick={() => navigate(source.listHref())}
              />
              <BrandLogo height={16} className="flex shrink-0 items-center gap-2 max-md:hidden" />
              {/*
                v0.10.1 竖屏：描述从面板里挪到右上角这枚图标后面（点开是弹框）。
                面板那时只剩线索与名册，能多让出一段高度。没有描述就不挂按钮 ——
                点开一张空卡的图标比没有更糟。
              */}
              {portraitFit && puzzleDescription.trim().length > 0 ? (
                <IconButton
                  variant="ghost"
                  icon={<FileText className="h-4 w-4" />}
                  label="谜题描述"
                  side="bottom"
                  className={cn(TOOLBAR_ICON_HOVER_CLASS, 'max-md:order-4 max-md:shrink-0')}
                  onClick={() => setDescriptionOpen(true)}
                />
              ) : null}
              {/* v0.5.7: 玩家端没有 AppShell 头部，主题开关挂在左栏这一行右侧。 */}
              <ThemeToggle className="ml-auto max-md:order-5 max-md:shrink-0" />
            </div>
            {/*
              * v0.7.12：计时挪到标题行最右边 —— 它是「这一局」的元信息，与名字、
              * 尺寸同一行；放在右栏底部被步数挤着，反而像第三条统计。不要图标，
              * 只留粗体淡色的 `mm:ss`。
              */}
            <div className="flex items-baseline gap-2 pl-1 max-md:order-2 max-md:min-w-0 max-md:flex-1 max-md:items-center max-md:pl-0">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={game.name}>
                {game.name} {gridSize}x{gridSize}
              </p>
              <span
                data-testid="game-timer"
                className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground max-md:order-3"
                title="本局用时（提交后停止）"
              >
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          </div>

          {/*
            v0.7.14：题面 + 名册。桌面端钉在左栏、永远展开。

            v0.10.0：窄屏上一度装进可开合抽屉（`briefOpen`）。

            v0.10.1：不再折叠。窄屏上它落到「地图下面、工具栏上面」（`order-3`），
            并吃掉棋盘定高之后剩下的**全部**高度（`flex-1` + `min-h-0`），内部整块可滚
            —— 手机上一屏只够一件事，棋盘按宽度定死之后，多出来的高度就该给线索与
            名册，而不是在棋盘下面留一片空白。
          */}
          <div
            className={cn(
              'min-h-0 flex-1 flex-col md:flex',
              /*
               * v0.10.1 竖屏：不折叠、吃掉剩余高度、整块可滚。
               * `order-3` 让它排在棋盘（`order-2`）之后、工具栏（`order-4`）之前。
               *
               * 竖屏与「横过来的手机」要分开：竖屏棋盘按宽度定死了高，剩下的高度
               * 全给这块（`flex-1`）；横屏那台还是老样子 —— 棋盘占大头，这块限高
               * `38svh` 不参与分配。两者都用 `flex-1` 的话，横屏 360 高会被棋盘和
               * 这块平分，名册直接压成一条缝。
               */
              'max-md:order-3 max-md:flex max-md:overflow-y-auto max-md:border-t',
              portraitFit ? 'max-md:flex-1' : 'max-md:max-h-[38svh] max-md:flex-none',
            )}
          >
            {/*
              v0.7.14（docs/v0.7.14.md §4）：题面。描述在上、全局线索在下，钉在标题
              与名册之间 —— 三样东西同时在视野里，谁也不用滚动去换另一个。
              没有内容时组件自己返回 `null`，所以这里不必先判空。
            */}
            <GameBrief
              description={puzzleDescription}
              clues={puzzleClues}
              hideDescription={portraitFit}
            />

            <div
              className={cn(
                'flex min-h-0 flex-1',
                // v0.10.1 竖屏：名册这时横躺成一整条，宽度交给屏宽，不再横向滚动。
                'max-md:overflow-x-auto',
                /*
                 * v0.10.2 竖屏：这一层不再参与高度分配，按内容自己的高走。
                 *
                 * 上面的「题面 + 名册」容器是**唯一**滚动区（全局线索要跟着名册
                 * 一起滚）。这里若继续 `flex-1`，它会被压成容器剩下的那点高，
                 * 名册内部又已经放开滚动（`overflow-visible`），多出来的卡片只能
                 * 溢出去 —— 滚动条在祖先上，但高度分配没给内容留位置。改成
                 * `flex-none` 之后，容器的可滚高度 = 线索 + 全部卡片。
                 *
                 * `overflow-x-auto` 也得让位：只要有一个轴是 `auto`，另一轴就会被
                 * 浏览器算成 `auto`，这一层于是又成了第二个（虽然滚不动的）滚动
                 * 容器，触屏滑动可能被它吃掉。竖屏名册是 `minmax(0, 1fr)` 的弹性
                 * 轨道，本来就不横向溢出。
                 */
                portraitFit && 'max-md:flex-none portrait:max-md:overflow-visible',
              )}
            >
              <ParticipantPanel
                slots={slots}
                charactersById={charactersById}
                cols={rosterCols}
                /*
                 * v0.10.1 竖屏：名册换一套卡片 —— 每行固定 2 张、卡片横过来
                 * （左头像、右上名称、右下线索）。只有竖屏窄屏才换，桌面端与
                 * 编辑器、作品预览那两处调用都维持原样。
                 */
                compactPortrait={portraitFit}
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
          </div>
        </aside>

        {/* 中列：与预览页一致的地图 + 两个游戏图层 */}
        <main
          ref={containerRef}
          className={cn(
            'relative min-h-0 flex-1 select-none overflow-hidden bg-muted/30',
            /* v0.10.1 竖屏：左栏 `display: contents` 后，头 / 棋盘 / 面板 / 工具栏
               成了同一个 flex 列里的四个兄弟，靠 `order` 排：头 1、棋盘 2（就是
               这里）、题面名册 3、工具栏 4。桌面端 `order` 不参与，三栏照旧。 */
            'max-md:order-2',
            /* v0.10.1 竖屏：棋盘的高度已经由「格数 × 格子」定死了，不再 `flex-1`
               吃掉剩下的全部高度 —— 剩下的要留给下面的线索与名册。 */
            portraitFit && 'max-md:flex-none',
            // v0.9.3 §2：核对期间棋盘只读 —— 圈到一半还能落子就说不清在核对什么。
            checkRun && 'pointer-events-none',
            // v0.9.7：结案后地图 / 物品 / 格子的指针交互全停（遮罩接管这一屏）。
            interactionLocked && 'pointer-events-none',
          )}
          style={{
            // v0.6.2：按住空格 / 中键时是抓手，格内放东西是 pointer，其余普通光标。
            cursor: spaceHeld ? 'grab' : hoverEffects.cell ? 'pointer' : 'default',
            touchAction: 'none',
            /* v0.10.1 竖屏：高度正好是棋盘 + 上下各 `PORTRAIT_MARGIN_Y`。
               桌面端不给这个值，仍旧由 flex 分配。 */
            height: portraitFit ? portraitStageHeight(gridSize, cellSize) : undefined,
          }}
          onPointerDown={(event) => {
            /*
             * v0.9.7：结案后所有指针动作从入口短路。CSS `pointer-events-none`
             * 挡的是 hit-testing，遮罩 `pointer-events-auto` 接住的事件仍会冒泡
             * 到这里；不守住这一层，格子还是会被落笔。
             */
            if (interactionLocked) return;
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
            if (interactionLocked) return;
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
              dispatchCell(paint.start.x, paint.start.y, 'number');
            }
            paint.lastKey = key;
            dispatchCell(cell.x, cell.y, 'number');
          }}
          onPointerUp={(event) => {
            if (interactionLocked) return;
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
                dispatchCell(paint.start.x, paint.start.y, 'number');
                dispatchCell(cell.x, cell.y, 'number');
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
            if (interactionLocked) return;
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
            if (interactionLocked) return;
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
          {/* v0.9.4：中列整层遮罩 —— 铺满地图区，压住标尺条带与画布四周留白；
            它低于画布纸（纸在校验时抬到 saveMask+1），所以棋盘照常明亮。
            只在校验进行中、结算弹窗未出时存在，与左右两栏同色同档。 */}
          {checkRun && !result && !finished ? (
            <CheckScrim
              area="center"
              className="pointer-events-none absolute inset-0"
              style={{ zIndex: UI_Z.saveMask }}
            />
          ) : null}

          <div
            data-testid="game-canvas"
            className="absolute left-0 top-0"
            style={{
              // v0.9.4：校验期间把这张纸抬到遮罩之上（saveMask+1），于是中列那层
              // 铺满地图区的遮罩只压暗标尺与留白、压不到棋盘；正常游戏时这层不挂，
              // 不影响标尺压在纸边之上的默认层级。
              zIndex: checkRun && !result && !finished ? UI_Z.saveMask + 1 : undefined,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              width: total,
              height: total,
            }}
          >
            {/*
              v0.8.7 §6：这张纸的投影 —— 外框色压一层透明度，向右下偏 6px 的硬影。

              v0.10.1 竖屏：**不画投影**。棋盘这时是按屏宽铺满的，纸比视口宽不了
              多少，右下那圈硬影只会从格子缝里露出来当脏边；桌面那套投影说的是
              「一张纸摆在桌上」，铺满屏的纸本来就没有「桌」。
            */}
            <div
              className="absolute left-0 top-0 bg-background"
              style={{
                width: total,
                height: total,
                zIndex: MAP_LAYER_Z.canvasBase,
                ...(portraitFit ? null : canvasShadowStyle(style)),
              }}
            >
              {/*
                * v0.9.4：地图区的完整遮罩**就在画布底色层里**。
                *
                * 父层 z-index = canvasBase(10)，其余内容层最小是 backgroundLayer(20)，
                * 所以这一层只压暗「纸的底色」；铺了背景图 / 物品 / 头像 / 校验圈的
                * 格子照常亮。不用量矩形、不用挖洞，缩放平移时它跟着纸一起走。
                */}
              {checkRun && !result && !finished ? (
                <CheckScrim area="canvas" className="pointer-events-none absolute inset-0" />
              ) : null}
            </div>

            {/* 《画布图层优先级规范》§2 — bottom-up, pinned by MAP_LAYER_Z.
                SPEC-G01: the game page drops 操作光标框 and adds the two
                game-only layers above 区域标签. */}
            {/*
              v0.9.6：**定案遮罩** —— 校验通过（或这一关早就完成了）时，地图方格
              被整片蒙住，上面盖「定案 + 印章」。

              为什么挂在画布纸里而不是当成第五处独立遮罩：用户要的是「把地图方格用
              遮罩遮住，上面展示定案+印章（位置和谜题卡片一样）」。位置与卡片一致，
              意味着它得跟着纸走 —— 挂在 `game-canvas` 里就自动随缩放/平移，不必
              再量一次矩形。它压在内容层之上（`zIndex` 取最高的鼠标框 +1），所以
              格子、物品、头像都被蒙住。

              左右两栏**不遮**（用户明确：已完成的再进入只留地图方格遮罩）；校验
              通过那一瞬的左右遮罩由 `checkRun` 那条路径撤掉 —— 见提交的 effect。
            */}
            {finished ? (
              <div
                data-testid="verdict-scrim"
                /* v0.9.7：与四处校验遮罩、弹窗 overlay 同一档「一般遮罩颜色」
                   （`DIALOG_OVERLAY_TINT_CLASS` = bg-black/60）。v0.9.6 用的是
                   bg-background/85，浅色系、过实，读起来像另一套东西。 */
                className={cn(
                  DIALOG_OVERLAY_TINT_CLASS,
                  /*
                   * v0.9.7：遮罩自己接住指针 —— 中列容器已经 `pointer-events-none`，
                   * 这里显式恢复，免得指针穿到下面的格子上去。按钮仍带
                   * `pointer-events-auto`，是这一屏唯一能点的东西。
                   */
                  'pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-6',
                )}
                style={{ zIndex: MAP_LAYER_Z.mouseCursorBox + 1 }}
              >
                <VerdictMark
                  stampUrl={toolIcons.submit?.imageUrl ?? null}
                  /* 棋盘比 291px 的卡大得多，但排法与卡片完全一致。 */
                  large
                  /* 深色遮罩上用浅色文字；印章保持作者上传的原色（v0.9.7 第六批）。 */
                  onDark
                  /*
                   * v0.9.8：印章在**游戏内**再往右上让开一段（右 150px、上 50px）。
                   * 遮罩上的印与卡片上的印本来就同款，但这一屏的「定案」字大得多，
                   * 印压得太正会糊住字心 —— 让它偏出去，像盖在纸的角落。
                   */
                  stampOffset={{ x: 150, y: -50 }}
                  /*
                   * v0.10.0：手机上的棋盘小得多，这一整套（字、印、让开的偏移）
                   * 跟着棋盘等比缩，否则会顶出遮罩。桌面棋盘够大时恒为 1。
                   */
                  scale={verdictScale}
                  /*
                   * 刚通过时演一次「印下去」；已完成再进入是既成事实，不演。
                   * 判据只看「是不是这次进来的」，不看 result —— 结算卡弹出后遮罩还
                   * 在（它才是背景），动画类不该因为弹窗出现就被摘掉。
                   */
                  animate={!revisitedRef.current}
                />
                {/*
                  * v0.9.6：**没有结算卡开着时**，遮罩上必须有「再玩一次」——
                  * 这是这一局唯一能回到奔跑状态的出口。刚通过 + 结算卡还开着时
                  * 不画（卡里已经有同一颗按钮，两处各一颗是同一件事说两遍）；
                  * 关掉弹窗之后就补上，否则按钮全灰、遮罩盖着，玩家会卡在结案页。
                  */}
                {!result ? (
                  <Button
                    data-testid="verdict-replay"
                    onClick={replay}
                    className="pointer-events-auto"
                  >
                    再玩一次
                  </Button>
                ) : null}
              </div>
            ) : null}

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
              // v0.9.1 §5：物品描边（宽度 0 = 不描边）。
              itemOutline={style.itemOutline}
              padding={itemPadding(cellSize)}
              /* v0.9.7：结案后不给物品层任何悬停 / 指针坐标，物品不会隔着遮罩抬起。 */
              hover={interactionLocked ? null : hover}
              pointer={interactionLocked ? null : hoverPoint}
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
              mark={mark}
              // v0.9.1 §3：清除工具配了图，指针底下就画同一张（与按钮一致）。
              clearIcon={toolIcons.clear ?? null}
              /* v0.9.8：落笔令牌与落笔格 —— 只有点下去那一刻、那一格的 `×` 才弹。 */
              pop={forbiddenPop}
              popCell={forbiddenPopCell}
            />

            {/* v0.7.11：长按进度环 —— 按住 500ms 的等待可见化（SPEC-J02）。
                环延迟 160ms 才挂载，所以只画剩下的 340ms。 */}
            <MapGamePressRing
              cell={pressCell}
              cellSize={cellSize}
              durationMs={GAME_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS}
              seq={pressCell?.seq ?? 0}
              imageUrl={ringImage}
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
              /* v0.7.11：刚放下的编号各「盖章」一次。 */
              pulse={pulse}
              /* v0.9.8：橡皮点掉的格子先演退场，动效放完才真删。 */
              erasing={erasing}
              /* v0.10.1：落子补出来的 `×` 按圈错峰浮出，像水波从落点推出去。 */
              wave={forbiddenWave}
              waveAlt={forbiddenWaveAlt}
              /* v0.8.6：配置了图片时，放下的标记画那张图而不是 `×`。 */
              mark={mark}
            />

            {/*
              * v0.9.3 §2：提交后逐人校验的圈。按序号一位一位揭开，颜色取主题的
              * 「通过 / 未通过」两档；圈留在棋盘上，直到结算弹窗被关掉。
              */}
            {checkRun ? (
              <MapGameCheckLayer
                marks={checkRun.items.slice(0, checkRun.revealed)}
                cellSize={cellSize}
                passColor={checkStyle.passColor}
                failColor={checkStyle.failColor}
                ringUrl={ringImage}
                sweepMs={GAME_CHECK_RING_SWEEP_MS}
                runId={checkRun.runId}
              />
            ) : null}

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

          {showRulers && !portraitFit ? (
            <MapRulerStrips
              gridSize={gridSize}
              cellSize={cellSize}
              zoom={zoom}
              pan={pan}
              total={total}
              style={style}
              hover={interactionLocked ? null : hover}
            />
          ) : null}
        </main>

        {/* 右列：工具栏（SPEC-G04） */}
        <aside
          className={cn(
            'relative flex shrink-0 flex-col items-center gap-2 border-l bg-background p-2',
            /* v0.10.0：窄屏上这一栏从「右侧竖条」变成「底部横条」—— 竖条写死的
               84px 在竖屏手机上正好吃掉棋盘最宝贵的一条宽度；横条沉到底部，
               四枚工具 + 视图簇按行折行。 */
            'max-md:w-full max-md:max-w-full max-md:flex-row max-md:flex-wrap max-md:justify-center max-md:gap-1 max-md:border-l-0 max-md:border-t max-md:py-1.5 portrait:max-md:h-[54px] portrait:max-md:py-0',
            /* v0.10.1 竖屏：排到最末（`order-4`），跟题面名册（`order-3`）一起
               落在棋盘下面。 */
            'max-md:order-4',
          )}
        >
          {/* v0.9.4：右栏自己一层完整遮罩 —— 与左栏同一层颜色、同一档层级。
              `-left-px` 越过右栏自己的左边框，把「中列 / 右栏」那条分隔线也压暗
              （理由同左栏，见上方注释）。 */}
          {checkRun && !result && !finished ? (
            <CheckScrim
              area="right"
              className="absolute inset-y-0 -left-px right-0"
              style={{ zIndex: UI_Z.saveMask }}
            />
          ) : null}
          <Button
            variant="ghost"
            className={cn(
              'h-12 w-full',
              /*
               * v0.10.1 竖屏：图标 2rem、底栏 54 高之后，44px 的方钮装不下了。
               * 底栏改成四枚等宽的长方形 —— 一排放得下、也不必有正方形那套对称。
               */
              'max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:shrink max-md:px-0 portrait:max-md:h-full',
              mode.kind === 'forbidden' ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
            )}
            title="标记"
            disabled={toolsLocked}
            onClick={() => toggleTool('forbidden')}
          >
            {/*
              v0.8.6：这条谜题给标记配了图，工具按钮就画**同一张图** ——
              按钮上是什么，落下去就是什么（v0.6.4 给编号立下的规矩，v0.8.6 已用
              在工具提示层）。没配时才退回那枚红色 `×` 字形。

              深色界面要翻一次：这些图多半是「深墨画在透明底上」（作者是按浅色的
              地图纸挑的），直接放在 `bg-background` 上等于没有。`invert` 把明度
              翻过来，`hue-rotate-180` 再把色相转回去 —— 只用 `invert` 的话，一枚
              红印在深色下会变成青色。
            */}
            {mark ? (
              <img
                src={mark.imageUrl}
                alt=""
                draggable={false}
                data-testid="forbidden-tool-icon"
                /* v0.9.0 §17：与下面三枚内置图标同一档 32px（2rem）。 */
                className="h-8 w-8 select-none object-contain dark:invert dark:hue-rotate-180"
              />
            ) : (
              <X className="h-8 w-8 text-destructive" />
            )}
          </Button>
          <Button
            variant="ghost"
            className={cn(
              'relative h-12 w-full',
              /* v0.10.1 竖屏：同上面那枚标记键 —— 图标 2rem，按钮长到 54 高、四枚等分。 */
              'max-md:w-auto max-md:min-w-0 max-md:flex-1 max-md:px-0 portrait:max-md:h-full',
              mode.kind === 'clearing' ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS,
            )}
            title="清除放置，长按清空全部"
            disabled={toolsLocked}
            onPointerDown={startClearPress}
            onPointerUp={endClearPress}
            onPointerLeave={endClearPress}
          >
            {/*
             * v0.9.2 §3：长按 800ms 清空全部 —— 进度画在**按钮方块之内**，
             * 一个从 12 点开始扫的扇形，不再是棋格那圈细环。48px 的方块里
             * 已经有 32px 的图标，环套上去会和图标抢地方。
             *
             * 时长必须跟着 `GAME_CLEAR_LONG_PRESS_MS` 走（不是棋格那个 500）：
             * 扫满的那一帧就是清空发生的那一帧，各写一个数就会出现
             * 「扫满了还没清」或者「清完了还在扫」。
             *
             * 顺序要紧：扇形是绝对定位的，会盖在普通流内容之上；图标包一层
             * `relative` 才是「填色在图标后面」这一层关系。
             */}
            {clearPress !== null ? (
              <PressSweep
                durationMs={GAME_CLEAR_LONG_PRESS_MS - GAME_PRESS_RING_DELAY_MS}
                seq={`clear-${clearPress}`}
              />
            ) : null}
            <span className="relative">
              <GameToolIcon render={toolIcons.clear} name="clear" />
            </span>
          </Button>
          {/*
            * v0.9.1 §1：不可回退时按钮 `disabled`，而基类的
            * `disabled:pointer-events-none` 会让它接不到 hover —— 光标与提示一起失效。
            * 外面包一层 span 接住指针（禁用的按钮不挡事件），由 span 出
            * `cursor-not-allowed` 与那句「为什么不能点」的提示。
            */}
          <span
            className={cn(
              'block w-full',
              /* v0.10.1 竖屏：底栏四枚等分，包层跟着一起撑开。`w-auto` 不能少 ——
                 `w-full` 会把 flex 基准算成整条栏宽，四枚就分不匀。 */
              'max-md:w-auto max-md:min-w-0 max-md:flex-1 portrait:max-md:h-full',
              (!canUndo(placementState) || toolsLocked) && 'cursor-not-allowed',
            )}
            title={
              toolsLocked
                ? '这一局已结案，点「再玩一次」才能继续'
                : canUndo(placementState)
                  ? undefined
                  : '当前没有可以回退的步骤'
            }
          >
            <Button
              variant="ghost"
              className={cn(
                'h-12 w-full',
                /* v0.10.1 竖屏：底栏四枚等分的长方形，高度 54 容得下 2rem 的图标。 */
                'max-md:px-0 portrait:max-md:h-full',
                TOOLBAR_ICON_HOVER_CLASS,
              )}
              title={
                toolsLocked
                  ? '这一局已结案，点「再玩一次」才能继续'
                  : canUndo(placementState)
                    ? '回退上一步'
                    : '当前没有可以回退的步骤'
              }
              disabled={!canUndo(placementState) || toolsLocked}
              onClick={() => updatePlacement(undo)}
            >
              <GameToolIcon render={toolIcons.undo} name="undo" />
            </Button>
          </span>
          {/*
            * v0.7.11：提交按钮不再变成勾 —— 提交是一次**结算**，不是一个要记住
            * 的状态。勾只会在下一次进来时变成一句谎话（玩家看到自己没做过的勾）。
            * v0.7.12：没放完不能提交（编号不算放置）。
            * v0.9.1 §1：没放完时同样包一层 span，给禁用光标和提示。
            */}
          <span
            className={cn(
              'block w-full',
              'max-md:w-auto max-md:min-w-0 max-md:flex-1 portrait:max-md:h-full',
              (!readyToSubmit || toolsLocked) && 'cursor-not-allowed',
            )}
            title={
              toolsLocked
                ? '这一局已结案，点「再玩一次」才能继续'
                : readyToSubmit
                  ? undefined
                  : '尚未将人物放置完全'
            }
          >
            <Button
              variant="ghost"
              className={cn(
                'h-12 w-full',
                'max-md:px-0 portrait:max-md:h-full',
                TOOLBAR_ICON_HOVER_CLASS,
              )}
              title={
                toolsLocked
                  ? '这一局已结案，点「再玩一次」才能继续'
                  : readyToSubmit
                    ? '提交'
                    : '尚未将人物放置完全'
              }
              disabled={!readyToSubmit || toolsLocked}
              onClick={submit}
            >
              <GameToolIcon render={toolIcons.submit} name="submit" />
            </Button>
          </span>

          {/*
           * v0.6.2 §4：视图簇 —— 放大 / 百分比 / 缩小 / 重置视图，下面接标尺开关。
           * v0.9.0 §17：右下角那两行统计删掉之后，这一簇由 `mt-auto` 顶到**最下面**
           * —— 上面四枚是「对棋盘做什么」，下面这簇是「怎么看棋盘」，中间留白正好
           * 把两组分开。分隔线跟着这一簇走，不再横在两枚工具按钮之间。
           */}
          <div
            className={cn(
              'mt-auto flex w-full flex-col items-center gap-1 border-t pt-2',
              /* v0.10.0：竖条里这一簇沉在底边（`mt-auto`）；横条里它跟着工具按钮
                 排成一行，不再占一整行、也不要那条分隔线。 */
              'max-md:mt-0 max-md:w-auto max-md:flex-row max-md:border-t-0 max-md:pt-0',
              /* v0.10.1：竖屏（窄且竖着）**整簇不显示** —— 棋盘已经按宽度铺满
                 整屏，没有可放大的余量；收掉放大 / 缩小 / 重置 / 标尺，底部横条
                 就只剩四枚「对棋盘做什么」的按钮，不再挤第二行。
                 用 CSS 而不是条件渲染：媒体查询是这件事唯一的真源（转屏即时生效，
                 不用等一次 `fit`），而且挂在上面的按钮仍留在树里 —— 快捷键、辅助
                 技术、以及既有用例都还能拿到它们。 */
              'portrait:max-md:hidden',
            )}
          >
            <IconButton
              variant="ghost"
              icon={<Plus className="h-4 w-4" />}
              label="放大"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              disabled={toolsLocked || zoom >= ZOOM_MAX}
              onClick={() => zoomBy(1)}
            />
            <span className="w-full text-center text-2xs tabular-nums text-muted-foreground max-md:w-auto">
              {Math.round(zoom * 100)}%
            </span>
            <IconButton
              variant="ghost"
              icon={<Minus className="h-4 w-4" />}
              label="缩小"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              disabled={toolsLocked || zoom <= ZOOM_MIN}
              onClick={() => zoomBy(-1)}
            />
            <IconButton
              variant="ghost"
              icon={<RotateCcw className="h-4 w-4" />}
              label="重置视图"
              side="right"
              className={TOOLBAR_ICON_HOVER_CLASS}
              disabled={toolsLocked}
              onClick={fit}
            />
            <IconButton
              variant="ghost"
              icon={<Ruler className="h-4 w-4" />}
              label="显示 / 隐藏标尺"
              side="right"
              className={cn(showRulers ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS)}
              disabled={toolsLocked}
              onClick={() => setShowRulers((current) => !current)}
            />
          </div>

          {/*
           * v0.9.0 §17：原来这里有两行「已放置 N 个 / 可回退 M 步」的统计。
           * 删掉的理由：棋盘上的头像、`×`、编号本身就是计数，撤回按钮的
           * enabled / disabled 本身就是可回退状态 —— 右下角再写一遍是同一份
           * 信息的第二次表述，还把视图簇从底边挤了上去。计时早在 v0.7.12
           * 就搬到了标题行，这里不再有任何文字。
           */}
        </aside>
      </div>

      {/*
        v0.10.1 竖屏：谜题描述弹框。触发的是头部那枚 `FileText` 图标。

        为什么弹框而不是留在面板里：竖屏一屏只够放棋盘 + 名册，描述是三行也好
        三十行也好，只在开局读一遍 —— 占着固定的高度不划算。线索不同，它们要
        反复对照，仍留在面板里（`GameBrief` 只关掉描述那一段）。

        正文沿用面板里那套写法（`whitespace-pre-wrap`、`text-muted-foreground`），
        只是不再 `line-clamp-3` —— 弹框就是为了读全文，再收一次反而多一步。
      */}
      <Dialog
        open={descriptionOpen}
        onOpenChange={(open) => {
          setDescriptionOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>谜题描述</DialogTitle>
          </DialogHeader>
          <p className="max-h-[60svh] overflow-y-auto whitespace-pre-wrap text-sm leading-[1.8] text-muted-foreground">
            {puzzleDescription.trim()}
          </p>
        </DialogContent>
      </Dialog>

      {/*
        v0.7.11：提交的两种结局共用一个弹窗。
        - 通过：定案 + 结束语 + 再玩一次；
        - 未通过：结果 +「x/n 正确。未能结案」，不列名单位置 + 继续游戏 / 重新开始。
        两种都用 `Dialog`，不是 `AlertDialog` —— 这里不是「要不要删除」那种确认，
        而是一局结束后的结算。

        v0.9.3 §3：通过的那一面换了写法 —— 标题「定案」、不报用时、不写
        「校验通过」。这一局已经结束，界面该说的是「结案了」，而不是再念一遍
        成绩；用时对玩家没有下一步，对作者也不该出现在玩家的结算卡上。
        v0.9.7：标题再改成「[庆祝] 恭喜定案！」—— 结案是值得高兴的一刻，
        不要再板着脸只写两个字。
      */}
      <Dialog
        open={result !== null}
        onOpenChange={(open) => {
          if (!open) closeResult();
        }}
      >
        <DialogContent className="max-w-md">
          {result?.kind === 'passed' ? (
            <div className="flex items-start justify-between gap-4 pr-6">
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="font-kai text-2xl font-semibold tracking-[0.1em]">
                  <span aria-hidden="true">🎉</span> 恭喜定案！
                </DialogTitle>
                <DialogDescription className="sr-only">
                  这一局已经结束。
                </DialogDescription>
              </div>
              {/*
                * v0.9.6：**这一格不再画印章**。用户把它移到了地图遮罩上 ——
                * 印是「盖在纸上」的东西，弹窗是一张浮起来的卡，把印塞进卡里
                * 两处各盖一次就成了重复播报。动效也跟着搬过去（见 `VerdictMark`）。
                */}
            </div>
          ) : result?.kind === 'failed' ? (
            <DialogHeader>
              {/* v0.9.4：标题与正文都只报结论 —— 谁不对由棋盘上的圈说，这里只报对了几个。 */}
              <DialogTitle>结果</DialogTitle>
              <DialogDescription>
                你没有找出所有人的位置！{result.correct}/{result.total} 正确。未能结案。
              </DialogDescription>
            </DialogHeader>
          ) : null}

          {/*
            v0.7.14（docs/v0.7.14.md §4）：结束语。作者的一句话，通过时才出现。
            **不给它加标签**（不写「结束语：」）—— 那是作者的声音，不是界面在说话。
            v0.9.3 §3：上面那条「用时」拿掉之后，它成了这张卡唯一的正文，于是
            与标题之间补一条细线 —— 「定案」两个字和作者写的这一段是两件事。
          */}
          {result?.kind === 'passed' && puzzleEnding.length > 0 ? (
            <p className="whitespace-pre-wrap border-t pt-3 font-kai text-sm leading-[1.9] text-foreground/90">
              {puzzleEnding}
            </p>
          ) : null}

          <DialogFooter className="flex-wrap">
            {result?.kind === 'passed' ? (
              <>
                {/*
                  * v0.9.5：两张结果卡都多一枚「返回谜题列表」—— 一局到此结束，
                  * 玩家的下一个动作通常不是「再点一次棋盘」，而是挑下一关。
                  * 落点与左上角那个箭头同一个地址（`source.listHref()`）。
                  */}
                <Button variant="outline" onClick={closeResult}>
                  关闭
                </Button>
                {/*
                  * 「再玩一次」是这一面的**兜底主按钮**：后面没有没做过的关时
                  * （`nextLevel === null`，比如这是最后一关、或下面的都通过了），
                  * 结案卡上仍然得有一个实心按钮，否则四枚全是描边、读不出下一步。
                  * 有「下一关」时它让位，退成 outline。
                  */}
                <Button variant={nextLevel ? 'outline' : 'default'} onClick={restart}>
                  再玩一次
                </Button>
                <Button variant="outline" onClick={() => navigate(source.listHref())}>
                  返回谜题列表
                </Button>
                {/*
                  * v0.9.5：**下一关**。通过之后才出现 —— 未通过时「换一关」是一句
                  * 逃跑的邀请，通过之后它才是顺理成章的下一步。
                  *
                  * 「下一关」＝列表顺序里排在当前之后、**还没通过**的第一关
                  * （`lib/gameCatalog.ts`）。后面没有了、或下面的关全通过过了，这枚
                  * 按钮就不画 —— 指不到地方的按钮比没有更糟。
                  */}
                {nextLevel ? (
                  <Button onClick={() => navigate(source.gameHref(nextLevel.key))}>
                    下一关
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button variant="outline" onClick={continueGame}>
                  继续游戏
                </Button>
                {/*
                  * v0.9.5：未通过也留一条退路 —— 这一局可以接着改（继续游戏），
                  * 也可以先去别的关。两枚新按钮都是 `outline`：这一面的主按钮仍是
                  * 「重新开始」（本版不动它），退出与换关不该比它更抢眼。
                  */}
                <Button variant="outline" onClick={() => navigate(source.listHref())}>
                  返回谜题列表
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
