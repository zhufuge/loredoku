import {
  GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE,
  GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE,
  GAME_FORBIDDEN_FONT_RATIO,
  GAME_NUMBER_FONT_RATIO,
  GAME_NUMBER_GRID,
  GAME_NUMBER_STROKE_RATIO,
  GAME_TOOL_HINT_ERASER_COLOR,
  GAME_TOOL_HINT_FORBIDDEN_COLOR,
  MAP_LAYER_Z,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import type { GamePlacementBoard } from '@loredoku/shared';
import { itemPadding } from '@/lib/canvasScale';
import { cn } from '@/lib/utils';
import type { MarkRender } from '@/lib/mark';
import { glyphFontSize, numberSlotAnchor, type GameToolHint } from '@/lib/gamePlacement';
import type { ToolIconRender } from '@/lib/toolIcons';
import { participantBadgeText } from '@/lib/participantLayout';
import { PressRing } from '@/components/common/PressRing';
import { parseKey } from './layerGeometry';

/** 标记图四周各留 9%；两层共用同一比例，预览与落下的图才对得上。 */
const FORBIDDEN_SYMBOL_IMAGE_INSET_RATIO = 0.09;

/**
 * v0.9.1 §3：清除工具的**内置**橡皮字形画在格子的 42%（居中）。
 */
const GAME_TOOL_HINT_ERASER_RATIO = 0.42;

/** v0.9.1 §5：上传的清除图标占 60%（比内置字形大一圈）并加白描边 —— 深墨图压在底纹上会糊在一起。 */
const GAME_TOOL_HINT_CLEAR_ICON_RATIO = 0.6;

/** 白描边用 4 向硬 `drop-shadow` 叠成（跟着图片 alpha 走，不涂白透明区）；半径按格子取，最小 1px。 */
function hintOutlineFilter(cellSize: number): string {
  const radius = Math.max(1, Math.round(cellSize * 0.02));
  return [
    `drop-shadow(${radius}px 0 0 #ffffff)`,
    `drop-shadow(-${radius}px 0 0 #ffffff)`,
    `drop-shadow(0 ${radius}px 0 #ffffff)`,
    `drop-shadow(0 -${radius}px 0 #ffffff)`,
  ].join(' ');
}

/** 层 4 · 工具提示层（SPEC-G02 §8）：只画交给它的东西，不接指针事件；预览编号须与放置层同一份文案，不许许诺别的标签。 */
export function MapGameToolHintLayer({
  hint,
  cell,
  cellSize,
  slots,
  mark = null,
  clearIcon = null,
  pop = 0,
  popCell = null,
}: {
  hint: GameToolHint | null;
  cell: CellCoord | null;
  cellSize: number;
  /** The roster, for the number glyph's colour and 编号展示 text. */
  slots: Array<CharacterSlotEntry | null>;
  /** 标记配置的上传图；`null` = 画那枚绿色 `×` 字形。 */
  mark?: MarkRender | null;
  /** v0.9.1 §3：清除工具配的上传图；`null` = 画内置橡皮字形。 */
  clearIcon?: ToolIconRender | null;
  /** 落笔令牌：每落一枚 `×` 就 +1，换一支动画名重播 —— 不换 `key`，重挂载会让 `<img>` 闪一帧。 */
  pop?: number;
  /** 刚落笔的那一格（`"x,y"`），`null` = 窗口已关；按格比对，否则跟指针的 `×` 飞到邻格还会弹一下。 */
  popCell?: string | null;
}): JSX.Element | null {
  if (!hint || !cell) return null;
  const total = cellSize;
  /* 只有指针停在落笔那格才带类；两支按令牌奇偶轮换 —— 名字一变动画就从头播。 */
  const popClass =
    popCell !== null && popCell === `${cell.x},${cell.y}`
      ? pop % 2 === 0
        ? 'forbidden-pop'
        : 'forbidden-pop-alt'
      : undefined;

  /* v0.9.1 §3：把上传图铺进格子；标记与清除图标共用，只是内缩比例不同。 */
  const imageHint = (
    imageUrl: string,
    insetRatio: number,
    filter?: string,
  ): JSX.Element => {
    const inset = total * insetRatio;
    return (
      <div
        className="pointer-events-none absolute left-0 top-0"
        style={{ zIndex: MAP_LAYER_Z.gameToolHint }}
      >
        {/* 外层必须是一格大小的定位盒：preflight 的 `img { max-width: 100% }` 以父宽为上限，0×0 浮层会把 `img` 压成 0 宽。 */}
        <div
          className="absolute"
          style={{
            left: cell.x * cellSize,
            top: cell.y * cellSize,
            width: total,
            height: total,
          }}
        >
          <img
            /* 这个元素不换 `key`：换 key 会让 `<img>` 空白一帧，露出身后的 `×`；重播靠换 `animation-name`。 */
            src={imageUrl}
            alt=""
            draggable={false}
            className={
              popClass
                ? `${popClass} pointer-events-none absolute select-none`
                : 'pointer-events-none absolute select-none'
            }
            style={{
              left: inset,
              top: inset,
              width: total - inset * 2,
              height: total - inset * 2,
              objectFit: 'contain',
              // v0.9.1 §5：仅清除图标会传这个（白描边）；标记保持原样。
              filter,
            }}
          />
        </div>
      </div>
    );
  };
  /* 有上传图就预览**同一张**（悬停许诺的必须是落下的东西），并加白描边。 */
  if (hint.kind === 'forbidden' && mark) {
    /* 动效只演在悬浮的这一枚、只在落笔那一刻演；指针进出 / 换格都不算动作。 */
    return imageHint(
      mark.imageUrl,
      FORBIDDEN_SYMBOL_IMAGE_INSET_RATIO,
      hintOutlineFilter(total),
    );
  }
  /* 清除工具同理画上传图（60% + 白描边）；`clearIcon` 为 `null` 时走下面的 SVG 橡皮（42%）。 */
  if (hint.kind === 'eraser' && clearIcon) {
    return imageHint(
      clearIcon.imageUrl,
      (1 - GAME_TOOL_HINT_CLEAR_ICON_RATIO) / 2,
      hintOutlineFilter(total),
    );
  }
  const glyph = ((): JSX.Element => {
    if (hint.kind === 'number') {
      const slot = slots[hint.participantId - 1] ?? null;
      const label = participantBadgeText(slot, hint.participantId - 1);
      // v0.6.4 fix §4: a configured label can be wider than a digit, so the
      // font shrinks to keep it inside its third of the cell.
      const fontSize = glyphFontSize(label, total / GAME_NUMBER_GRID, total * GAME_NUMBER_FONT_RATIO);
      const anchor = numberSlotAnchor(0);
      return (
        <text
          x={anchor.x * total}
          y={anchor.y * total}
          fill={slot?.themeColor ?? '#000000'}
          stroke="#000000"
          strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
          paintOrder="stroke fill"
          fontSize={fontSize}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {label}
        </text>
      );
    }
    if (hint.kind === 'forbidden') {
      const fontSize = cellSize * GAME_FORBIDDEN_FONT_RATIO;
      return (
        <text
          /* 动效只在**落笔那一刻**演，指针换格不演（见 `imageHint`）。 */
          className={popClass}
          x={total / 2}
          y={total / 2}
          fill={GAME_TOOL_HINT_FORBIDDEN_COLOR}
          /* 悬停预览的 `×` 用**白**描边（压在照片上黑边等于没边）；已放置的那枚仍是黑边。 */
          stroke="#FFFFFF"
          strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
          paintOrder="stroke fill"
          fontSize={fontSize}
          fontWeight={800}
          textAnchor="middle"
          dominantBaseline="central"
        >
          ×
        </text>
      );
    }
    // Eraser: a tilted rounded body with a metal ferrule (SPEC-G02 §5).
    const size = total * GAME_TOOL_HINT_ERASER_RATIO;
    const cx = total / 2;
    const cy = total / 2;
    return (
      <g transform={`rotate(-45 ${cx} ${cy})`}>
        <rect
          x={cx - size / 2}
          y={cy - size * 0.28}
          width={size}
          height={size * 0.56}
          rx={size * 0.12}
          fill={GAME_TOOL_HINT_ERASER_COLOR}
          stroke="#000000"
          strokeWidth={Math.max(1, size * 0.06)}
        />
        <rect
          x={cx - size * 0.18}
          y={cy - size * 0.28}
          width={size * 0.36}
          height={size * 0.56}
          fill="#9CA3AF"
          stroke="#000000"
          strokeWidth={Math.max(1, size * 0.05)}
        />
      </g>
    );
  })();
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.gameToolHint }}
    >
      <svg
        /* 不换 `key`（同 `imageHint`，重挂载空白一帧）；重播靠字形上的 `popClass` 换动画名。 */
        className="absolute left-0 top-0"
        width={total}
        height={total}
        style={{ left: cell.x * cellSize, top: cell.y * cellSize, overflow: 'visible' }}
      >
        {glyph}
      </svg>
    </div>
  );
}

