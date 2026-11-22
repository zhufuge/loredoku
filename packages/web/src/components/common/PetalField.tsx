import { useMemo, type CSSProperties } from 'react';
import petalsSpriteUrl from '@/assets/peach_petal_sprites_16.png';
import { cn } from '@/lib/utils';

/** 精灵图是 16px 一格的 8 × 8 排，格格有花 —— 64 片花瓣。切格子只用 `background-position`，
 *  不拆成 64 张图。 */
const SHEET_COLS = 8; // 一行切几格
const SHEET_ROWS = 8; // 一列切几格
const SHEET_PETALS = 64; // 格格都有花，取格子时按这个数取模

/** 花瓣的旋钮 —— 大小 / 透明度 / 亮度 / 饱和度都是一段区间，每片随机落在里面。
 *  模糊、下落时长、摆动周期不单独摇，按「远近」（`depth`：远 → 近）推：越远越小、越淡、越糊、
 *  越慢、摆得越窄，于是小淡糊慢永远一起出现，眼睛读到的是纵深，不是一把随机数。
 *  数值会随手感改，注释只说这颗旋钮管什么，不抄区间。 */
const TUNING = {
  /** 一片花摊到的屏幕面积（px²）：上映多少片由视口面积除它得出，不再写死一个总数。 */
  areaPerPetalPx: 10000,
  /** 下限：窄屏（手机竖屏、并排的小窗）也要落英。 */
  minPetals: 48,
  /** 上限：超宽屏只在视口铺满，不跟面积一直涨 —— 一屏几百片会把页面搅成一锅粥。 */
  maxPetals: 120,
  /** 单片花瓣的边长，落到屏幕上之前还要按远近缩放。 */
  sizePx: [9, 26],
  /** 不透明度：远层淡、近层实。 */
  opacity: [0.35, 0.95],
  /** 亮度（`filter: brightness()`）：让同一张粉花有深浅，不然满屏花瓣是一张贴纸。 */
  brightness: [0.85, 1.15],
  /** 饱和度（`filter: saturate()`）：被虚化擦灰的远层靠它留一点颜色。 */
  saturation: [0.85, 1.3],
  /** 模糊半径：越远的层越糊。 */
  blurPx: [0, 1.4],
  /** 从顶上落到屏底一轮的时长；越远越慢。 */
  durationS: [30, 72],
  /** 横向摆动 / 自转那条往返动画的周期，比下落短，一朵花在半空里要摆好几回。 */
  driftS: [12, 24],
  /** 翻面的往返周期，单独一条：比摆动慢，花是慢慢侧过去又转回来，不是跟着摆一起抽。 */
  flipS: [14, 28],
  /** 横向摆幅（vw）：掉头时靠 `alternate` 先减速再反向，不是折线。 */
  swayVw: [1.2, 6],
  /** 自转（`rotate()`，即 z 轴）的倾角，给花瓣一点歪，缺点是转多了像打转。 */
  spinDeg: [4, 16],
  /** 翻面（绕花平面里那条轴）的最大角度：越过 90° 只剩一条缝，再往后就翻到背面了，所以别给太大。 */
  flipDeg: [60, 120],
} as const satisfies Record<string, number | readonly [number, number]>;

type Range = readonly [number, number];

const lerp = ([min, max]: Range, t: number): number => min + (max - min) * t;
const round = (value: number, digits: number): number => +value.toFixed(digits);

interface Petal {
  col: number;
  row: number;
  left: number;
  size: number;
  opacity: number;
  brightness: number;
  saturation: number;
  blur: number;
  duration: number;
  delay: number;
  drift: number;
  driftDelay: number;
  sway: number;
  spin: number;
  flip: number;
  flipDuration: number;
  flipDelay: number;
  /* 翻面的轴落在花平面里：0 度是横轴（上下翻），90 度是竖轴（左右翻），中间是斜着翻。 */
  flipAxisX: number;
  flipAxisY: number;
}

/** 视口面积折成上场的片数：密度恒定，窗大花多、窗小花少，但两头都夹住。
 *  只在挂载时算一次 —— 落花是背景，转屏 / 拖窗口时重排等于把正在下的花重洗一遍。 */
function petalCount(width: number, height: number): number {
  const byArea = Math.round((width * height) / TUNING.areaPerPetalPx);
  return Math.min(TUNING.maxPetals, Math.max(TUNING.minPetals, byArea));
}

