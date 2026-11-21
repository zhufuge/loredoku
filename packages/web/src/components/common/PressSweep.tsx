import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/** 长按进度：按钮方块内的扇形扫描；不画环（会圈住图标），不接指针事件，角度变量须注册为 <angle> 才能插值，线性、取消即卸载。 */
interface PressSweepProps {
  /** 与页面上的定时器保持一致 —— 扫满 360° 的那一刻，动作刚好发生。 */
  durationMs: number;
  /** 重启动画的依据：值变才重播，连按两次必须不同。 */
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
      /* key 换掉就重建节点，让同一条 CSS 动画从头播；与 PressRing 同一手法。 */
      key={seq}
      aria-hidden="true"
      data-testid="press-sweep"
      /* rounded-[inherit] 跟按钮圆角；pointer-events-none 因为长按判定在按钮上。 */
      className={cn(
        'press-sweep pointer-events-none absolute inset-0 rounded-[inherit]',
        className,
      )}
      style={
        {
          '--press-sweep-duration': `${durationMs}ms`,
          /* 不加 from：默认从 12 点起（别照抄环的 rotate(-90)，SVG 0° 在 3 点）；第二个色标 0 会被夹住，得到一刀切实色。 */
          background: `conic-gradient(${color} var(--press-sweep-angle, 0deg), transparent 0)`,
        } as CSSProperties
      }
    />
  );
}
