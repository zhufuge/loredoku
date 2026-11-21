import { ArrowLeft, FileText, HelpCircle } from 'lucide-react';
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

/** 玩家页左列：品牌 + 游戏名 + 计时（上）、题面（中）、名册（下）。这里只有版式（竖屏一行、题面名册落地图下、结案后只留头部可点）；结构被既有用例钉住：`<aside>` 必须是第一个、宽度走 `style.width`、内部两段。 */
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
  /** 打开玩法说明（竖屏那枚问号挂在头部，日夜模式按钮左边）。 */
  onOpenHelp: () => void;
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
  onOpenHelp,
  onCardClick,
  onCardHoverEnter,
  onCardHoverLeave,
}: GamePlayerAsideProps): JSX.Element {
  return (
    <aside
      className={cn(
        'relative flex shrink-0 flex-col border-r bg-background',
        /* 竖屏：`display: contents` 把孩子摊到外层，只靠 `order` 重排，不搬 DOM —— 右栏必须仍是最后一个 `aside`，左栏仍是第一个且 `style.width` 被用例钉着。 */
        'max-md:contents',
        /* 结案后名册 / 题面不接指针（见 interactionLocked）。 */
        interactionLocked && 'pointer-events-none',
      )}
      style={{ width: rosterWidth }}
    >
      {/* 左栏自己一层完整遮罩：独立相对容器、接指针（核对期间名册 / 题面 / 主题都不该能点）；向右多探 1px 盖住分隔边框，否则那条线会比四周亮。 */}
      {checking ? (
        <CheckScrim
          area="left"
          /* 竖屏：左栏是 `display: contents`，没有自己的盒子，绝对定位无处依附 —— 竖屏不画；锁指针照常从 `<aside>` 继承。 */
          className="absolute inset-y-0 left-0 -right-px max-md:hidden"
          style={{ zIndex: UI_Z.saveMask }}
        />
      ) : null}
      {/* 结案后名册 / 题面不接指针，但这一行例外（用户明确要能点返回与切日夜模式）：子元素显式恢复 `pointer-events-auto`。 */}
      <div
        className={cn(
          'shrink-0 p-3',
          /* 竖屏头部收成一行：第一行容器 `display: contents` + `order` 排成「返回 → 标题 → 计时 → 主题」，品牌 logo 竖屏藏起（一行里塞不下）。桌面仍是两行。 */
          'max-md:flex max-md:items-center max-md:gap-2 max-md:order-1 max-md:py-1',
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
          <BrandLogo
            height={16}
            withWordmark
            className="flex shrink-0 items-center gap-2 max-md:hidden"
          />
          {/* 竖屏：描述挪到右上角这枚图标后面（点开是弹框），面板只留线索与名册；没有描述就不挂按钮。 */}
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
          {/* 玩法说明只在竖屏出现、紧挨主题开关左边；桌面端那枚沉在右栏最下面（`GameToolRail`）。 */}
          <IconButton
            variant="ghost"
            icon={<HelpCircle className="h-4 w-4" />}
            label="玩法说明"
            side="bottom"
            className={cn(
              TOOLBAR_ICON_HOVER_CLASS,
              'hidden max-md:order-5 max-md:flex max-md:shrink-0',
            )}
            onClick={onOpenHelp}
          />
          {/* 玩家端没有 AppShell 头部，主题开关挂在左栏这一行右侧。 */}
          <ThemeToggle className="ml-auto max-md:order-6 max-md:shrink-0" />
        </div>
        {/* 计时在标题行最右：它是「这一局」的元信息，不放右栏底部（会像第三条统计）；不要图标，只留粗体淡色 `mm:ss`。 */}
        <div className="flex items-baseline gap-2 pl-1 max-md:order-2 max-md:min-w-0 max-md:flex-1 max-md:items-center max-md:pl-0">
          {/* 竖屏标题行再收一档：字号更小、行高更紧，把省下的高度让给棋盘。 */}
          <p
            className="min-w-0 flex-1 truncate text-sm font-semibold max-md:text-xs max-md:leading-tight"
            title={gameName}
          >
            {gameName} {gridSize}x{gridSize}
          </p>
          <span
            data-testid="game-timer"
            className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground max-md:order-3 max-md:text-xs"
            title="本局用时（提交后停止）"
          >
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      </div>

      {/* 题面 + 名册：桌面钉在左栏、永远展开；窄屏落到「地图下面、工具栏上面」，并吃掉棋盘定高之后剩下的**全部**高度，内部整块可滚（多出的高度给线索与名册，不留白）。 */}
      <div
        className={cn(
          'min-h-0 flex-1 flex-col md:flex',
          /* 竖屏与横过来的手机要分开：竖屏棋盘按宽度定死高，剩余高度全给这块；横屏限高约 38% 屏高、不参与分配，否则 360 高会被平分、名册压成一条缝。 */
          'max-md:order-3 max-md:flex max-md:overflow-y-auto max-md:border-t',
          portraitFit ? 'max-md:flex-1' : 'max-md:max-h-[38svh] max-md:flex-none',
        )}
      >
        {/* v0.7.14（docs/v0.7.14.md §4）：题面钉在标题与名册之间，三样同时在视野里；没有内容时组件自己返回 `null`。 */}
        <GameBrief
          description={puzzleDescription}
          clues={puzzleClues}
          hideDescription={portraitFit}
        />

        <div
          className={cn(
            'flex min-h-0 flex-1',
            // 竖屏：名册这时横躺成一整条，宽度交给屏宽，不横向滚动。
            'max-md:overflow-x-auto',
            /* 竖屏：这一层不参与高度分配、按内容高度走 —— 上面的容器是**唯一**滚动区；横向自动滚动也得让位，否则另一轴被算成自动滚动，这层成了第二个容器吃掉触屏滑动。 */
            portraitFit && 'max-md:flex-none portrait:max-md:overflow-visible',
          )}
        >
          <ParticipantPanel
            slots={slots}
            charactersById={charactersById}
            cols={rosterCols}
            /* 竖屏名册换一套卡片（每行固定 2 张、卡片横过来：左头像、右上名称、右下线索）；只有竖屏窄屏换，桌面与编辑器 / 预览维持原样。 */
            compactPortrait={portraitFit}
            /* 名册的「选中」= 手上正拿着的那位（放置态），不是鼠标路过；选中态是 3px 连续主色边（`PARTICIPANT_SELECTED_RING`）+ 一次 180ms 鼓起。 */
            selectedSlotIndex={mode.kind === 'placing' ? mode.participantId - 1 : null}
            draggingIndex={null}
            activeSlotIndex={activeSlotIndex}
            highlightedSlots={highlightedSlots}
            highlightColors={highlightColors}
            readOnly
            // 玩家端上面已经有一行标题，这里不再显示「参与者 5/5」那一行。
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
