import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * v0.10.2：两个字**竖着排**（定在上、案在下）—— 用户「'定案' 2字改为竖着排列，
 * 印章靠右一点」。竖排之后这一块从「宽的两字」变成「窄的一列」，印就有了贴在
 * 右侧的余地，不必再压在字心上：印整体往右推、往上让，落在字列的右下角。
 * 卡片封面与地图遮罩共用这一个组件，所以两处一起竖。
 *
 * v0.9.6：**定案 + 印章** —— 一局结案的那一张标记，三处共用：
 *
 * | 位置 | 表现 |
 * |---|---|
 * | 游戏列表卡片封面 | 大面积蒙版 + 倾斜的印 |
 * | 校验通过后的地图遮罩 | 地图方格被蒙住，定案与印居中 |
 * | 已完成再进入的那张遮罩 | 同上，另外多一颗「再玩一次」 |
 *
 * 三处必须是**同一张脸**：玩家在列表上认出的那枚印，进关卡后盖上来的也得是它。
 * 所以这里只管画，位置与动画交给调用方（遮罩里居中、卡片里撑满封面）。
 *
 * v0.9.8：**字**按用途分两档 —— 卡片上（`onDark === false`）半透明 + 与印同一个
 * −14°；遮罩上（`onDark`）近白、不倾斜，那是结论本身，要看得清。印始终是原色、
 * 始终 −14°。
 *
 * 印的角度固定在 **−14°**（v0.9.8 从 −8° 再斜一点），与 `index.css` 里
 * `stamp-press` 收尾帧一致 —— 同一枚印在两处不会一正一歪。
 */

/**
 * 印章本体。`animate` 打开时挂 `stamp-press`（从大到正、带一点转正的回弹）；
 * 卡片上不播 —— 列表里的印是**既成事实**，不是刚盖上去的。
 */
export function VerdictStamp({
  stampUrl,
  animate = false,
  offset,
  className,
}: {
  stampUrl: string | null;
  animate?: boolean;
  /**
   * v0.9.8：整体推移（px），挂在 `translate` 属性上 —— 与 `transform`
   * （`-rotate` 类与 `stamp-press` 关键帧）正交，两者叠加而不是互相覆盖。
   */
  offset?: { x: number; y: number };
  className?: string;
}): JSX.Element | null {
  /**
   * 地址可能已经不在了：作者换过那枚图、包重新导出过（`files/icons/` 里的文件名
   * 带着关卡 key，重新导出不一定同名）。加载失败就**静默不画**，不留破图标。
   */
  const [failed, setFailed] = useState(false);
  if (!stampUrl || failed) return null;

  return (
    <img
      src={stampUrl}
      alt=""
      draggable={false}
      data-testid="verdict-stamp"
      onError={() => setFailed(true)}
      /*
       * v0.9.7：**印章保持原色**（用户明确要求）。
       *
       * 之前按主题 / 遮罩翻过色（`dark:invert` / `brightness-0 invert`），那是为了
       * 深墨印在深底上能看清；但一枚红印被翻成白色就不再是作者盖的那枚了。
       * 两处（列表卡片的浅底、游戏遮罩的深底）现在都用同一张原图、同一个角度，
       * 不随主题变。深底上的可读性交给印自己的透明底与下面那层字衬。
       */
      className={cn(
        /* v0.9.8：再斜一点（−8° → −14°）。角度同时写在 `index.css` 的
           `@keyframes stamp-press` 收尾帧里，两处必须一致，否则「有没有动效」
           会停成两个不同的角度。 */
        '-rotate-[14deg] select-none object-contain',
        animate && 'stamp-press',
        className,
      )}
      style={offset ? { translate: `${offset.x}px ${offset.y}px` } : undefined}
    />
  );
}

/**
 * 「定案」两个字**竖着**排成一列、印章贴在它右侧**压住一点点字**（v0.10.2）。
 *
 * v0.9.7 起这一段是「字在上、印在下」，印用负 `margin-top` 压住字的下缘。
 * 用户 v0.10.2：「'定案' 2字改为竖着排列，印章靠右一点」—— 竖排之后字列只有
 * 一个字宽，横向反而空出来了，印就顺势挪到字的右边（负 `margin-left` 压住字列
 * 右缘），读起来是「一张竖写的条幅右下角盖了印」。
 *
 * 卡片封面与地图遮罩共用这一个组件、同一个排法（用户 v0.9.6：「位置也相同」）。
 * `large` 给地图遮罩用（棋盘比 291px 的卡大得多），但**比例与次序不变**。
 *
 * 做法：容器排成一行，文字列（`writing-mode: vertical-rl`）与印各自居中，印用
 * 负 `margin-left` 往字的右缘压过去；角度仍是 −14°。压过去的量按字号比例走（em），
 * `large` 与卡片两处因此自动同比例叠压。
 *
 * v0.9.7（第六批）：字再放大一档、印上提更多 —— 用户「定案字体大小可以再大一些，
 * 印章使用原色压在字上。列表卡片封面也一样」。两处都走这个组件，所以一起生效。
 */