function makePetals(count: number): Petal[] {
  return Array.from({ length: count }, () => {
    const cell = Math.floor(Math.random() * SHEET_PETALS);
    const depth = Math.random();
    const duration = round(lerp(TUNING.durationS, 1 - depth), 1);
    const drift = round(lerp(TUNING.driftS, 1 - depth), 1);
    const flipDuration = round(lerp(TUNING.flipS, 1 - depth), 1);
    const flipAxis = Math.random() * Math.PI;
    return {
      col: cell % SHEET_COLS,
      row: Math.floor(cell / SHEET_COLS),
      /* 横向百分比：随机铺满整条视口宽。 */
      left: round(Math.random() * 100, 1),
      size: Math.round(lerp(TUNING.sizePx, depth)),
      opacity: round(lerp(TUNING.opacity, depth), 2),
      brightness: round(lerp(TUNING.brightness, depth), 2),
      saturation: round(lerp(TUNING.saturation, depth), 2),
      blur: round(lerp(TUNING.blurPx, 1 - depth), 2),
      duration,
      /* 负延迟：一进页面就在半空，不用等一整轮才铺满。 */
      delay: round(Math.random() * duration, 1),
      drift,
      driftDelay: round(Math.random() * drift, 1),
      sway: round(lerp(TUNING.swayVw, depth), 2),
      spin: round(lerp(TUNING.spinDeg, depth), 1),
      flip: Math.round(lerp(TUNING.flipDeg, depth)),
      flipDuration,
      flipDelay: round(Math.random() * flipDuration, 1),
      flipAxisX: round(Math.cos(flipAxis), 3),
      flipAxisY: round(Math.sin(flipAxis), 3),
    };
  });
}

/** 落花。纯装饰：`aria-hidden` + `pointer-events-none`，不参与布局也不吃点击；
 *  `prefers-reduced-motion` 下整层不画（见 `index.css`）。全站共用这一层，固定铺满视口，
 *  页面滚动时背景仍在动。 */
export function PetalField({ className }: { className?: string }): JSX.Element {
  const petals = useMemo(() => makePetals(petalCount(window.innerWidth, window.innerHeight)), []);

  return (
    <div
      aria-hidden
      className={cn('petal-field pointer-events-none fixed inset-0 overflow-hidden', className)}
    >
      {petals.map((petal, index) => (
        <span
          key={index}
          className="petal"

          style={
            {
              /* 横向落在视口的百分比位置：固定层满屏，不跟容器走。 */
              left: `${petal.left}%`,
              width: petal.size,
              height: petal.size,
              opacity: petal.opacity,
              /* 阴影跟着 --foreground 走：浅色下给淡花瓣一道灰边（不然奶油色花瓣贴在纸色上等于没有），
                 深色下是一圈微光。半径给小、只为描边不为投影；模糊放最后，远层连影子一起糊掉。 */
              filter: `brightness(${petal.brightness}) saturate(${petal.saturation}) drop-shadow(0 1px 2px hsl(var(--foreground) / 0.14)) blur(${petal.blur}px)`,
              animationDuration: `${petal.duration}s, ${petal.drift}s`,
              animationDelay: `-${petal.delay}s, -${petal.driftDelay}s`,
              '--petal-sway': `${petal.sway}vw`,
              '--petal-spin': `${petal.spin}deg`,
            } as CSSProperties
          }
        >
          {/* 翻面自己一层：周期比摆动长，和摆动同一条动画就只能同速。 */}
          <span
            className="petal-flip"
            style={
              {
                backgroundImage: `url(${petalsSpriteUrl})`,
                backgroundSize: `${petal.size * SHEET_COLS}px ${petal.size * SHEET_ROWS}px`,
                backgroundPosition: `-${petal.col * petal.size}px -${petal.row * petal.size}px`,
                /* 放大时保住像素画的硬边（放到一格原始尺寸以上才看得出像素边），缩小时交给浏览器平滑。 */
                imageRendering: petal.size >= 16 ? 'pixelated' : 'auto',
                animationDuration: `${petal.flipDuration}s`,
                animationDelay: `-${petal.flipDelay}s`,
                '--petal-flip': `${petal.flip}deg`,
                '--petal-flip-x': petal.flipAxisX,
                '--petal-flip-y': petal.flipAxisY,
              } as CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
}