/** 长按进度环（v0.7.11）：z 取 `regionLabel + 1`（= 43），不新增图层；环留在按下的格，提示跟指针走。 */
export function MapGamePressRing({
  cell,
  cellSize,
  durationMs,
  seq,
  imageUrl = null,
}: {
  /** 正在被按住的那一格；`null` 表示没有进行中的长按。 */
  cell: CellCoord | null;
  cellSize: number;
  /** 与页面上的长按定时器同一个值（`GAME_LONG_PRESS_MS`）。 */
  durationMs: number;
  /** 每次按下递增 —— 同一格连按两次也要从头画。 */
  seq: number;
  /** v0.9.2 §2：主题配的环图（`null` = 内置白弧）；进度仍走扇形遮罩揭开。 */
  imageUrl?: string | null;
}): JSX.Element | null {
  if (!cell) return null;
  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionLabel + 1 }}
    >
      <div
        className="absolute"
        style={{
          left: cell.x * cellSize,
          top: cell.y * cellSize,
          width: cellSize,
          height: cellSize,
        }}
      >
        <PressRing
          size={cellSize}
          durationMs={durationMs}
          seq={`${cell.x},${cell.y},${seq}`}
          // 地图是玩家上传的照片，什么底色都有 —— 深色底轨同时充当白弧的描边。
          trackColor="rgba(15, 23, 42, 0.4)"
          imageUrl={imageUrl}
        />
      </div>
    </div>
  );
}

