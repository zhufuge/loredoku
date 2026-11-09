import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * 长按进度：按钮**方块内**的扇形扫描（v0.9.2 §5）。
 *
 * 清除按钮（「长按清空全部」）原本和棋格共用 `PressRing` 那一圈细环。棋格上
 * 环是对的 —— 那是一格空白，环正好沿着格子边画。按钮上不是：48px 高的方块里
 * 已经塞了一枚 32px 的图标，再套一圈 40px 的环，两者抢的是同一块地方，环一
 * 出现，图标就被圈住了，读成「这枚按钮坏了」而不是「正在按住」。
 *
 * 所以这里换一种画法：不画环，改往**按钮自己的方块**里填色。扇形从 12 点开始
 * 顺时针扫，扫满 360° 才执行 —— 该说的三件事一件没少：
 *   - **按下已被识别**（有面积在长出来）；
 *   - **还差多久**（扫过的角度）；
 *   - **现在松手会取消**（扇形停下并消失 —— 取消靠卸载）。
 *
 * ## 为什么是 `conic-gradient` + 一条注册过的自定义属性
 *
 * 扇形在 CSS 里只有一个现成的画法：锥形渐变切一刀。切点就是
 * `--press-sweep-angle`，它注册成 `<angle>`（见 `index.css` 顶部），于是
 * 浏览器能对它插值 —— 关键帧把 0deg 推到 360deg，扇形一帧一帧长出来。
 * 没注册的话自定义属性只是一串 token，动画会在终点直接跳。
 *
 * 这一点和 `PressRing` 不同：环动的是 SVG 呈现属性，跑在合成线程上；这里每帧
 * 重画渐变，是主线程的活。方块不到 100×48、渐变只有两个色标、只在按住的
 * 340ms 里存在，代价可以接受 —— 换成逐帧 `setState` 才是不能接受的那个。
 *
 * ## 线性、不用缓动
 *
 * 与环同一条理由：扫过的角度就是「剩余等待时间」。全站其他动效都指数减速，
 * 唯独倒计时不能 —— 缓动会让前段跑得快、后段拖住，用户读到的时间比实际短。
 *
 * ## 取消即卸载
 *
 * 抬手 / 指针移出时页面把 `clearPress` 置空，组件随之卸载，动画自然消失。
 * 不做「倒着扫回去」的收尾：那会读成「刚才那一下还算数吗」。
 *
 * 本层不接指针事件，长按判定仍由按钮自己负责。
 */
interface PressSweepProps {
  /** 与页面上的定时器保持一致 —— 扫满 360° 的那一刻，动作刚好发生。 */
  durationMs: number;
  /**
   * 重启动画的依据。React 只在它变化时重建这个节点，从而让 CSS 动画从头播。
   * 连按两次必须给出不同的值。
   */
  seq: number | string;
  /** 扇形颜色。默认是主色的半透明，压在按钮底上，不遮图标。 */
  color?: string;
  className?: string;
}

export function PressSweep({
  durationMs,
  seq,
  color = 'hsl(var(--primary) / 0.28)',
  className,
}: PressSweepProps): JSX.Element {
  return (
    <span
      /*
       * `key` 换掉就重建节点 —— 这是让同一条 CSS 动画从头播的最省事的办法，
       * 与 `PressRing` 里给 `<circle>` 挂 `key` 是同一个手法。
       */
      key={seq}
      aria-hidden="true"
      data-testid="press-sweep"
      /*
       * `rounded-[inherit]`：跟着按钮自己的圆角走。写死 `rounded-md` 在别的
       * 尺寸档上会对不上，扇形就会从方块角上溢出去一小块。
       * `pointer-events-none`：长按判定在按钮身上，这层只是画。
       */
      className={cn(
        'press-sweep pointer-events-none absolute inset-0 rounded-[inherit]',
        className,
      )}
      style={
        {
          '--press-sweep-duration': `${durationMs}ms`,
          /*
           * 不加 `from`：锥形渐变的默认起点就是 12 点钟方向，正好是钟面读数
           * 的起点。这里**不能**照抄环那边的 `rotate(-90)` —— 环是 SVG，
           * 圆形路径的 0° 在 3 点钟方向，所以它要转 -90° 才回到 12 点；
           * 而渐变天生就从上往下数，再转 -90° 会跑到 9 点钟去（实测过）。
           *
           * 第二个色标写 `0`：它比前一个停点小，会被夹到前一个停点上 ——
           * 于是得到「0 到 angle 实色、angle 到 360 透明」的一刀切，中间不会被
           * 插值成半透明的拖尾。
           */
          background: `conic-gradient(${color} var(--press-sweep-angle, 0deg), transparent 0)`,
        } as CSSProperties
      }
    />
  );
}