export function VerdictMark({
  stampUrl,
  animate = false,
  large = false,
  onDark = false,
  stampOffset,
  shift,
  scale = 1,
  className,
}: {
  stampUrl: string | null;
  animate?: boolean;
  large?: boolean;
  /** v0.9.7：压在深色遮罩上时文字要用浅色，否则「定案」两个字会糊进黑底。 */
  onDark?: boolean;
  /**
   * v0.10.0：整体等比缩小（默认 1 = 原样）。手机上的棋盘只有 250 上下，
   * 桌面那套 128px 的字会顶出遮罩、印也会偏到棋盘外 —— 调用方按棋盘边长
   * 算一个比例传进来，字、印、偏移一起缩，相对位置一点都不变。
   *
   * 缩的是**外面这一层**，且用的是 `zoom` 而不是 `transform: scale`：
   * `transform` 会被印自己那条 `stamp-press` 关键帧整条覆盖（关键帧写的就是
   * 整条 `transform`），而且它只缩视觉、不缩盒子 —— 遮罩里 `gap-6` 排下来的
   * 按钮会停在按原尺寸算的位置上。`zoom` 连布局尺寸一起缩，两样都省了。
   */
  scale?: number;
  /**
   * v0.9.8：把**印章**（不动文字）整体推移，如 `{ x: 150, y: -50 }`（px）。
   *
   * 用 `translate` 属性而不是 `transform`：`stamp-press` 的关键帧写的就是整条
   * `transform`（`scale` + `rotate`），挂在那上面会被覆盖，印会先跳回原位再弹。
   * `translate` 与 `transform` 正交，两者叠加。
   */
  stampOffset?: { x: number; y: number };
  /**
   * v0.10.2：把**整块**（字 + 印）一起推移，如 `{ x: 40 }`（px）—— 用户
   * 「排版整体再靠右一些」。与 `stampOffset` 分开：那个只挪印、字不动，
   * 这个是字与印的相对位置不变、整体平移。
   *
   * 同样走 `translate` 属性：外层还有 `zoom`（内联 `style`），两者互不干扰；
   * 而 `transform` 会被印的 `stamp-press` 关键帧那条占着。
   */
  shift?: { x: number; y?: number };
  className?: string;
}): JSX.Element {
  return (
    <div
      data-testid="verdict-mark"
      /*
       * v0.10.2：由「竖着摞两块」改成「横着排两块」—— 左边是一列竖写的字，
       * 右边是印。`items-center` 让印在字列里纵向居中，横向靠负 margin 压过去。
       */
      className={cn('relative flex items-center justify-center', className)}
      style={
        scale === 1 && !shift
          ? undefined
          : {
              ...(scale === 1 ? null : { zoom: scale }),
              ...(shift ? { translate: `${shift.x}px ${shift.y ?? 0}px` } : null),
            }
      }
    >
      <span
        className={cn(
          /*
           * v0.9.8：**两个字要真的粗**。
           *
           * `.font-kai` 里写着 `font-synthesis-weight: none`（v0.7.9 的理由是
           * 「文楷只有 400 一档，糊边加粗像劣质国风」），所以光挂 `font-bold` 是
           * 无效的 —— 字重照样 400。这里对这一处显式放开合成粗体：定案是印上去的
           * 两个大字，细笔压不住印章，也撑不起这一屏的分量。其余用文楷的地方
           * （页标题、名册、正文）不受影响。
           */
          'relative z-0 font-kai font-bold [font-synthesis-weight:auto] tracking-[0.25em]',
          /*
           * v0.10.2：**竖排**。用 `writing-mode` 而不是把字拆成两个 `<span>`：
           * 拆开就得自己管两行之间的行距（`leading`），而这里要的恰好是
           * `tracking-[0.25em]` 那点字距 —— 竖排之下它自动作用在「定」「案」
           * 之间，一行代码就够，字数若变多也不会折错。
           *
           * `whitespace-nowrap` 是**必须**的：竖排的换行方向是「换到左边一列」，
           * 字距一撑、盒子一矮，两个字就并排成两列了（实测正好如此：`定` 在右列、
           * `案` 在左列）。禁掉换行，两个才老实上下叠。
           */
          '[writing-mode:vertical-rl] whitespace-nowrap',
          /*
           * v0.9.7：压在固定深色遮罩（bg-black/60）上的字必须**始终浅色**。
           * 不能单用 text-foreground（浅色主题下是墨色）或 text-background
           * （深色主题下也是墨色）—— 那正是 index.css §"光照两端"注释里说的
           * 「主题 token 会让方向随主题反转」。
           *
           * 两档各自取该主题下的近白：
           *   浅色主题 → --primary-foreground (40 30% 98%)
           *   深色主题 → --foreground        (38 20% 92%)
           *
           * v0.9.8：**列表卡片**上的字改成半透明（40%），并跟印章同一个角度 ——
           * 那是蒙在封面上的一个印迹，不是一条要读的标题。遮罩里的那两处保持
           * 原样：结案那一刻「定案」就是结论本身，要看得清。
           */
          onDark
            ? 'text-primary-foreground dark:text-foreground'
            : 'text-foreground/40',
          !onDark && '-rotate-[14deg]',
          /* v0.9.8：再放大一档（遮罩 8xl → 9xl，卡片 5xl → 7xl）。 */
          large ? 'text-9xl' : 'text-7xl',
        )}
      >
        定案
      </span>
      <VerdictStamp
        stampUrl={stampUrl}
        animate={animate}
        offset={stampOffset}
        /*
         * `z-10` 压在字之上，`-ml-[0.55em]` 往左压住字列的右缘（v0.9.7 第六批
         * 定的是 0.35em → 0.55em；v0.10.2 字改成竖排之后，压的轴从「上提」换成
         * 「左压」，量沿用同一个 em，两档字号仍然同比例叠压）。没有配图时
         * 这个元素不渲染，文字自己居中，不会留下一段空白。
         */
        className={cn(
          'relative z-10 -ml-[0.55em] max-h-[52%] max-w-[52%]',
          /* 给一个保底尺寸：没有它 `<img>` 会按原图像素渲染，长边图可能缩成一小块。 */
          large ? 'h-48 w-48' : 'h-24 w-24',
        )}
      />
    </div>
  );
}
