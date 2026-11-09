import { useId, type CSSProperties } from 'react';
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
  /**
   * v0.9.2 §2：作者在主题里配的那张**环图**。给了就画它、不画白弧 —— 但进度
   * 照样走：图整张铺在格子上，用一条**扇形**遮罩顺时针揭开（同一条 CSS 关键帧、
   * 同一个 `stroke-dashoffset` 思路）。环回答的是「还要按多久」，换成插画也不能
   * 把刻度弄丢。
   *
   * `null` / 不传 = 内置白弧（v0.7.11 的样式）。
   */
  imageUrl?: string | null;
  /**
   * v0.9.3 §5：图模式下把**整张已上传的圆圈图片**染成结果色。
   *
   * 用户澄清过：要染的是那张图片本身，不是在图外面再补一道结果色弧。所以调用方
   * （`MapGameCheckLayer`）有图时只画这一枚、不再画细弧；这里用一条
   * `feColorMatrix` 把每个像素换成结果色，alpha 原样保留 —— 形状、镂空、透明区
   * 都不变，颜色是作者取色器里挑的那一个。
   *
   * 只收 `#RRGGBB`；不合法就不挂滤镜（图保持原样），别让 SVG 静默丢声明。
   * 长按计时环不传这一项：它只报进度、不报结论，图保持作者画的样子。
   */
  imageTintColor?: string | null;
  className?: string;
}

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

/**
 * v0.9.3 §5（同日按用户澄清改定）：把**整张已上传的圆圈图片**染成结果色。
 *
 * 只换颜色、不换形状 —— 矩阵前三行的 RGB 系数全为 0、常数项就是结果色的
 * 三个分量；第四行让 alpha 原样通过。于是图里每一个像素（不论原色深浅、
 * 是笔画还是底色）都变成同一个绿 / 红，而透明区仍透明、镂空的字也还是镂空。
 *
 * 为什么不用「亮度 × 结果色」：那版保留了原图明暗，深色章染出来会发暗，
 * 用户要的是「给图片染色」—— 结论色得是作者取色器里挑的那一个，不该被
 * 图片本身的深浅改写。
 *
 * 也不必 `feFlood + feComposite`：一条 `feColorMatrix` 同样只认 alpha，
 * 但少了把 flood 的不透明区裁回原 alpha 的那一步。
 *
 * 只收 `#RRGGBB`；不合法返回 `null`（调用方就不挂滤镜，宁可显示原图）。
 */
export function imageTintMatrix(color: string): string | null {
  const match = HEX_COLOR.exec(color);
  if (!match) return null;
  const packed = Number.parseInt(match[1] ?? '000000', 16);
  const channels = [((packed >> 16) & 255) / 255, ((packed >> 8) & 255) / 255, (packed & 255) / 255];
  const cell = (value: number): string => String(Number(value.toFixed(6)));
  // 每行：R' / G' / B' = 常数（结果色分量），A' = 原 alpha。
  const rows = channels.map((channel) => `0 0 0 0 ${cell(channel)}`);
  return [...rows, '0 0 0 1 0'].join(' ');
}

export function PressRing({
  size,
  durationMs,
  seq,
  strokeWidth,
  radiusRatio = 0.38,
  color = '#FFFFFF',
  trackColor,
  imageUrl = null,
  imageTintColor = null,
  className,
}: PressRingProps): JSX.Element {
  const center = size / 2;
  const radius = size * radiusRatio;
  const circumference = 2 * Math.PI * radius;
  const width = strokeWidth ?? Math.max(2, size * 0.06);
  /**
   * 扇形遮罩用的半径是**整格**（`center`），stroke 宽度也取整格 —— 一条
   * 「半径 = 半格、线宽 = 整格」的圆环覆盖的就是整个圆面，`dashoffset` 揭开
   * 的那一段因此是一块扇形，不是一圈弧。
   */
  const discLength = 2 * Math.PI * center;
  // `useId()` 会给出 `:r1:` 这样的值，冒号在 `url(#…)` 里不保险 —— 洗掉。
  const maskId = `press-ring-mask-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const tintId = `${maskId}-tint`;
  // 只在「有图 + 有合法结果色」时染色；长按环不传色，图保持原样。
  const tintMatrix = imageUrl && typeof imageTintColor === 'string' ? imageTintMatrix(imageTintColor) : null;

  return (
    <svg
      className={cn('pointer-events-none absolute left-0 top-0', className)}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ overflow: 'visible' }}
    >
      {imageUrl ? (
        <>
          <defs>
            <mask
              id={maskId}
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={size}
              height={size}
            >
              {/*
               * 遮罩里这条圆环不是画给人看的 —— 它是「已经按了多久」的形状。
               * `strokeLinecap` 用默认的 `butt`：扇形边缘该是一条直边，圆头会让
               * 进度条前缘鼓出一小截，读起来像「多了 2°」。
               */}
              <circle
                key={seq}
                className="press-ring-arc"
                cx={center}
                cy={center}
                r={center}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth={size}
                strokeDasharray={discLength}
                strokeDashoffset={discLength}
                transform={`rotate(-90 ${center} ${center})`}
                style={
                  {
                    '--press-ring-length': `${discLength}`,
                    '--press-ring-duration': `${durationMs}ms`,
                  } as CSSProperties
                }
              />
            </mask>
            {tintMatrix ? (
              <filter
                id={tintId}
                filterUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={size}
                height={size}
                colorInterpolationFilters="sRGB"
              >
                <feColorMatrix in="SourceGraphic" type="matrix" values={tintMatrix} />
              </filter>
            ) : null}
          </defs>
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={size}
            height={size}
            preserveAspectRatio="xMidYMid meet"
            mask={`url(#${maskId})`}
            filter={tintMatrix ? `url(#${tintId})` : undefined}
          />
        </>
      ) : null}
      {/* 配了图就不画底轨：图自己就是那一圈，再加一道细环只会互相打架。 */}
      {trackColor && !imageUrl ? (
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
      {/*
       * v0.9.2 §2：配了图就不画这圈白弧 —— 进度已经由遮罩的扇形表达。
       */}
      {imageUrl ? null : (
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
      )}
    </svg>
  );
}
