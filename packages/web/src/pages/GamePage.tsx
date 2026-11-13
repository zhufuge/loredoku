import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  GAME_CHECK_STEP_MS,
  GAME_VERDICT_HOLD_MS,
  MAP_LAYER_Z,
  UI_Z,
  type CellCoord,
  type GamePlacementBoard,
} from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { CheckScrim } from '@/components/game/CheckScrim';
import { GameBoardLayers } from '@/components/game/GameBoardLayers';
import { GameDescriptionDialog, GameResultDialog } from '@/components/game/GameDialogs';
import { GamePlayerAside } from '@/components/game/GamePlayerAside';
import { GameToolRail } from '@/components/game/GameToolRail';
import { GameVerdictScrim } from '@/components/game/GameVerdictScrim';
import { MapRulerStrips } from '@/components/map/MapRulerStrips';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import { useHighlight } from '@/hooks/useHighlight';
import { useGameContent } from '@/hooks/useGameContent';
import { useGameViewport } from '@/hooks/useGameViewport';
import { useGameTimer } from '@/hooks/useGameTimer';
import { usePlacementFx } from '@/hooks/usePlacementFx';
import { useBoardGestures } from '@/hooks/useBoardGestures';
import { clampZoom, zoomAtPoint, ZOOM_STEP, type CanvasPoint } from '@/lib/grid';
import { readGameProgress, writeGameProgress } from '@/lib/gameProgress';
import { nextUnfinishedLevel, type GameLevelRef } from '@/lib/gameCatalog';
import { readGameCompletion, recordGameCompletion } from '@/lib/gameCompletion';
import { useProvidedGameSource, type GameSource } from '@/lib/gameSource';
import { readGameTimer } from '@/lib/gameTimer';
import { canvasShadowStyle } from '@/lib/mapStyle';
import { resolveHighlight } from '@/lib/highlight';
import { verdictMarkScale } from '@/lib/verdictMark';
import { cn } from '@/lib/utils';
import { collectBlockingCells, collectItemCells, resolveHoverEffects } from '@/lib/canvasLayers';
import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationEvent,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import {
  allParticipantsPlaced,
  canUndo,
  cellKey,
  createGamePlacementState,
  placementAt,
  resolveToolHint,
  forbiddenCells,
  avatarPlacedParticipantIds,
  undo,
  validatePlacement,
  type GameOperationMode,
  type GamePlacementState,
} from '@/lib/gamePlacement';
import { buildCheckItems, type CheckItem } from '@/lib/gameCheck';

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
   * v0.10.2：**结算卡关上之后，遮罩上才补出「再玩一次」**。
   *
   * 用户：「从一开始就不要渲染，后面再渲染出来」。以前判据是 `!result`，
   * 于是刚通过那 1 秒（`finished` 已真、`result` 还是 null）按钮先画出来，
   * 结算卡一弹又撤掉，关上再补回来 —— 一进一出等于闪了两下。现在它在这一局
   * 里**一次都不提前出现**：只有「已完成再进入」那一版（`revisitedRef`）或
   * 「卡已经关过」（本 state）才画。
   */
  const [verdictDismissed, setVerdictDismissed] = useState(false);

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
  const [hover, setHover] = useState<CellCoord | null>(null);
  /** v0.8.7 §8：光标在纸上的像素位置 —— 物品名称提示贴它，不贴物品。 */
  const [hoverPoint, setHoverPoint] = useState<CanvasPoint | null>(null);
  const [labelRegionId, setLabelRegionId] = useState<string | null>(null);
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
  const panRef = useRef<{ x: number; y: number } | null>(null);
  /** 本次指针手势有没有真的拖过画布 —— 拖完那次 click 要吞掉。 */
  const pannedRef = useRef(false);
  /**
   * v0.7.11：本次手势有没有**按住滑过格子**（连续放置 / 连续擦除）。有的话，
   * 抬手时那一记 `click` 是手势的尾巴，已经处理过了 —— 必须吞掉，否则同一格会
   * 被切换两次（放上又取消）。
   */
  const paintedRef = useRef(false);

  /**
   * 存档的镜像。事件处理器读「此刻」的值，而不是渲染闭包里的那份 ——
   * 长按定时器、按住滑动、连续点击都在下一次渲染之外触发，闭包可能已经过期。
   * 滑动一次会连着放好几格，`dispatchCell` 必须基于**最新**棋盘计算，
   * 否则同一帧里的第二次放置会拿着旧棋盘把第一次覆盖掉。
   */
  const placementRef = useRef(placementState);
  placementRef.current = placementState;

  const detail = gameQuery.data;
  /**
   * v0.10.4：一关的「内容」（谜题行 + 地图 JSON + 资源 / 角色表）整块交给
   * `useGameContent` —— 它是纯派生，不碰这一页的任何状态。
   */
  const {
    draft,
    slots,
    linkageColors,
    rosterCols,
    puzzleDescription,
    puzzleClues,
    puzzleEnding,
    rosterWidth,
    assetsById,
    charactersById,
    mark,
    toolIcons,
    ringImage,
    checkStyle,
    cells,
    regions,
    gridSize,
    style,
  } = useGameContent({
    detail,
    source,
    assets: assetsQuery.data,
    characters: charactersQuery.data,
  });

  useEffect(() => {
    document.title = gameQuery.data ? `${gameQuery.data.name} · 格物` : '游戏 · 格物';
  }, [gameQuery.data]);

  /** 中列（`<main>`）—— 量可见区、算坐标、挂 `ResizeObserver` 都认它。 */
  const containerRef = useRef<HTMLDivElement | null>(null);

  /**
   * v0.10.4：视口（格子大小 / 缩放 / 平移 / 竖屏 / 可见区）交给 `useGameViewport`。
   * 它不读任何一局的状态 —— 只认 `gridSize`、地图样式与标尺开关。
   */
  const {
    cellSize,
    total,
    portraitFit,
    stageBox,
    pan,
    setPan,
    zoom,
    setZoom,
    spaceHeld,
    fit,
    zoomBy,
    toCell,
    toCanvasPoint,
    userAdjustedRef,
    stageHeight,
  } = useGameViewport({ containerRef, gridSize, style, showRulers });

  /*
   * v0.10.0：手机上棋盘只有 236 见方，而「定案」遮罩那套版式（128px 的两个字）
   * 是照桌面 480 起的棋盘定的 —— 不缩就会竖着顶出遮罩、印甩到棋盘外，底下那颗
   * 「再玩一次」也被压住。按棋盘边长等比缩，字、印、偏移的相对位置一点都不变。
   *
   * v0.10.2：棋盘大不等于屏上够地方 —— 横屏手机棋盘能有 900 多，而中列只剩
   * 一百来像素高。再把量出来的可见区传进去，两者取小（用户：「大小要自适应屏幕」）。
   */
  const verdictScale = verdictMarkScale(total, stageBox);

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

  /**
   * v0.10.4：四样一次性动效（盖章 / 退场 / 落笔 / 水波）交给 `usePlacementFx`。
   * 它只负责演 —— 唯一的例外是 `eraseCell`：退场演完才真的删那一格。
   */
  const {
    pulse,
    forbiddenPop,
    forbiddenPopCell,
    erasing,
    forbiddenWave,
    forbiddenWaveAlt,
    markPulse,
    pulseForbiddenHint,
    pulseForbiddenWave,
    eraseCell,
    resetBoardFx,
  } = usePlacementFx({ updatePlacement });

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

  /** 标尺开关落盘（重排在 `useGameViewport` 那一侧，这里只管记住选择）。 */
  useEffect(() => {
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
   * v0.9.5：这一局的水合跑完了吗 —— 计时落盘的那条 effect 靠它挡住「读之前先写」
   * （见 `useGameTimer` 里那条落盘 effect 的注释 —— 那是 v0.7.11 续计时在真浏览器里失效的根因）。
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

  /**
   * v0.10.4：秒表交给 `useGameTimer`。
   *
   * `active` 就是原来那道闸：水合跑完、且网格已经读到，才允许落盘。
   */
  const { elapsedMs, pauseTimer, resumeTimer, resetTimer, hydrateTimer } = useGameTimer({
    storageId,
    progressMeta,
    active: hydrated && gridSize > 0,
  });

  /**
   * v0.9.6：定案遮罩那颗「停一秒再弹窗」的定时器要撤 —— 否则离开页面后它还会
   * 对着一个已经卸载的组件 setState。动效那一批定时器由 `usePlacementFx` 自己收。
   */
  useEffect(
    () => () => {
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
    // v0.10.2：换一关 / 重新读档时，上一版「卡关过了」的记号不该跟着走。
    setVerdictDismissed(false);
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
    hydrateTimer(startFrom, !alreadyDone);
    setFinished(alreadyDone);
    /**
     * v0.9.5：读完了才允许落盘。这一行必须排在 `readGameProgress` /
     * `readGameTimer` 之后 —— 它一置真，计时那条 effect 立即开始每 5 秒写一次。
     */
    setHydrated(true);
  }, [draft, storageId, gridSize, slots.length, progressMeta, hydrateTimer]);

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

  /**
   * v0.10.4：名册卡片移开。
   *
   * SPEC-G03+ BUG-G02：放置态下移开**任意卡片**都恢复已武装参与者的激活。必须走
   * 幂等的 `restore` —— 用 `click` 时，离开的恰是武装者自己的卡片就等同于
   * 「再点一次」，激活会被 toggle 关掉。
   *
   * 这段判断原先写在名册的 `onDeactivateHover` 里；名册搬进 `GamePlayerAside`
   * 之后，它是**这一页的模式**（`mode` / `activation`）在读，所以跟着留下。
   */
  const handleCardHoverLeave = (index: number): void => {
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
   * v0.10.4：棋盘手势（一格一落 / 长按放头像 / 清除按钮的单击与长按）交给
   * `useBoardGestures`。指针事件仍在下面那份 JSX 里 —— 它读的是鼠标 / 手指，
   * 属于渲染层；「这一手怎么落到棋盘上」才是这个 hook 的事。
   */
  const {
    pressCell,
    clearPress,
    cellPressRef,
    dispatchCell,
    startCellPress,
    endCellPress,
    dropCellPress,
    cancelCellPress,
    startClearPress,
    endClearPress,
  } = useBoardGestures({
    mode,
    applyMode,
    toggleTool,
    gridSize,
    blockingCells,
    updatePlacement,
    placementRef,
    markPulse,
    pulseForbiddenHint,
    pulseForbiddenWave,
    eraseCell,
  });

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
    resetBoardFx();
    saveProgress(fresh.board);
    resetTimer();
  }, [saveProgress, resetTimer, resetBoardFx]);

  /**
   * v0.9.6：已完成那一版遮罩上的「再玩一次」。
   *
   * 与 `restart` 的差别只有一处：**先撤掉定案遮罩再重置**。清盘之后再撤遮罩会让
   * 玩家看见一帧空棋盘顶着「定案」，像结算卡还没收干净。
   */
  const replay = (): void => {
    setFinished(false);
    /*
     * v0.10.2：这一局从头来过，遮罩上那颗按钮收回去 —— 下次再通过时它要等到
     * 结算卡关上之后才重新出现（见 `verdictDismissed`）。
     */
    setVerdictDismissed(false);
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
    /*
     * v0.10.2：通过那一局关上卡 = 这一屏只剩定案与印，此时才让「再玩一次」
     * 出场（见 `verdictDismissed`）。未通过那一路遮罩上从来就没有这颗按钮。
     */
    if (result?.kind === 'passed') setVerdictDismissed(true);
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

  /**
   * v0.10.4：页面与三个面板之间的接口，都是从上面那些状态算一次的投影。
   *
   * 为什么宁可多两个短名：面板不该知道「校验进行中」与「结算卡开着」是两件事
   * （`checking` 要求 `!result`），也不该知道「结案就等于工具都锁了」—— 这两条
   * 判据在 v0.9.6 / v0.9.7 各改过一次。让它们只在这里出现一次，改的时候只有
   * 一处要读，面板那边不必跟着再判一遍。
   */
  const checking = checkRun !== null && !result && !finished;
  const canUndoNow = canUndo(placementState);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/*
          v0.10.4：左列（品牌 / 游戏名 / 计时 / 题面 / 名册）整块交给
          `GamePlayerAside`。版式与 v0.10.1 完全一致 —— 连注释一起搬过去，
          改版时只读那一个文件。
        */}
        <GamePlayerAside
          rosterWidth={rosterWidth}
          gameName={game.name}
          gridSize={gridSize}
          elapsedMs={elapsedMs}
          interactionLocked={interactionLocked}
          checking={checking}
          portraitFit={portraitFit}
          puzzleDescription={puzzleDescription}
          puzzleClues={puzzleClues}
          slots={slots}
          charactersById={charactersById}
          rosterCols={rosterCols}
          mode={mode}
          activeSlotIndex={activation.activeParticipantId}
          highlightedSlots={highlightedSlots}
          highlightColors={highlightColors}
          placedSlotIndices={placedSlotIndices}
          onBack={() => navigate(source.listHref())}
          onOpenDescription={() => setDescriptionOpen(true)}
          onCardClick={handleCardClick}
          onCardHoverEnter={(index) => handleActivation({ type: 'enter', participantId: index })}
          onCardHoverLeave={handleCardHoverLeave}
        />

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
            height: stageHeight,
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
          {checking ? (
            <CheckScrim
              area="center"
              /*
               * v0.10.5 竖屏：整屏那层遮罩已经把留白一起压暗了，这里再留一层会同档
               * 同色叠成两层黑。`portrait:max-md:hidden` 与 `isPortraitViewport` 同口径
               * （宽 < 768 且竖着拿），横屏手机 / 桌面照旧保留这一层。
               */
              className="pointer-events-none absolute inset-0 portrait:max-md:hidden"
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
              zIndex: checking ? UI_Z.saveMask + 1 : undefined,
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
              {checking ? (
                <CheckScrim area="canvas" className="pointer-events-none absolute inset-0" />
              ) : null}
            </div>

            {/*
              v0.10.4：定案遮罩单独一份（`GameVerdictScrim`），图层栈交给
              `GameBoardLayers`。这一屏剩下的只有「纸 / 遮罩 / 图层栈」三层关系，
              以及标尺 —— 顺序仍与 v0.9.6 一致。
            */}
            {finished ? (
              <GameVerdictScrim
                stampUrl={toolIcons.submit?.imageUrl ?? null}
                scale={verdictScale}
                animate={!revisitedRef.current}
                showReplay={revisitedRef.current || verdictDismissed}
                onReplay={replay}
              />
            ) : null}

            <GameBoardLayers
              board={placementState.board}
              slots={slots}
              charactersById={charactersById}
              cells={cells}
              assetsById={assetsById}
              regions={regions}
              style={style}
              gridSize={gridSize}
              cellSize={cellSize}
              highlight={highlight}
              highlightLeaving={highlightLeaving}
              hoveredRegionId={hoveredRegionId}
              hoveredRegion={hoveredRegion}
              maskCells={maskCells}
              hover={hover}
              hoverPoint={hoverPoint}
              hoverEffects={hoverEffects}
              toolHint={toolHint}
              mark={mark}
              toolIcons={toolIcons}
              forbiddenPop={forbiddenPop}
              forbiddenPopCell={forbiddenPopCell}
              ringImage={ringImage}
              pressCell={pressCell}
              activeParticipantId={
                activation.activeParticipantId === null
                  ? null
                  : activation.activeParticipantId + 1
              }
              pulse={pulse}
              erasing={erasing}
              forbiddenWave={forbiddenWave}
              forbiddenWaveAlt={forbiddenWaveAlt}
              checkRun={checkRun}
              checkStyle={checkStyle}
              interactionLocked={interactionLocked}
              onLabelHover={setLabelRegionId}
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

        {/*
          v0.10.4：右列（四枚动作按钮 + 视图簇）交给 `GameToolRail`。
          它没有自有状态 —— 按下的时长、缩放的比例、按钮能不能点，全在这里算好。
        */}
        <GameToolRail
          toolsLocked={toolsLocked}
          mode={mode}
          checking={checking}
          canUndoNow={canUndoNow}
          readyToSubmit={readyToSubmit}
          clearPress={clearPress}
          zoom={zoom}
          showRulers={showRulers}
          toolIcons={toolIcons}
          markImageUrl={mark?.imageUrl ?? null}
          onToggleForbidden={() => toggleTool('forbidden')}
          onStartClearPress={startClearPress}
          onEndClearPress={endClearPress}
          onUndo={() => updatePlacement(undo)}
          onSubmit={submit}
          onZoomBy={zoomBy}
          onResetView={fit}
          onToggleRulers={() => setShowRulers((current) => !current)}
        />
      </div>

      {/*
        v0.10.5 竖屏：校验期间一层整屏遮罩，盖住头部 / 题面 / 名册 / 工具栏。
        左栏在竖屏是 `display: contents`（没有盒子），原来那层 `absolute` 的
        left 遮罩显式 `max-md:hidden`，竖屏彻底没遮罩；而题面名册那一块又是
        `overflow-y-auto` 的滚动容器，`absolute inset-0` 的子层会随内容滚走。
        用 `fixed inset-0` 相对视口、挂在最外层（不进任何滚动容器）一次盖全，
        两层同档的 center / right 遮罩则用 `portrait:max-md:hidden` 撤掉，避免叠黑。

        `zIndex = saveMask(40)`：画布纸在校验时抬到 `saveMask+1(41)`，所以棋盘
        照常明亮，压暗的只有纸以外的部分。`pointer-events-auto` 接住点击，
        校验期间名册卡 / 工具按钮都点不动。
      */}
      {portraitFit && checking ? (
        <CheckScrim
          area="portrait"
          className="fixed inset-0"
          style={{ zIndex: UI_Z.saveMask }}
        />
      ) : null}

      {/* v0.10.4：两个弹框各一份，触发条件仍在上面那些状态里。 */}
      <GameDescriptionDialog
        open={descriptionOpen}
        onOpenChange={setDescriptionOpen}
        description={puzzleDescription}
      />

      <GameResultDialog
        result={result}
        ending={puzzleEnding}
        hasNextLevel={nextLevel !== null}
        onClose={closeResult}
        onContinue={continueGame}
        onRestart={restart}
        onNextLevel={() => {
          if (nextLevel) navigate(source.gameHref(nextLevel.key));
        }}
        onBackToList={() => navigate(source.listHref())}
      />
    </div>
  );
}
