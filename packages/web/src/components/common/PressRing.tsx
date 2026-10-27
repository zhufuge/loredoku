import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * 长按进度环（v0.7.11）。
 *
 * 这个仓库里有两处「按住才生效」的手势：棋格上按住 500ms 放头像（SPEC-J02），
 * 清除按钮上按住 500ms 清空全部（SPEC-G04）。两处此前都只有结果、没有过程 ——
 * 手指或鼠标按住之后界面一动不动，用户无法判断「还要按多久」「现在松手算不算」，
 * 只能凭感觉计时，然后反复重试。
 *
 * 环把这段时间显示出来：从 12 点开始顺时针画，画满才执行。三件事因此变得确定：
 *   - **按下已被识别**（弧出现了）；
 *   - **还差多久**（弧的长度）；
 *   - **现在松手会取消**（弧停下并消失 —— 取消靠卸载，见下）。
 *
 * ## 为什么是 CSS 动画而不是逐帧 setState
 *
 * 进度是 500ms 的连续量。用 `requestAnimationFrame` 更新 React state 意味着
 * 60fps 的重渲染，而它挂在棋盘容器里 —— 一次重渲染会带着整个图层栈走一遍。
 * 这里改成：`stroke-dasharray` 定总长、`stroke-dashoffset` 交给一条 CSS 关键帧，
 * 动画完全跑在合成线程上，React 在整段长按期间**一次都不重渲染**。
 *
 * ## 线性、不用缓动
 *
 * 全站其他动效都是指数减速（`--motion-ease-out`），这里必须是 `linear`：
 * 环表示的是「剩余的等待时间」，缓动会让前段跑得快、后段拖 —— 那不是倒计时，
 * 是骗人。这是全套动效里唯一一条理直气壮的直线。
 *
 * ## 取消即卸载
 *
 * 抬手 / 指针移出 / 手势中断时，页面把 `cell` 置空，组件随之卸载，动画自然消失，
 * 不需要「倒放」的收尾动画 —— 倒着画回去会读成「刚才那一下还算数吗」。
 *
 * 环本身不接收指针事件（`pointer-events-none`），长按判定仍由棋盘容器负责。
 */
interface PressRingProps {
  /** 环外接正方形的边长（px）。格子环传 `cellSize`，按钮上的环传按钮内径。 */
  size: number;
  /** 与页面上的定时器保持一致 —— 环画满的那一刻，动作刚好发生。 */
  durationMs: number;
  /**
   * 重启动画的依据。React 只在它变化时重建 `<circle>`，从而让 CSS 动画从头播。
   * 同一格连按两次、或从 A 格挪到 B 格，都必须给出不同的值。
   */
  seq: number | string;
  strokeWidth?: number;
  /** 半径占 `size` 的比例。默认 0.38 —— 留出一圈空隙，不贴着格线画。 */
  radiusRatio?: number;
  color?: string;
  /**
   * 底轨颜色。地图格子上需要（照片什么颜色都有，没有底轨就看不出「总共有多少」），
   * 纯色按钮上不需要（弧在底色上本来就清楚，再加一圈是噪音）。
   */
  trackColor?: string;
  className?: string;
}

export function PressRing({
  size,
  durationMs,
  seq,
  strokeWidth,
  radiusRatio = 0.38,
  color = '#FFFFFF',
  trackColor,
  className,
}: PressRingProps): JSX.Element {
  const center = size / 2;
  const radius = size * radiusRatio;
  const circumference = 2 * Math.PI * radius;
  const width = strokeWidth ?? Math.max(2, size * 0.06);

  return (
    <svg
      className={cn('pointer-events-none absolute left-0 top-0', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {trackColor ? (
        /*
         * 底轨比进度弧宽 2px（两侧各露 1px）。它不只是「还剩多少」的刻度 ——
         * 进度弧是白色的，没有这圈深色垫底，白弧压在浅色地图（白墙、雪地）上
         * 就没了边。宽 2px 正好给出一条连续的黑边，同时不吞掉弧本身的粗细。
         */
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={width + 2}
        />
      ) : null}
      {/*
       * `rotate(-90)` 把起点从 3 点挪到 12 点：倒计时从正上方开始读，是钟面的
       * 直觉。`strokeDashoffset` 从「一整条周长」走到 0，弧因此从无到有地长出来。
       */}
      <circle
        key={seq}
        className="press-ring-arc"
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference}
        transform={`rotate(-90 ${center} ${center})`}
        style={
          {
            '--press-ring-length': `${circumference}`,
            '--press-ring-duration': `${durationMs}ms`,
          } as CSSProperties
        }
      />
    </svg>
  );
}
