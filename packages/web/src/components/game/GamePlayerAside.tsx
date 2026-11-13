import { ArrowLeft, FileText } from 'lucide-react';
import { UI_Z, type Character, type CharacterSlotEntry } from '@loredoku/shared';
import { IconButton } from '@/components/ui/icon-button';
import { ParticipantPanel } from '@/components/map-editor/ParticipantPanel';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { GameBrief } from '@/components/game/GameBrief';
import { CheckScrim } from '@/components/game/CheckScrim';
import type { GameOperationMode } from '@/lib/gamePlacement';
import { formatElapsed } from '@/lib/gameTimer';
import { TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { cn } from '@/lib/utils';

/**
 * 玩家页左列：品牌 + 游戏名 + 计时（上）、题面（中）、名册（下）。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一栏的每条规矩都是**版式**（竖屏收成一行、
 * 题面与名册落到地图下面、结案后只留头部可点），与放置 / 计时 / 判卷的状态机
 * 没有关系 —— 拆开之后页面那一侧只剩「把哪份数据递进来」。
 *
 * 结构一个节点都没动：`<aside>` 仍是第一个 aside、宽度仍走 `style.width`、
 * 内部仍是「头部 / 题面 + 名册」两段（既有用例与 `max-md:contents` 那套
 * `order` 排布都钉着这些）。
 */
export interface GamePlayerAsideProps {
  /** 名册需要的栏宽（`rosterPanelWidthFor` 算出来的像素值）。 */
  rosterWidth: number;
  gameName: string;
  gridSize: number;
  elapsedMs: number;
  /** 这一局已结案：名册与题面不再接指针（头部例外，见文件内注释）。 */
  interactionLocked: boolean;
  /** 正在逐人核对、结算卡还没弹 —— 左栏自己盖一层遮罩。 */
  checking: boolean;
  portraitFit: boolean;
  puzzleDescription: string;
  puzzleClues: string[];
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  rosterCols: number | null;
  mode: GameOperationMode;
  /** 联动激活的槽位号（0 基，`null` = 没有）。 */
  activeSlotIndex: number | null;
  highlightedSlots: Set<number>;
  highlightColors: Map<number, string>;
  placedSlotIndices: Set<number>;
  onBack: () => void;
  onOpenDescription: () => void;
  onCardClick: (index: number) => void;
  onCardHoverEnter: (index: number) => void;
  onCardHoverLeave: (index: number) => void;
}

export function GamePlayerAside({
  rosterWidth,
  gameName,
  gridSize,
  elapsedMs,
  interactionLocked,
  checking,
  portraitFit,
  puzzleDescription,
  puzzleClues,
  slots,
  charactersById,
  rosterCols,
  mode,
  activeSlotIndex,
  highlightedSlots,
  highlightColors,
  placedSlotIndices,
  onBack,
  onOpenDescription,
  onCardClick,
  onCardHoverEnter,
  onCardHoverLeave,
}: GamePlayerAsideProps): JSX.Element {
  return (
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
      {checking ? (
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
            onClick={onBack}
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
              onClick={onOpenDescription}
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
          <p className="min-w-0 flex-1 truncate text-sm font-semibold" title={gameName}>
            {gameName} {gridSize}x{gridSize}
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
            activeSlotIndex={activeSlotIndex}
            highlightedSlots={highlightedSlots}
            highlightColors={highlightColors}
            readOnly
            // v0.7.11：去掉「参与者 5/5」那行标题 —— 玩家端上面已经有一行。
            hideHeader
            placedSlotIndices={placedSlotIndices}
            onActivateHover={onCardHoverEnter}
            onDeactivateHover={onCardHoverLeave}
            onActivateClick={onCardClick}
          />
        </div>
      </div>
    </aside>
  );
}
