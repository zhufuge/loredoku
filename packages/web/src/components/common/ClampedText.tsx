import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * 被截断的长文本（v0.7.12）。
 *
 * 谜题 / 地图卡片上的「描述」是 `line-clamp-2`，列表行上是单行省略 —— 版式上
 * 必须如此（一块卡片的高度不能被一段随手写的说明撑开），但**读不到全文**是
 * 实打实的损失：作者写描述就是为了让人看。
 *
 * 这里把「看不全」变成一件可以点开的事：
 *
 * 1. **只有真的溢出才提示**。`scrollHeight > clientHeight`（或横向）比较一次，
 *    够放的时候什么都不挂 —— 否则每一个短描述都会在悬停时弹出一片和原文一字
 *    不差的浮层，那不是帮助，是噪音。
 * 2. **鼠标悬停 / 键盘聚焦**走全站统一的那只 `Tooltip`（320ms 延迟、纸片外观）。
 * 3. **触摸**没有 hover，所以抬手时直接打开，点空白处关闭。判据是
 *    `pointerType !== 'mouse'`：触屏、触控笔都算「触碰」，桌面鼠标不算。
 * 4. 重新测量挂在 `resize` 上：视口变宽后同一段文字可能不再溢出，那时提示
 *    就该消失（浮层也一起关掉）。
 *
 * 组件只负责渲染**文本**，不接管点击 —— 卡片封面那一下跳转仍在父级手里。
 */
const CLAMP_CLASS: Record<number, string> = {
  1: 'line-clamp-1',
  2: 'line-clamp-2',
  3: 'line-clamp-3',
};

export function ClampedText({
  text,
  lines = 2,
  className,
}: {
  text: string;
  /** 最多显示几行（1 行 = 单行省略，用于列表行）。 */
  lines?: 1 | 2 | 3;
  className?: string;
}): JSX.Element {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [clipped, setClipped] = useState(false);
  const [open, setOpen] = useState(false);

  const measure = useCallback((): void => {
    const node = ref.current;
    if (!node) return;
    const over =
      node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
    setClipped(over);
    // 不再溢出时把浮层收掉：留着它就是在展示一段已经看得见的文字。
    if (!over) setOpen(false);
  }, []);

  useEffect(() => {
    measure();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', measure);
    /**
     * `resize` 只覆盖窗口变化；同一页里卡片被挤窄（列表/网格切换、侧栏开合）
     * 时窗口尺寸没变，文字却可能从「放得下」变成「放不下」。节点自己的
     * `ResizeObserver` 才是真正的判据。
     */
    const node = ref.current;
    const observer =
      node && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(node as Element);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure, text]);

  const onPointerUp = (event: PointerEvent<HTMLSpanElement>): void => {
    if (!clipped) return;
    // 鼠标有 hover，抬手不该把浮层钉住；触摸没有 hover，抬手就是「我要看」。
    if (event.pointerType === 'mouse') return;
    setOpen(true);
  };

  const body = (
    <span
      ref={ref}
      className={cn(CLAMP_CLASS[lines] ?? CLAMP_CLASS[2], className)}
      // 给测试与样式一个「这条真的被截了」的锚点，也方便将来按需加下划线提示。
      data-clipped={clipped ? 'true' : undefined}
      onPointerUp={onPointerUp}
    >
      {text}
    </span>
  );

  /**
   * 无论是否溢出都包在 `Tooltip` 里 —— 让 `span` 这个 DOM 节点稳定存在。
   * 一旦在「裸 span / 触发器里的 span」之间切换，切换本身会重挂载节点，而
   * 我们刚刚量到的那对 `scrollHeight / clientHeight` 会随着旧节点一起丢掉。
   * 没溢出时 `onOpenChange` 直接吞掉「打开」请求：效果与不挂载相同。
   */
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (next && !clipped) return;
        setOpen(next);
      }}
    >
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      {clipped ? (
        <TooltipContent side="bottom" className="max-w-sm whitespace-pre-wrap leading-relaxed">
          {text}
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}
