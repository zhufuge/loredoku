import { Minus, Plus, RotateCcw, Ruler, X } from 'lucide-react';
import { GAME_CLEAR_LONG_PRESS_MS, GAME_PRESS_RING_DELAY_MS, UI_Z } from '@loredoku/shared';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { PressSweep } from '@/components/common/PressSweep';
import { CheckScrim } from '@/components/game/CheckScrim';
import { GameToolIcon } from '@/components/game/GameToolIcon';
import type { GameOperationMode } from '@/lib/gamePlacement';
import type { ToolIconsRender } from '@/lib/toolIcons';
import { TOOLBAR_ICON_ACTIVE_CLASS, TOOLBAR_ICON_HOVER_CLASS } from '@/lib/toolbarButtons';
import { ZOOM_MAX, ZOOM_MIN } from '@/lib/grid';
import { cn } from '@/lib/utils';

/**
 * 玩家页右列：四枚「对棋盘做什么」（标记 / 清除 / 撤回 / 提交）+「怎么看棋盘」
 * 的视图簇。
 *
 * v0.10.4：从 `GamePage` 搬出来。这一栏没有任何自有状态 —— 按下的时长、缩放的
 * 比例、按钮能不能点，全都是外面算好递进来的；留在这里的只有「哪一枚该亮成
 * 选中色」「禁用时为什么点不动」这些**呈现规则**。
 *
 * 窄屏上它是底部横条（`max-md:flex-row`），竖屏再收成 54 高的一排 —— 版式细节
 * 与 v0.10.0 / v0.10.1 那两版一致，没有改动。
 */
export interface GameToolRailProps {
  /** 这一局已结案：四枚动作按钮全部置灰。 */
  toolsLocked: boolean;
  mode: GameOperationMode;
  /** 正在逐人核对、结算卡还没弹 —— 右栏自己盖一层遮罩。 */
  checking: boolean;
  canUndoNow: boolean;
  readyToSubmit: boolean;
  /** 清除按钮上的长按进度（`null` = 环不在画）。 */
  clearPress: number | null;
  zoom: number;
  showRulers: boolean;
  toolIcons: ToolIconsRender;
  /** 这一局的标记图（`null` = 内置的红色 ×）。 */
  markImageUrl: string | null;
  onToggleForbidden: () => void;
  onStartClearPress: () => void;
  onEndClearPress: () => void;
  onUndo: () => void;
  onSubmit: () => void;
  onZoomBy: (direction: 1 | -1) => void;
  onResetView: () => void;
  onToggleRulers: () => void;
}

export function GameToolRail({
  toolsLocked,
  mode,
  checking,
  canUndoNow,
  readyToSubmit,
  clearPress,
  zoom,
  showRulers,
  toolIcons,
  markImageUrl,
  onToggleForbidden,
  onStartClearPress,
  onEndClearPress,
  onUndo,
  onSubmit,
  onZoomBy,
  onResetView,
  onToggleRulers,
}: GameToolRailProps): JSX.Element {
  const lockedHint = '这一局已结案，点「再玩一次」才能继续';
  const undoHint = toolsLocked ? lockedHint : canUndoNow ? undefined : '当前没有可以回退的步骤';
  const submitHint = toolsLocked ? lockedHint : readyToSubmit ? undefined : '尚未将人物放置完全';

  return (
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
          （理由同左栏，见 `GamePlayerAside` 里的注释）。

          v0.10.5 竖屏：整屏那层遮罩已经盖住这一栏，同档同色再留一层会叠成
          两层黑，所以只在非竖屏时画它（桌面 / 横屏手机照旧）。 */}
      {checking ? (
        <CheckScrim
          area="right"
          className="absolute inset-y-0 -left-px right-0 portrait:max-md:hidden"
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
        onClick={onToggleForbidden}
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
        {markImageUrl ? (
          <img
            src={markImageUrl}
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
        onPointerDown={onStartClearPress}
        onPointerUp={onEndClearPress}
        onPointerLeave={onEndClearPress}
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
          (!canUndoNow || toolsLocked) && 'cursor-not-allowed',
        )}
        title={undoHint}
      >
        <Button
          variant="ghost"
          className={cn(
            'h-12 w-full',
            /* v0.10.1 竖屏：底栏四枚等分的长方形，高度 54 容得下 2rem 的图标。 */
            'max-md:px-0 portrait:max-md:h-full',
            TOOLBAR_ICON_HOVER_CLASS,
          )}
          title={toolsLocked ? lockedHint : canUndoNow ? '回退上一步' : '当前没有可以回退的步骤'}
          disabled={!canUndoNow || toolsLocked}
          onClick={onUndo}
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
        title={submitHint}
      >
        <Button
          variant="ghost"
          className={cn(
            'h-12 w-full',
            'max-md:px-0 portrait:max-md:h-full',
            TOOLBAR_ICON_HOVER_CLASS,
          )}
          title={toolsLocked ? lockedHint : readyToSubmit ? '提交' : '尚未将人物放置完全'}
          disabled={!readyToSubmit || toolsLocked}
          onClick={onSubmit}
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
          onClick={() => onZoomBy(1)}
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
          onClick={() => onZoomBy(-1)}
        />
        <IconButton
          variant="ghost"
          icon={<RotateCcw className="h-4 w-4" />}
          label="重置视图"
          side="right"
          className={TOOLBAR_ICON_HOVER_CLASS}
          disabled={toolsLocked}
          onClick={onResetView}
        />
        <IconButton
          variant="ghost"
          icon={<Ruler className="h-4 w-4" />}
          label="显示 / 隐藏标尺"
          side="right"
          className={cn(showRulers ? TOOLBAR_ICON_ACTIVE_CLASS : TOOLBAR_ICON_HOVER_CLASS)}
          disabled={toolsLocked}
          onClick={onToggleRulers}
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
  );
}
