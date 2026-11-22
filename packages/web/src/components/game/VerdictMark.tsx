import { useState, type CSSProperties } from 'react';
import { cn } from '@/lib/utils';

/**
 * 定案竖排 + 印章，卡片封面与地图遮罩共用同一张脸；印恒 −14°，与 `index.css` 的 `stamp-press` 收尾帧一致。
 */

/** 印章本体。`animate` 打开时挂 `stamp-press`；卡片上不播（印是既成事实）。 */
export function VerdictStamp({
  stampUrl,
  animate = false,
  offset,
  className,
  style,
}: {
  stampUrl: string | null;
  animate?: boolean;
  /** 整体推移（px），挂 `translate`：写 `transform` 会被角度类与 `stamp-press` 覆盖。 */
  offset?: { x: number; y: number };
  className?: string;
  /** 边长（`width` / `height`）等，必须与 `translate` 合进同一个 `style`：两处都写只有一个生效。 */
  style?: CSSProperties;
}): JSX.Element | null {
  /* 地址可能已不在（换图 / 重导不同名）：加载失败静默不画，不留破图标。 */
  const [failed, setFailed] = useState(false);
  if (!stampUrl || failed) return null;

  return (
    <img
      src={stampUrl}
      alt=""
      draggable={false}
      data-testid="verdict-stamp"
      onError={() => setFailed(true)}
      /* 印章保持原色，不随主题 / 遮罩翻色；深底可读性交给透明底与字衬。 */
      className={cn(
        /* 角度斜到 −14°。角度同时写在 `index.css` 的
           `@keyframes stamp-press` 收尾帧里，两处必须一致，否则「有没有动效」
           会停成两个不同的角度。 */
        '-rotate-[14deg] select-none object-contain',
        animate && 'stamp-press',
        className,
      )}
      style={{
        ...style,
        ...(offset ? { translate: `${offset.x}px ${offset.y}px` } : null),
      }}
    />
  );
}

/** 「定案」竖排一列，印章贴其右缘压住一点；卡片封面与地图遮罩共用，比例不同但相对位置不变。 */
export function VerdictMark({
  stampUrl,
  animate = false,
  large = false,
  onDark = false,
  stampOffset,
  scale = 1,
  className,
}: {
  stampUrl: string | null;
  animate?: boolean;
  large?: boolean;
  /** 压在深色遮罩上时文字要用浅色，否则「定案」两个字会糊进黑底。 */
  onDark?: boolean;
  /** 按棋盘边长传入的等比缩放；比例落在字号（em）上而不用 `zoom` —— iOS Safari 上 `zoom` 不可靠。 */
  scale?: number;
  /** 只推移印章（px），用 `translate` 属性：`transform` 会被 `stamp-press` 关键帧整条覆盖。 */
  stampOffset?: { x: number; y: number };
  className?: string;
}): JSX.Element {
  /* `scale` 兜异常值：传 0 / NaN 会让字号归零、整块消失。 */
  const ratio = Number.isFinite(scale) && scale > 0 ? scale : 1;
  /* 字号即比例，基准字号写在容器上（大字 8rem / 卡片 4.5rem）；内部尺寸全用 em。 */
  const baseRem = large ? 8 : 4.5;
  /* 印章不参与横向排版：大字档字列居中、印绝对定位挂右缘外；卡片档仍行内叠压（要铺满封面）。 */
  const overlap = 0.55 * 16 * ratio;
  const stampSide = (large ? 12 : 6) * ratio;
  const offsetX = (stampOffset?.x ?? 0) * ratio;
  const offsetY = (stampOffset?.y ?? 0) * ratio;

  return (
    <div
      data-testid="verdict-mark"
      className={cn('relative flex items-center justify-center', className)}
      style={{ fontSize: `${baseRem * ratio}rem` }}
    >
      <span
        className={cn(
          /* 文楷只有 400 且 `font-synthesis-weight: none`，必须显式放开合成粗体；其余处不受影响。 */
          'relative z-0 flex flex-col items-center gap-[0.25em] font-kai font-bold leading-none [font-synthesis-weight:auto]',
          /* 竖排不用 `writing-mode`：Safari 给竖排里的 `letter-spacing` 收尾补的那一格和别的引擎不一样，两个字会整体蹿一截。 两字各占一行、间距用 `gap` 排，盒子在哪个引擎里都是同一块。 */
          /* 六成黑遮罩上必须始终浅色（主题 token 会随主题反转）；卡片档是半透明印迹。 */
          onDark
            ? 'text-primary-foreground dark:text-foreground'
            : 'text-foreground/40',
          !onDark && '-rotate-[14deg]',
          /* 字号由容器 `style.fontSize` 给：这里写字号类会盖掉它，比例就只对印生效。 */
        )}
      >
        <span>定</span>
        <span>案</span>
      </span>
      <VerdictStamp
        stampUrl={stampUrl}
        animate={animate}
        offset={
          large
            ? undefined
            : stampOffset
              ? { x: stampOffset.x * ratio, y: stampOffset.y * ratio }
              : undefined
        }
        /* 卡片档行内叠压（撑满封面，脱离文档流会顶出）；大字档绝对定位挂字列右缘外。 */
        className={cn(
          'z-10 max-h-[52%] max-w-[52%]',
          large
            ? 'absolute left-full top-1/2'
            : 'relative -ml-[0.55em]',
        )}
        /* 边长 12rem / 6rem 再乘比例；用 rem 不用 em（em 会叠字字号，双重缩放）。 */
        style={
          large
            ? {
                /* 大字档印宽用 `em` 跟着容器字号走：1.5em 在 390px 遮罩里会溢出。 */
                width: '1.1em',
                height: '1.1em',
                /* 百分比夹取会按「字列」算，印会被夹成一小块 —— 尺寸已经算好，
                   这里不要那两道夹取。 */
                maxWidth: 'none',
                maxHeight: 'none',
                /* 左缘贴字列右缘，左咬 `overlap`、再让开 8% 印宽：只压边不糊字。 */
                translate: `calc(-8% + ${offsetX - overlap}px) calc(-50% + ${offsetY}px)`,
              }
            : { width: `${stampSide}rem`, height: `${stampSide}rem` }
        }
      />
    </div>
  );
}
