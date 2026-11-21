import { useEffect, useRef, useState } from 'react';

import type { GameCompletion } from '@/lib/gameCompletion';
import { formatElapsed } from '@/lib/gameTimer';
import { verdictCardScale } from '@/lib/verdictMark';
import { cn } from '@/lib/utils';
import { VerdictMark } from '@/components/game/VerdictMark';

/** 已完成谜题在列表页的两件东西：`CompletionOverlay` 整张封面覆盖（卡片小，角标会被扫过去）+ `CompletionTime` 页脚时间；印与「定案」都取自 `VerdictMark`，两处必须同一枚同角度，没有图案就不盖章但字照留。 */
export function CompletionOverlay({
  completion,
}: {
  completion: GameCompletion;
}): JSX.Element {
  /* 卡片档按封面尺寸缩且比游戏内更狠：136px 封面装不下 192px 高的竖排字。量不到（首帧 / jsdom）时 `verdictCardScale` 返 1。 */
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
      {/* 与地图遮罩同一组件同一排法；偏移按字号档位等比缩（72/128 = 0.5625），卡片上不播动效。 */}
      <VerdictMark
        stampUrl={completion.stampUrl}
        stampOffset={{ x: 5, y: 22 }}
        scale={scale}
        className="h-full w-full"
      />
    </div>
  );
}

/** 页脚时间：有完成 → 完成用时（`mm:ss` / `hh:mm:ss`）；只玩过 → 最后离开的相对时间；都没玩过 → 整格不出现。超 1 小时的 `hh` 由 `formatElapsed` 统一处理。 */
export function CompletionTime({
  completion,
  lastLeftElapsedMs,
  lastLeftAt,
  className,
}: {
  completion: GameCompletion | null;
  /** 最后离开时的计时读数（毫秒），只进 `title` 提示。 */
  lastLeftElapsedMs?: number | null;
  /** 最后离开的墙钟时刻（ISO）—— 卡片主体显示它的相对时间。 */
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
  // 从未玩过 —— 不展示时间（返回 null，调用方连图标一起不画）。
  return null;
}

/** ISO 时刻 → 「刚刚 / N 分钟前 / … / 具体日期」：只分到「天」，超过 7 天直接写日期；未来时刻按「刚刚」。 */
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
