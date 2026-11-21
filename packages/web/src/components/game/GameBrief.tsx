import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/** v0.7.14（docs/v0.7.14.md §4）：左栏「题面」= 描述 + 全局线索，排标题下、名册上且中间不画线（同一段话的段落）；左边距 16px 与标题行对齐。 */
export function GameBrief({
  description,
  clues,
  hideDescription = false,
}: {
  /** 谜题描述；空串 = 不显示这一段。 */
  description: string;
  /** 全局线索（可能夹着旧数据里的空串，这里再滤一次）。 */
  clues: string[];
  /** 只画线索不画描述：竖屏时描述挪进右上角弹框，把高度让给线索与名册。 */
  hideDescription?: boolean;
}): JSX.Element | null {
  const text = description.trim();
  const entries = clues.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  const showDescription = !hideDescription && text.length > 0;
  // 没有描述也没有线索 → 整块不出现，标题和名册之间不留一段空白。
  if (!showDescription && entries.length === 0) return null;

  return (
    <section
      data-testid="game-brief"
      aria-label="题面"
      /* 竖屏留一点上边距（否则首张纸条像被切了一半）；竖屏由外层统一滚，这里放开限高与滚动条，否则线索与名册要滚两遍。 */
      className="max-h-[min(24svh,220px)] shrink-0 overflow-y-auto pb-3 pl-4 pr-3 sm:max-h-[min(46vh,340px)] max-md:pt-3 portrait:max-md:max-h-none portrait:max-md:overflow-visible"
    >
      {showDescription ? <BriefDescription text={text} /> : null}
      {entries.length > 0 ? (
        <ol className={cn('space-y-2', showDescription && 'mt-2.5')}>
          {entries.map((entry, index) => (
            <li
              key={index}
              data-testid="game-brief-clue"
              /* 纸条：外框 + 纸影、无序号（并列条件）；错峰 45ms / 封顶 6 条；悬停抬 2px 换抬升影子 180ms —— 不是按钮，不加手型、主色与放大。 */
              style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
              className={cn(
                /* 按字宽收身（w-fit）并居中：撑满栏宽会像表格行；max-w-full 让长线索换行。 */
                'clue-note mx-auto w-fit max-w-full rounded-md border bg-card px-2.5 py-1.5',
                'text-center text-xs leading-[1.7] text-foreground/90 shadow-paper',
                'transition-[box-shadow,transform] duration-base ease-out',
                'hover:-translate-y-0.5 hover:shadow-lifted',
              )}
            >
              {entry}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/* 默认收三行；只在收起态量 `scrollHeight > clientHeight`，没溢出就不挂按钮 —— 展开后量会把按钮永久弄丢。 */
function BriefDescription({ text }: { text: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  const measure = useCallback((): void => {
    if (expanded) return;
    const node = ref.current;
    if (!node) return;
    setOverflows(node.scrollHeight > node.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    measure();
    if (typeof window === 'undefined') return;
    window.addEventListener('resize', measure);
    // 侧栏宽度跟着参与者列数变（`rosterPanelWidthFor`）：窗口没动，文字也可能重新换行。
    const node = ref.current;
    const observer =
      node && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    observer?.observe(node as Element);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [measure, text]);

  const collapsed = !expanded;

  return (
    <>
      {/* 保留作者换行与连续空白；收起态必须先 clamp 三行再量 —— 先量时 scrollHeight === clientHeight，永远判为放得下。 */}
      <p
        ref={ref}
        data-testid="game-brief-description"
        data-collapsed={collapsed && overflows ? 'true' : undefined}
        className={cn(
          'whitespace-pre-wrap text-xs leading-[1.75] text-muted-foreground',
          collapsed && 'line-clamp-3',
        )}
      >
        {text}
      </p>
      {expanded || overflows ? (
        /* 纯文字开关、靠右（否则读成正文第四行）；必须单独放开 `pointer-events-auto` —— 定案后整条左栏不接指针。 */
        <button
          type="button"
          data-testid="game-brief-description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            'pointer-events-auto ml-auto mt-1 flex w-fit items-center gap-0.5 text-2xs text-muted-foreground',
            'transition-colors duration-fast ease-out hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          {expanded ? '收起' : '展开全文'}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      ) : null}
    </>
  );
}
