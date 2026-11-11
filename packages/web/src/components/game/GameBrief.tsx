import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * v0.7.14（docs/v0.7.14.md §4）：游戏页左栏的「题面」—— 描述 + 全局线索。
 *
 * **它排在标题下面、名册上面，中间不画线。** 玩家进一局要按同一个顺序知道三件事：
 * 这是哪一局（标题）→ 这一局想让我做什么（描述）→ 这一局比基本规则多出了什么
 * 条件（线索）→ 这些人各自该站哪儿（名册）。它们是**同一段话的四个段落**，不是
 * 四个区域；一条横线会把「条件」和「人」切开，可线索说的正是这些人该怎么站。
 *
 * 为什么不再浮在画布上（v0.7.14 初稿是一张压在盘面左上角的纸片）：那张纸要么
 * 盖住玩家最常看的一角，要么被收起 —— 两种都得付代价。而左栏本来就空着一段：
 * 题面钉在名册**上方**，名册自己滚动，两边都不用让位。
 *
 * 左边距 16px —— 不是随手写的：标题行是 `p-3` + `pl-1`，游戏名正好落在 16px；
 * 描述若从 12px 起头，4px 的错位在五行文字旁边会读成「没对齐」。
 */
export function GameBrief({
  description,
  clues,
  hideDescription = false,
}: {
  /** 谜题描述；空串 = 不显示这一段。 */
  description: string;
  /** 全局线索（可能夹着旧数据里的空串，这里再滤一次）。 */
  clues: string[];
  /**
   * v0.10.1：只画线索、不画描述。
   *
   * 竖屏上描述曾经占掉面板一半高度（三行 clamp 也要 60px），而它只在开局时
   * 读一遍 —— 挪进右上角那枚图标后面的弹框，面板就能把高度全给线索与名册。
   * 线索是解题时反复要看的，仍留在原地。
   */
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
      className="max-h-[min(24svh,220px)] shrink-0 overflow-y-auto pb-3 pl-4 pr-3 sm:max-h-[min(46vh,340px)]"
    >
      {showDescription ? <BriefDescription text={text} /> : null}
      {entries.length > 0 ? (
        <ol className={cn('space-y-2', showDescription && 'mt-2.5')}>
          {entries.map((entry, index) => (
            <li
              key={index}
              data-testid="game-brief-clue"
              /*
               * 每条线索是一张**纸条**：外框 + 静置纸影，落在左栏的纸面上。
               *
               * 序号去掉了：纸条本身一条一条地摞着，边界已经说明「换了一条」；
               * 再给 1 / 2 / 3，读起来像步骤，而它们是**同时成立的条件** ——
               * 顺序是作者的写法，不是解题的次序。
               *
               * 错峰 45ms、封顶 6 条（再往后一起落）：八条同时冒出来只能读到
               * 「一堆」，错开才数得清有几条；封顶是为了不让最后一条等太久。
               *
               * 悬停抬起 2px、纸影换成 `shadow-lifted`（v0.7.14 §4.3 补充，作者
               * 要的）。它**不是按钮**，所以只做物理动作：没有 `cursor-pointer`、
               * 没有主色描边、没有放大 —— 那三样才是 v0.7.10 删掉的那批假交互
               * 用来承诺「点下去会发生点什么」的手势。影子加深 + 一两像素的位移
               * 读作「这张纸被抬起来一点」，用的还是它落下时那套纸的语言。
               *
               * 180ms（`duration-base`）而不是 120ms：这段位移只有 2px，太快会像
               * 抖动；和入场那 260ms 也接得上。
               */
              style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
              className={cn(
                /*
                 * v0.7.14：纸条**按自己的字宽收身**，在栏里居中，文字也居中。
                 *
                 * 之前它撑满 228px 的栏、文字靠左 —— 一条十几字的线索右边会空出
                 * 半张纸，读起来像「表格里的一行」。收成 fit-content 之后它就是一张
                 * 标签：长短由内容决定，摆在正中间。`max-w-full` 留给长线索，让它
                 * 换行而不是溢出到名册上去。
                 */
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

/**
 * 描述可折叠（v0.7.14 §4.3）。
 *
 * 描述上限 500 字，在 228px 的栏里能占 28 行 —— 名册得让路，但「让」到什么程度
 * 不该由作者的字数决定。所以默认收到三行（`line-clamp-3`），想读全文的点一下。
 *
 * **只有真的溢出才挂按钮**：`scrollHeight > clientHeight` 量一次（`line-clamp`
 * 在 Chrome 下 `scrollHeight` 仍是整段的高度，这个判据成立）。短描述不会挂一个
 * 点了没反应的「展开全文」。
 *
 * 量的时候**只在收起态量**：展开后 `clientHeight` 等于全文高度，量出来的结论是
 * 「没溢出」，按钮就会消失 —— 然后再也收不回去。所以 `expanded` 为真时直接跳过；
 * 代价是展开着的时候窗口变化不会重判，而侧栏宽度本来只随参与者列数变。
 */
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
      {/*
       * 描述是**作者的话**：颜色退一档、行距松一点，先把这一局讲清楚。
       * `whitespace-pre-wrap` 保住作者自己敲的换行 —— 说明里的分段是有意义的。
       *
       * **收起态一律上 `line-clamp-3`，不先问「会不会溢出」。** 先问的话就是个
       * 死循环：没 clamp 时 `scrollHeight === clientHeight`，量出来永远是「放得下」，
       * 于是永远不 clamp —— 四行长文就那么摊着（第一版实测就是这样）。三行以内的
       * 短描述被 clamp 也没有任何变化，所以「先夹上、再量」才是最省事的顺序。
       */}
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
        /*
         * 一枚文字的开关，不做按钮外观：描述本身就是正文，给它加边框反而把一段话
         * 切成两块。**靠右**是关键 —— 贴着正文左边缘、行距又和正文一样时，「展开
         * 全文」会被读成第四行（第一版实测就是这样）；推到右边，它才从行文里出来，
         * 站到「更多」这个位置上。
         */
        <button
          type="button"
          data-testid="game-brief-description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
          className={cn(
            'ml-auto mt-1 flex w-fit items-center gap-0.5 text-2xs text-muted-foreground',
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
