import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
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
 * 印的角度固定在 **−8°**，与 v0.9.3 定案卡那枚 `stamp-press` 停下的角度一致 ——
 * 同一枚印在两处不会一正一歪。
 */

/**
 * 印章本体。`animate` 打开时挂 `stamp-press`（从大到正、带一点转正的回弹）；
 * 卡片上不播 —— 列表里的印是**既成事实**，不是刚盖上去的。
 */
export function VerdictStamp({
  stampUrl,
  animate = false,
  className,
}: {
  stampUrl: string | null;
  animate?: boolean;
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
       * 深色翻一次（与工具栏那几枚同一条理由：图多半是深墨画在透明底上），
       * `hue-rotate-180` 把色相转回来，否则红印在深色下会变青。
       */
      className={cn(
        '-rotate-[8deg] select-none object-contain opacity-90 dark:invert dark:hue-rotate-180',
        animate && 'stamp-press',
        className,
      )}
    />
  );
}

/**
 * 「定案」两个字在上、印章在下的**竖排居中** —— 卡片封面与地图遮罩共用这一个
 * 组件、同一个排法（用户：「上面展示和谜题卡片一样的定案+印章（位置也相同）」）。
 *
 * 两处都盖在一张图（封面 / 棋盘）上、都居中；分两套排法迟早会在某一版里走样。
 * 文字用楷体、加宽字距：与结算卡标题同一个写法（v0.9.3 §3 定下「定案」是
 * 一局结束的说法，不再念成绩）。
 *
 * `large` 给地图遮罩用（棋盘比 291px 的卡大得多），但**比例与次序不变**。
 */
export function VerdictMark({
  stampUrl,
  animate = false,
  large = false,
  className,
}: {
  stampUrl: string | null;
  animate?: boolean;
  large?: boolean;
  className?: string;
}): JSX.Element {
  return (
    <div
      data-testid="verdict-mark"
      className={cn('flex flex-col items-center justify-center gap-2', className)}
    >
      <span
        className={cn(
          'font-kai font-semibold tracking-[0.3em] text-foreground',
          large ? 'text-5xl' : 'text-lg',
        )}
      >
        定案
      </span>
      <VerdictStamp
        stampUrl={stampUrl}
        animate={animate}
        /*
         * 卡片上印占封面的 46%，遮罩上按同样的「长边不超过容器一半」放大 ——
         * 两处的相对大小与次序一致。不写死 `h/w`：那会让 max-* 与固定尺寸互相
         * 打架（印被压成一小块），也让长边图与方图都保不住比例。
         */
        className={cn(
          'max-h-[46%] max-w-[46%]',
          /* 给一个保底尺寸：没有它 `<img>` 会按原图像素渲染，长边图可能缩成一小块。 */
          large ? 'h-48 w-48' : 'h-24 w-24',
        )}
      />
    </div>
  );
}
