import { useEffect, useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * v0.7.12：「加载中」从此只有一个长相 —— 品牌字标 LOREDOKU 自己。
 *
 * 改之前的十个加载点画的是同一个东西：Lucide 的 `Loader2` 转圈。它是这套界面里
 * 出现次数最多、辨识度最低的一笔 —— 任何模板都长这样，而它恰好是用户在等待时
 * 唯一盯着看的东西。骨架屏（`Skeleton`）保留：它比转圈更快地说明「内容长什么样」，
 * 这是两种不同的职责，见 `docs/v0.7.12.md` §3。
 *
 * ## 为什么是这八个字母，而不是一圈进度
 *
 * LOREDOKU = 格物。用**产品自己的名字**当状态指示，是这套界面里唯一不需要额外
 * 解释的图形；换成任何抽象符号都得先教会用户它是什么。字形走 `.font-kai`
 * （霞鹜文楷的拉丁，手写衬线）—— 与页标题同一支笔，是「东方 · 手作」在
 * 加载态上的唯一一笔投入。
 *
 * ## 节奏
 *
 * 逐字盖上（`place-pop` 的同一套缓动，0.97 → 1.05 → 1），再由左到右退下去 ——
 * 一道**光的走位**，不是一个全体闪烁的开关。周期 1500ms、字距错开 100ms，
 * 任意时刻亮着大半、暗着三四个，边界在走：看得出在动，但不会催人。
 * 与游戏页「落子」是同一支动作，这不是巧合 —— 都是把一枚字按进格子里。
 *
 * ## 两种尺寸
 *
 * - `LoredokuLoader`：整串字标。占得了地方的地方用它（整屏、弹窗正文、页头状态行）。
 * - `LoredokuTick`：**一格翻牌**。按钮里那一枚 16px 的图标位放不下八个字母，
 *   于是把同一个动作压成一格：L→O→R→…→U 每 180ms 换一个字，读到的是「在动」，
 *   不是「一个字母在闪」。
 *
 * 两者都由 `.loredoku-*` 一组样式驱动（`index.css`），「减少动态」下有静态替代：
 * 字标全亮静止，翻牌格整个收起（静止的单字没有意义）。
 */

const WORD = 'LOREDOKU';

/**
 * 字标里正好藏着 RED —— 第 3–5 个字母（L-O-**R-E-D**-O-K-U）。
 *
 * 品牌资产（`assets/LOREDOKU-logo.svg`）是**黑 + 朱双色墨迹**，图标就是这两色
 * 画的。于是这三个字母也上同一支朱（`#5C2223`，深色下的取值与推导见
 * `index.css` 的 `.loredoku-ink-red`）：字标不再是一串均匀的灰字，而和左上角的
 * 图标对得上。
 *
 * 位置从 `indexOf` 算，不写死 `[2, 3, 4]`：名字若改，红自然跟着走；改完拼不出
 * RED 时 `indexOf` 返回 -1，下面的判断全部不命中 —— 宁可没有红，也不要红在
 * 错的位置上。
 */
const BRAND_RED_AT = WORD.indexOf('RED');
const isBrandRed = (index: number): boolean =>
  BRAND_RED_AT >= 0 && index >= BRAND_RED_AT && index < BRAND_RED_AT + 'RED'.length;

const LETTERS = WORD.split('');

/**
 * 迟到的门槛。**必须与 `index.css` 里 `.load-delayed` 的 `200ms` 一致** ——
 * 这里只用来判断「上一次亮起来是什么时候」，改一处就要改另一处。
 */
const LOAD_DELAY_MS = 200;

/** 手递手的窗口：上一件加载件亮起来之后这么久内出现的下一件，不再迟到。 */
const HANDOFF_MS = 800;

/**
 * 上一次「加载件真的出现在屏幕上」的时刻（v0.7.12 §10）。
 *
 * 为什么需要它：编辑器、查看页、游戏都是**两道门**——先等分包（`router.tsx` 的
 * Suspense），再等数据（页面自己的 `正在加载画布…`）。两道门画的是同一个东西，
 * 却是两个组件实例：第一道门的字标已经淡上来了，第二道门一挂载又从头数 200ms，
 * 中间空出一次闪烁 —— 看起来像加载失败重来了一遍。记一下时间戳，第二道门
 * 直接以成品出现；两道门长得一样、位置一样，换过去就看不出来。
 *
 * 为什么是模块变量而不是 context：这个记忆要跨 **Suspense 边界**（第一道门在
 * 边界外、第二道在页面里），而 context 也是被边界切开的普通树 —— 只能记在
 * 模块作用域。
 *
 * 时间戳只在「真的亮了」之后才写（`delayed` 分支的定时器），不是在挂载时写：
 * 200ms 内就结束的加载从头到尾没被画出来过，它不该算进「刚才已经在等」。
 */
let lastVisibleAt = 0;

/**
 * 返回 `load-delayed`（要迟到）或 `undefined`（接着上一件，直接出现）。
 *
 * `useState` 的初值里读时间戳是安全的：初值函数只读不写，重复执行（StrictMode）
 * 得到同一个答案。写只发生在 effect 里。
 */
function useLoadDelayed(): 'load-delayed' | undefined {
  const [delayed] = useState(() => Date.now() - lastVisibleAt > HANDOFF_MS);

  useEffect(() => {
    if (!delayed) {
      // 手递手的那一件本身就当「已经在屏幕上」，把窗口续上。
      lastVisibleAt = Date.now();
      return;
    }
    const timer = window.setTimeout(() => {
      lastVisibleAt = Date.now();
    }, LOAD_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [delayed]);

  return delayed ? 'load-delayed' : undefined;
}

/** 逐字错开的节拍：靠 `style` 里的 `--i` 传给 CSS 的 `animation-delay`。 */
type LetterStyle = CSSProperties & { '--i': number };

export type LoredokuLoaderSize = 'sm' | 'md' | 'lg';

/**
 * 三个尺寸的类名必须写成**字面量**。
 *
 * `loredoku-word--${size}` 这种模板串在源码里出现的是 `${size}`，Tailwind 的
 * 扫描器只会看到 `loredoku-word--`，三档 `font-size` 会被当成未使用的自定义
 * 工具类**整段删掉** —— 构建不报错，运行时字标全部退回 16px。这一类静默失败
 * 在这个仓库里已经记过两次（v0.7.9 的 `shadow-[var(--x)]`、v0.7.10 的
 * `animate-in` 时长压不动），所以这里用表把它们钉死。
 */
const SIZE_CLASS: Record<LoredokuLoaderSize, string> = {
  sm: 'loredoku-word--sm',
  md: 'loredoku-word--md',
  lg: 'loredoku-word--lg',
};

/**
 * 整串字标。`role="status"` + `aria-label`：屏幕阅读器读「加载中」，
 * 八个字母本身是装饰（`aria-hidden`），不该被逐个念出来。
 *
 * `load-delayed`：**200ms 内结束的加载，字标一帧都不画**（来历见 `index.css`
 * 的 `load-appear`）。本地接口多数 20–80ms 就回来，画出来只会是一帧闪现 ——
 * 那种闪烁比没有提示更糟，因为每一次都像是点错了。
 */
export function LoredokuLoader({
  size = 'md',
  className,
}: {
  size?: LoredokuLoaderSize;
  className?: string;
}): JSX.Element {
  return (
    <span
      role="status"
      aria-label="加载中"
      className={cn('loredoku-word', useLoadDelayed(), SIZE_CLASS[size], className)}
    >
      {LETTERS.map((letter, index) => (
        <span
          key={index}
          aria-hidden
          className={cn('loredoku-word__l', isBrandRed(index) && 'loredoku-ink-red')}
          style={{ '--i': index } as LetterStyle}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/**
 * 按钮里的那一格。高度跟着按钮字号走（`1.1em`），所以 `text-sm` 的按钮里是
 * 16px、`text-xs` 的是 14px —— 与它替换掉的那枚 `h-4 w-4` 图标宽度相当，
 * 按钮进入 pending 时不会横向跳一下。
 *
 * 这里**不给** `role="status"`：它永远和「保存中… / 部署中…」这种文案同时出现，
 * 文案已经把状态说完了；再挂一个 live region 只会在同一句话上叠一层
 * 「处理中」。它是纯装饰，`aria-hidden`。
 *
 * 也**不跟着字标把 R-E-D 染红**：这一格落在按钮里，颜色是 `currentColor` ——
 * 实底按钮上那意味着「靛蓝底上的米白字」，换成朱墨会在靛蓝上直接消失
 * （对比度 2:1 不到）。对比度由按钮自己的配色负责，字标那三个红字只在纸面上
 * 说话。
 *
 * 也**不迟到**（没有 `load-delayed`）：它出现的那一刻，按钮文案已经同时变成
 * 「保存中…」了 —— 这一格晚 200ms 再冒出来，只会让标签先短后长地跳一下，比
 * 闪一下更难解释。按钮的防闪若要做，该做在「文案换不换」那一层（`isPending`
 * 的判定），不是在这一格的样式上。
 */
export function LoredokuTick({ className }: { className?: string }): JSX.Element {
  return (
    <span aria-hidden className={cn('loredoku-tick', className)}>
      {LETTERS.map((letter, index) => (
        <span
          key={index}
          className="loredoku-tick__l"
          style={{ '--i': index } as LetterStyle}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}

/**
 * 行内状态：一格翻牌 + 一句话。页头的状态行、弹窗底部的「正在处理…」用它。
 *
 * 为什么这一处不用整串字标：它左右都有文字（左边是标题或按钮，右边是正文），
 * 一串 14px 的字标插进去会把一行读成两行。字标是「这一整块都在加载」的语言，
 * 行内只该有一个节拍。
 */
export function InlineLoading({
  caption,
  className,
}: {
  caption: string;
  className?: string;
}): JSX.Element {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-2 text-xs text-muted-foreground',
        useLoadDelayed(),
        className,
      )}
    >
      <LoredokuTick />
      {caption}
    </span>
  );
}

/**
 * 弹窗正文、面板里的加载区：字标在上，一句话在下。
 *
 * 那句话只在**能说出更具体的东西**时才给（「正在加载已发布的地图版本…」），
 * 否则留白 —— 「正在加载…」四个字只是把动效已经说完的话又说了一遍。
 */
export function LoadingBlock({
  caption,
  size = 'md',
  className,
}: {
  caption?: string;
  size?: LoredokuLoaderSize;
  className?: string;
}): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2.5 text-center',
        useLoadDelayed(),
        className,
      )}
    >
      <LoredokuLoader size={size} />
      {caption ? <p className="text-xs text-muted-foreground">{caption}</p> : null}
    </div>
  );
}

/**
 * 整屏加载：地图 / 谜题 / 游戏三处此前各写了一遍「转圈 + 一句话」，
 * 连 className 都一字不差。现在它们共用一个。
 *
 * 三层都按同一套判定挂 `load-delayed`（`useLoadDelayed`），但真正跑动画的只有
 * 最外面这一层（`index.css` 的 `.load-delayed .load-delayed { animation: none }`）
 * —— 同节奏的 opacity 叠三层，中段会慢得像没对齐。
 */
export function LoadingScreen({ caption }: { caption?: string }): JSX.Element {
  return (
    <div className={cn('flex h-screen items-center justify-center', useLoadDelayed())}>
      <LoadingBlock size="lg" caption={caption} />
    </div>
  );
}
