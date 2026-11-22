import { BRAND_WORD, isBrandRed } from '@/components/common/LoredokuLoader';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  height?: number;
  withWordmark?: boolean;
  suffix?: string;
  className?: string;
}

/** 字标就是这一行字 —— Courier Prime Sans（`docs/v0.11.9.md` §2）。
 *  `height` 是各处布局认的高度档（页头 22、AppShell 20、播放器 16），标题墨迹高取它的 73.6%，
 *  即 `docs/v0.5.6.md` §14.3 量定的字标光学尺寸。LOREDOKU 全大写，墨迹高就是大写高，
 *  也就是这个字体的 `sCapHeight`。 */
const INK_RATIO = 0.736;
const CAP_HEIGHT = 1187 / 2048;

/** 大写的一行墨迹要落进右边「· 格物」的墨迹框里：中文墨迹压在基线下约 0.03em，大写只坐在
 *  基线上，所以只对齐基线看着还是高一截。0.071em 是把两边墨迹的上下沿量到重合的值
 *  （`docs/v0.11.9.md` §2）。 */
const CAP_NUDGE = '0.071em';

export function BrandLogo({
  height = 20,
  withWordmark = false,
  suffix,
  className,
}: BrandLogoProps): JSX.Element {
  /** 字号取整到 px：小数号在 1x 屏上会把笔画磨成半像素。行高不压 —— 行盒交给字体自己的
   *  度量，墨迹在盒里的位置只跟字号有关，与行高无关。 */
  const fontSize = Math.round((height * INK_RATIO) / CAP_HEIGHT);

  /** 字号可以由外层用 `--brand-size` / `--brand-wordmark-size` 压过（只给窄屏一档用：
   *  列表页在手机上要收小，主题名又要更大，两个字号才排得出层级）。不给就按 `height` 算。 */

  return (
    <span className={className ?? 'flex shrink-0 items-center gap-2'}>
      {/* 逐字母拆开只为一件事：让第 3–5 个字母上朱色（`.loredoku-ink-red`，与加载字标同一条
          规则）。等宽字体，拆开不动字距。颜色走 `text-foreground`，深色下自己就是对的，不需要反色。 */}
      <span
        data-testid="brand-logo"
        className="font-brand inline-flex select-none text-foreground"
        style={{
          fontSize: `var(--brand-size, ${fontSize}px)`,
          transform: `translateY(${CAP_NUDGE})`,
        }}
      >
        {BRAND_WORD.split('').map((letter, index) => (
          <span key={index} className={cn(isBrandRed(index) && 'loredoku-ink-red')}>
            {letter}
          </span>
        ))}
      </span>
      {withWordmark ? (
        <span
          style={{ fontSize: `var(--brand-wordmark-size, ${Math.round(height * 0.82)}px)`, lineHeight: 1 }}
          data-testid="brand-wordmark"
        >
          <span className="select-none">·</span> 格物
          {suffix ? <span className="text-muted-foreground">{suffix}</span> : null}
        </span>
      ) : null}
    </span>
  );
}
