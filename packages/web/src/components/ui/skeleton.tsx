import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/**
 * 加载占位。用 `load-skeleton` 而不是 Tailwind 自带的呼吸工具类：那一类只给一条
 * `animation`，叠不上第二条，骨架屏就没法同时「迟到」和「呼吸」—— 而这两件事
 * 在 v0.7.12 §9 是同一条要求的两半（`index.css` 的 `load-skeleton`）。
 *
 * 迟到那一半的意义：200ms 内就回来的列表，骨架**一帧都不画**。否则用户看到的
 * 不是「在取」，是几行灰条闪了一下 —— 比不给占位更糟。
 *
 * 这个用例也说明为什么呼吸要写成自己的 `@keyframes`：Tailwind 只生成**被源码
 * 引用到**的关键帧，删掉最后一处呼吸工具类，它连 `pulse` 都一起不发 —— 而这里
 * 失效不会报错，只会安静地不呼吸。
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return <div className={cn('load-skeleton rounded-md bg-muted', className)} {...props} />;
}
