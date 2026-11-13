import { useEffect, useRef, useState } from 'react';

import type { GameCompletion } from '@/lib/gameCompletion';
import { formatElapsed } from '@/lib/gameTimer';
import { verdictCardScale } from '@/lib/verdictMark';
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
  /*
   * v0.10.2：卡片这一档也要按**封面尺寸**缩，而且缩得比游戏内那档狠。
   *
   * 卡片封面是 `aspect-square`，四列网格里只有 136px 见方；而 `text-7xl`（72px）
   * 竖排的「定案」本身就有 192px 高 —— 整块比封面还高，字探出封面上沿、左边也
   * 探出去（用户：「字和印大小自适应还不够，在卡片小的占据面积太大了」）。
   *
   * 所以这里自己量一次封面：`ref` 挂在按钮那一层（`absolute inset-0`，尺寸就是
   * 封面的内容区），量到之后交给 `verdictCardScale` 算比例。量不到（首帧、jsdom）
   * 时为 `null`，`verdictCardScale` 返 1，与老行为一致。
   */
  const coverRef = useRef<HTMLDivElement | null>(null);
  const [coverBox, setCoverBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = coverRef.current;
    if (!node) return;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      setCoverBox((previous) =>
        previous && previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };
    measure();
    /* jsdom 里没有 ResizeObserver；没有它就只量首帧。 */
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    return () => observer?.disconnect();
  }, []);

  const scale = verdictCardScale(coverBox);

  return (
    <div
      ref={coverRef}
      aria-hidden="true"
      data-testid="game-completion-cover"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/55"
    >
      {/*
        * v0.9.6：与地图遮罩**同一个组件、同一个排法**。
        * 用户：「上面展示和谜题卡片一样的定案+印章（位置也相同）」—— 各画一遍
        * 迟早会在某一版里一横一竖。卡片上不播印章动效：列表里的印是既成事实。
        *
        * v0.10.2：字改竖排之后，印挪到字列右侧、并且往下压住「案」的右上角。
        * 这一份偏移是游戏内那组（`x: 8, y: 40`）**按字号档位等比缩过来的**：
        * 这里 `text-7xl`（72px）、遮罩上 `text-9xl`（128px），比例 0.5625
        * —— 两处看到的是同一个构图，只是大小不同。
        */}
      <VerdictMark
        stampUrl={completion.stampUrl}
        stampOffset={{ x: 5, y: 22 }}
        scale={scale}
        className="h-full w-full"
      />
    </div>
  );
}

/**
 * 页脚那一格**时间**（v0.9.6 排版 / v0.9.7 内容）。
 *
 * 规则仍是「完成优先，否则取最后离开」，但两者说的不是同一件事：
 * - 有完成记录 → 那一局的**完成用时**（`mm:ss` 或 `hh:mm:ss`）；
 * - 没完成但玩过 → **相对时间**（「刚刚」「3 分钟前」，v0.9.7）—— 用户明确
 *   要的是「最后离开谜题时间」用「刚刚 / 1分钟前之类」，不再显示计时读数；
 * - 都没玩过 → **这一格整段不出现**（v0.9.7），连时间图标一起省掉。
 *
 * v0.9.7：**时间超过 1 小时补 `hh`**。`formatElapsed` 已经做了这件事（v0.9.6
 * 起就是），这里只是把「完成用时 / 游戏内计时」都统一交给它，不再各写一套。
 */
export function CompletionTime({
  completion,
  lastLeftElapsedMs,
  lastLeftAt,
  className,
}: {
  completion: GameCompletion | null;
  /** v0.9.6：最后离开时的计时读数（毫秒）；v0.9.7 起只进 `title`。 */
  lastLeftElapsedMs?: number | null;
  /** v0.9.7：最后离开的墙钟时刻（ISO）—— 卡片主体显示它的相对时间。 */
  lastLeftAt?: string | null;
  className?: string;
}): JSX.Element | null {
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
  if (lastLeftAt) {
    return (
      <span
        data-testid="game-last-left"
        title={
          lastLeftElapsedMs !== null && lastLeftElapsedMs !== undefined
            ? `上次离开时计时 ${formatElapsed(lastLeftElapsedMs)} · ${formatLastLeft(lastLeftAt)}`
            : `上次离开于 ${formatLastLeft(lastLeftAt)}`
        }
        className={cn('shrink-0', className)}
      >
        {formatRelativeTime(lastLeftAt)}
      </span>
    );
  }
  // v0.9.7：从未玩过 —— 不展示时间（返回 null，调用方连图标一起不画）。
  return null;
}

/**
 * v0.9.7：把 ISO 时刻说成「刚刚 / N 分钟前 / N 小时前 / N 天前 / 具体日期」。
 *
 * 分档只到「天」：再往上（周 / 月）对「我上次玩到什么时候」没什么帮助，
 * 而超过 7 天直接写日期更准。未来的时刻（设备时钟被拨过）按「刚刚」处理，
 * 不显示负数。
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days <= 7) return `${days} 天前`;
  return formatLastLeft(iso);
}

/** `2026-11-10T15:04:00Z` → `11-10 15:04`（本地时区）。 */
export function formatLastLeft(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
