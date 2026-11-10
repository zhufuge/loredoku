import { useState } from 'react';
import type { GameCompletion } from '@/lib/gameCompletion';
import { formatElapsed } from '@/lib/gameTimer';
import { cn } from '@/lib/utils';

/**
 * v0.9.5：**已完成的谜题**在列表页的模样 —— 两件东西，分两处放：
 *
 * 1. `CompletionOverlay`：盖在封面上的**大面积覆盖**（整张封面压一层，再把作者
 *    给「提交」配的那枚图案斜着印上去）。它是「这一关结案了」的**整卡提示** ——
 *    卡片很小，一枚角标会被扫过去，一整片覆盖才让人在挑关卡时一眼看见哪些做完了。
 * 2. `CompletionTime`：页脚那一格**用时**（`03:07`）。覆盖是「做没做过」，用时是
 *    「做得怎么样」，两件事。
 *
 * **没有图案就不盖章**（与 v0.9.3 §3 定案卡同一条规矩）：内置的 lucide 发送图标是
 * 界面图标，盖上去像把按钮按进了封面里，不是一个印。那一档只剩用时 —— 覆盖也
 * 一起不画：一片没有印的空蒙版只会把封面弄脏。
 */
export function CompletionOverlay({
  completion,
}: {
  completion: GameCompletion;
}): JSX.Element | null {
  /**
   * 记下来的地址可能已经不在了：作者换过那枚图、包重新导出过（`files/icons/`
   * 里的文件名带着关卡 key，重新导出不一定同名）。加载失败就**静默不画**，
   * 不在封面上留一个破图标 —— 用时那一边照常显示，完成这件事仍然说得清楚。
   *
   * 用 state 而不是 `onError` 直接改 DOM：这一块的重渲染本来就是从「一次失败的
   * 加载」开始的，交给 React 才不会和卡片自己的悬停重渲染抢。
   */
  const [failed, setFailed] = useState(false);
  if (!completion.stampUrl || failed) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="game-completion-cover"
      className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/55"
    >
      <img
        src={completion.stampUrl}
        alt=""
        draggable={false}
        data-testid="game-completion-stamp"
        onError={() => setFailed(true)}
        /*
         * 倾斜 -8°：与定案卡那枚 `stamp-press` 的落点角度一致 —— 同一枚印在
         * 两处不会一正一歪。尺寸按封面的 62% 走（`max-h`/`max-w` 一起限），
         * 长边图与方图都不会顶破封面；`object-contain` 保住图案本身的比例。
         *
         * 深色翻一次（与工具栏那几枚同一条理由：图多半是深墨画在透明底上），
         * `hue-rotate-180` 把色相转回来，否则红印在深色下会变青。
         */
        className="max-h-[62%] max-w-[62%] -rotate-[8deg] select-none object-contain opacity-90 shadow-lifted dark:invert dark:hue-rotate-180"
      />
    </div>
  );
}

/**
 * 页脚那格用时。写成 `用时 03:07`：光一个 `03:07` 挨着难度徽章会被读成「时长」
 * 这个字段名都没有的一个数；三个字把「这是这一局的成绩」说清楚。
 */
export function CompletionTime({
  completion,
  className,
}: {
  completion: GameCompletion;
  className?: string;
}): JSX.Element {
  return (
    <span
      data-testid="game-completion-time"
      title={`完成于 ${completion.completedAt.slice(0, 10)}`}
      className={cn('shrink-0 tabular-nums', className)}
    >
      用时 {formatElapsed(completion.elapsedMs)}
    </span>
  );
}
