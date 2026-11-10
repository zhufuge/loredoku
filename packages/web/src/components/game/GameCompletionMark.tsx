import type { GameCompletion } from '@/lib/gameCompletion';
import { formatElapsed } from '@/lib/gameTimer';
import { cn } from '@/lib/utils';
import { VerdictMark } from '@/components/game/VerdictMark';

/**
 * v0.9.5 / v0.9.6：**已完成的谜题**在列表页的模样 —— 两件东西，分两处放：
 *
 * 1. `CompletionOverlay`：盖在封面上的**大面积覆盖**（整张封面压一层，再把
 *    「定案」两个字与作者给「提交」配的那枚图案斜着印上去）。它是「这一关结案了」
 *    的**整卡提示** —— 卡片很小，一枚角标会被扫过去，一整片覆盖才让人在挑关卡时
 *    一眼看见哪些做完了。
 * 2. `CompletionTime`：页脚那一格**时间**（完成用时 / 最后离开时间）。
 *
 * v0.9.6：加上「定案」两个字，且印改由 `VerdictMark` 提供 —— 那张遮罩上的大印
 * 与卡片上的小印必须是同一枚、同一个角度，两处各画一遍迟早会走样。
 *
 * **没有图案就不盖章，但「定案」两个字照留**（v0.9.6 调整）：v0.9.5 是「没印就
 * 整块不画」，理由是「一片没有印的空蒙版只会把封面弄脏」。加了文字之后这条理由
 * 不成立了 —— 「定案」本身就说清了这一关的状态，蒙版也就不空。
 */
export function CompletionOverlay({
  completion,
}: {
  completion: GameCompletion;
}): JSX.Element {
  return (
    <div
      aria-hidden="true"
      data-testid="game-completion-cover"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/55"
    >
      {/*
        * v0.9.6：与地图遮罩**同一个组件、同一个排法**（定案在上、印在下、居中）。
        * 用户：「上面展示和谜题卡片一样的定案+印章（位置也相同）」—— 各画一遍
        * 迟早会在某一版里一横一竖。卡片上不播印章动效：列表里的印是既成事实。
        */}
      <VerdictMark stampUrl={completion.stampUrl} className="h-full w-full" />
    </div>
  );
}

/**
 * 页脚那一格**时间**（v0.9.6 改）。
 *
 * 规则是「完成优先，否则取最后离开」，显示的都是**计时读数**（`mm:ss`）：
 * - 有完成记录 → 那一局的完成用时；
 * - 没完成但玩过 → 上次离开时表上的读数；
 * - 都没玩过 → `00:00`。
 *
 * 版面上**不加前缀**：用户给的占位符是「【时间图标】00:00」，图标已经说了
 * 「这是一格时间」，再写「完成 / 离开」会把 12 张卡的页脚挤成一团。数字具体是
 * 哪一种，交给 `title`（悬停才看）。
 */
export function CompletionTime({
  completion,
  lastLeftElapsedMs,
  lastLeftAt,
  className,
}: {
  completion: GameCompletion | null;
  /** v0.9.6：最后离开时的计时读数（毫秒）；没有完成记录时才显示。 */
  lastLeftElapsedMs?: number | null;
  /** 最后离开的墙钟时刻，只进 title。 */
  lastLeftAt?: string | null;
  className?: string;
}): JSX.Element {
  if (completion) {
    return (
      <span
        data-testid="game-completion-time"
        title={`完成用时 · 完成于 ${completion.completedAt.slice(0, 10)}`}
        className={cn('shrink-0 tabular-nums', className)}
      >
        {formatElapsed(completion.elapsedMs)}
      </span>
    );
  }
  if (lastLeftElapsedMs !== null && lastLeftElapsedMs !== undefined) {
    return (
      <span
        data-testid="game-last-left"
        title={
          lastLeftAt
            ? `上次离开时的计时 · ${formatLastLeft(lastLeftAt)}`
            : '上一次游玩离开时的计时'
        }
        className={cn('shrink-0 tabular-nums', className)}
      >
        {formatElapsed(lastLeftElapsedMs)}
      </span>
    );
  }
  return (
    <span data-testid="game-no-time" className={cn('shrink-0 tabular-nums', className)}>
      00:00
    </span>
  );
}

/** `2026-11-10T15:04:00Z` → `11-10 15:04`（本地时区）。 */
export function formatLastLeft(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