/** 逐人校验圈（v0.9.3 §2）：扫满后**留着**（卸载由页面在关结算时做）；z 与长按环同档 43，两者不同时出现。 */
export interface GameCheckRingMark {
  participantId: number;
  cell: CellCoord;
  passed: boolean;
}

export function MapGameCheckLayer({
  marks,
  cellSize,
  passColor,
  failColor,
  ringUrl = null,
  sweepMs,
  runId,
}: {
  marks: readonly GameCheckRingMark[];
  cellSize: number;
  passColor: string;
  failColor: string;
  /** 主题配的圈图；`null` = 只画本色细环。 */
  ringUrl?: string | null;
  sweepMs: number;
  /** 一次提交一个值 —— 同一位连查两次，动画也要从头播。 */
  runId: number;
}): JSX.Element | null {
  if (marks.length === 0) return null;
  /* 内置细弧的直径按格算、不按图算（与长按环同一条）；有图时不画它，这两个数只在回落路径生效。 */
  const radiusRatio = 0.44;
  const strokeWidth = Math.max(2, cellSize * 0.055);

  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.regionLabel + 1 }}
    >
      {marks.map((mark) => (
        <div
          key={mark.participantId}
          className="absolute"
          style={{
            left: mark.cell.x * cellSize,
            top: mark.cell.y * cellSize,
            width: cellSize,
            height: cellSize,
          }}
        >
          {/* v0.9.3 §5：颜色只由那张图表达 —— 有图整张染成通过/未通过色，没图才回落内置本色细弧；两者同一段 `sweepMs`。 */}
          {ringUrl ? (
            <PressRing
              size={cellSize}
              durationMs={sweepMs}
              seq={`check-img-${runId}-${mark.participantId}`}
              imageUrl={ringUrl}
              imageTintColor={mark.passed ? passColor : failColor}
            />
          ) : (
            <PressRing
              size={cellSize}
              durationMs={sweepMs}
              seq={`check-${runId}-${mark.participantId}`}
              radiusRatio={radiusRatio}
              strokeWidth={strokeWidth}
              color={mark.passed ? passColor : failColor}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** 刚放下的编号：格子键 → 参与者编号，只挂一次性缩放；`×` 不进这张表（演的是悬停那枚）。 */
export type GamePlacementPulse = Readonly<Record<string, number>>;

/** 刚落子那圈 `×` 的水波纹：格子键 → 入场延迟（毫秒）；每圈多少毫秒由页面换算，这里只管挂样式。 */
export type GamePlacementWave = Readonly<Record<string, number>>;

const EMPTY_PULSE: GamePlacementPulse = {};
const EMPTY_WAVE: GamePlacementWave = {};
const EMPTY_ERASING: ReadonlySet<string> = new Set();

/** 层 5 · 游戏放置层（SPEC-G01 §7）：一格只放一种形态，多人则隐头像显编号；整层 inert，交互全由棋盘容器分发。 */
export function MapGamePlacementLayer({
  board,
  slots,
  charactersById,
  cellSize,
  activeParticipantId = null,
  settleKey = null,
  pulse = EMPTY_PULSE,
  wave = EMPTY_WAVE,
  waveAlt = false,
  erasing = EMPTY_ERASING,
  mark = null,
}: {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cellSize: number;
  /** 1-based participant id (the board's numbering); `null` = nobody active. */
  activeParticipantId?: number | null;
  /** 刚由长按落下的那一格；不给所有头像挂入场 —— 恢复存档时十几个一起弹会读成一串操作。 */
  settleKey?: string | null;
  /** 刚放下的编号表；用表不用单值：按住滑动连放几格时，单值会让前一格的类被摘掉、动画弹回。 */
  pulse?: GamePlacementPulse;
  /** 自动补出来的 `×`：格子键 → 入场延迟；几十个一起出现会读成闪屏，延迟由页面按曼哈顿距离算。 */
  wave?: GamePlacementWave;
  /** 用哪支动画名；同名再挂不会从头播，换名才重播而不必换 `key`（换 key 会让 `<img>` 空白一帧）。 */
  waveAlt?: boolean;
  /** 正在退场的格子：先演缩小淡出，页面等动画放完才删；三种形态共用同一支动效。 */
  erasing?: ReadonlySet<string>;
  /** 标记配置的图片；`null` = 画那枚 `×` 字形。 */
  mark?: MarkRender | null;
}): JSX.Element | null {
  const entries = Object.entries(board).filter(([, placement]) => placement !== null && placement !== undefined);
  if (entries.length === 0) return null;
  const numberFontSize = cellSize * GAME_NUMBER_FONT_RATIO;
  const forbiddenFontSize = cellSize * GAME_FORBIDDEN_FONT_RATIO;
  const avatarPadding = itemPadding(cellSize);

  return (
    <div
      className="no-drag pointer-events-none absolute left-0 top-0"
      style={{ zIndex: MAP_LAYER_Z.gamePlacement }}
    >
      {entries.map(([key, placement]) => {
        const [x, y] = parseKey(key);
        if (!placement) return null;
        /* 被擦掉的格子让位给 `erase-out` —— 两个 `animation` 同时挂是竞态，退场优先。 */
        const waveDelay = erasing.has(key) ? undefined : wave[key];
        const waveClass = waveAlt ? 'forbidden-wave-alt' : 'forbidden-wave';
        return (
          <div
            key={`place-${key}`}
            className="absolute"
            style={{
              left: x * cellSize,
              top: y * cellSize,
              width: cellSize,
              height: cellSize,
            }}
          >
            {placement.kind === 'participant' ? (
              <div
                className={cn(
                  'absolute',
                  settleKey === key && 'place-settle',
                  erasing.has(key) && 'erase-out',
                )}
                style={{
                  inset: 0,
                  // v0.6.4 §3: the active participant's avatar magnifies around
                  // the cell centre so it reads as "this one" at a glance.
                  // The magnification is the **only** cue.
                  transform:
                    placement.index === activeParticipantId
                      ? `scale(${GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE})`
                      : undefined,
                  transformOrigin: 'center',
                  transition: 'transform var(--motion-fast) var(--motion-ease-out)',
                }}
              >
                <ParticipantAvatar
                  slot={slots[placement.index - 1] ?? null}
                  charactersById={charactersById}
                  padding={avatarPadding}
                />
              </div>
            ) : null}

            {placement.kind === 'numbers' ? (
              <svg className="absolute left-0 top-0" width={cellSize} height={cellSize}>
                {/* v0.9.8：擦除时整格一起退场，所以套一层 `<g>` 而不是逐枚字形挂类。 */}
                <g className={erasing.has(key) ? 'erase-out' : undefined}>
                  {placement.entries.map((participantId, index) => {
                    const anchor = numberSlotAnchor(index);
                    // v0.6.4 §3: only the active participant's own glyph grows —
                    // the stroke scales with it so the outline keeps its weight.
                    const active = participantId === activeParticipantId;
                    const glyphScale = active ? GAME_ACTIVE_PARTICIPANT_NUMBER_SCALE : 1;
                    // v0.6.4 fix §4: the glyph is the participant's 编号展示
                    // text when they have one — the same mapping the roster
                    // badges use — and their sequence number otherwise.
                    const slot = slots[participantId - 1] ?? null;
                    const label = participantBadgeText(slot, participantId - 1);
                    // A configured label can be wider than a digit, so the font
                    // shrinks to keep it inside its third of the cell.
                    const fontSize = glyphFontSize(
                      label,
                      cellSize / GAME_NUMBER_GRID,
                      numberFontSize * glyphScale,
                    );
                    return (
                      <text
                        key={`num-${key}-${participantId}-${index}`}
                        x={anchor.x * cellSize}
                        y={anchor.y * cellSize}
                        fill={slot?.themeColor ?? '#000000'}
                        stroke="#000000"
                        strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
                        paintOrder="stroke fill"
                        fontSize={fontSize}
                        fontWeight={700}
                        textAnchor="middle"
                        dominantBaseline="central"
                        // 刚放下的这个编号「盖章」一次（180ms 缩放）。
                        className={pulse[key] === participantId ? 'place-pop' : undefined}
                      >
                        {label}
                      </text>
                    );
                  })}
                </g>
              </svg>
            ) : null}

            {placement.kind === 'forbidden' ? (
              mark ? (
                /* 有图就画图不画 `×`（`data-testid` 留在同一元素）；手点那枚不演入场，自动补的要演，否则一整批同时出现就是闪光。 */
                <img
                  src={mark.imageUrl}
                  alt=""
                  draggable={false}
                  data-testid={`forbidden-${key}`}
                  className={cn(
                    'block h-full w-full select-none',
                    waveDelay !== undefined && waveClass,
                    erasing.has(key) && 'erase-out',
                  )}
                  style={{
                    objectFit: 'contain',
                    padding: cellSize * FORBIDDEN_SYMBOL_IMAGE_INSET_RATIO,
                    boxSizing: 'border-box',
                    animationDelay: waveDelay !== undefined ? `${waveDelay}ms` : undefined,
                  }}
                />
              ) : (
                <svg className="absolute left-0 top-0" width={cellSize} height={cellSize}>
                  <text
                    x={cellSize / 2}
                    y={cellSize / 2}
                    fill="#000000"
                    fontSize={forbiddenFontSize}
                    fontWeight={800}
                    textAnchor="middle"
                    dominantBaseline="central"
                    data-testid={`forbidden-${key}`}
                    // 手点的入场静默，退场（被擦掉）走 `erase-out`。
                    // 自动补的那批带延迟入场，见 `.forbidden-wave`。
                    className={cn(
                      waveDelay !== undefined && waveClass,
                      erasing.has(key) && 'erase-out',
                    )}
                    style={waveDelay !== undefined ? { animationDelay: `${waveDelay}ms` } : undefined}
                  >
                    ×
                  </text>
                </svg>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** SPEC-G01 §7.1: the participant picture, inset by the shared object padding. */
function ParticipantAvatar({
  slot,
  charactersById,
  padding,
}: {
  slot: CharacterSlotEntry | null;
  charactersById: Map<number, Character>;
  padding: number;
}): JSX.Element | null {
  const character = slot ? charactersById.get(slot.characterId) : undefined;
  const src = character?.avatarThumbUrl ?? character?.avatarUrl;
  // FEAT-L02 / SPEC-L03: a colour block paints the avatar disc instead
  // of an uploaded picture.
  if (character?.bgColor) {
    return (
      <div
        data-color-block={character.bgColor}
        className="no-drag block h-full w-full rounded-full"
        style={{
          backgroundColor: character.bgColor,
          padding,
          boxSizing: 'border-box',
          backgroundClip: 'content-box',
        }}
      />
    );
  }
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="no-drag block h-full w-full"
      style={{ objectFit: 'cover', padding, boxSizing: 'border-box' }}
    />
  );
}
