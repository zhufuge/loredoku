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
import { glyphFontSize, numberSlotAnchor, type GameToolHint } from '@/lib/gamePlacement';
import { participantBadgeText } from '@/lib/participantLayout';
import { PressRing } from '@/components/common/PressRing';
import { parseKey } from './layerGeometry';

/**
 * the two game-only layers, split out of the old `MapLayers.tsx`.
 */

/**
 * 层 4 · 工具提示层（Game Tool Hint Layer）— SPEC-G02 (docs/v0.4.0.md §8).
 *
 * The pointer-following preview of what the current operation mode would do to
 * the hovered cell: a participant number (9-grid slot 1), the forbidden `×`, or
 * the eraser. It is cleared the moment the pointer leaves the cell — that part
 * is the page's job, this layer only ever draws what it is handed.
 *
 * The layer never receives pointer events, and it survives a completed
 * placement: the hint and the placement layer are independent (SPEC-G02 §3).
 *
 * v0.6.4 fix (docs/v0.6.4.md §4): the preview number is the same 编号展示 text
 * the placement layer will draw — configured text if the participant has one,
 * their sequence number otherwise — so hovering never promises a different
 * label than the one that gets placed.
 */
export function MapGameToolHintLayer({
  hint,
  cell,
  cellSize,
  slots,
}: {
  hint: GameToolHint | null;
  cell: CellCoord | null;
  cellSize: number;
  /** The roster, for the number glyph's colour and 编号展示 text. */
  slots: Array<CharacterSlotEntry | null>;
}): JSX.Element | null {
  if (!hint || !cell) return null;
  const total = cellSize;
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
          x={total / 2}
          y={total / 2}
          fill={GAME_TOOL_HINT_FORBIDDEN_COLOR}
          stroke="#000000"
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
    const size = total * 0.42;
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

/**
 * 长按进度环（v0.7.11）。
 *
 * 棋格上按住 500ms 放头像（SPEC-J02）—— 在这之前那 500ms 里界面毫无变化，
 * 玩家只能靠数秒判断「按够了没有」，松早了就白按一次。环把等待画出来：
 * 从 12 点顺时针画满，画满的那一刻头像落下。
 *
 * 与工具提示层同属「这一格将发生什么」的预告，但预告的东西不同 —— 提示层说
 * **内容**（会放上几号），这一层说**时间**（还要多久）。分开的理由是它们可以
 * 各自独立存在：长按期间指针可能已经移到别的格子，提示跟着指针走，环留在
 * 按下的那一格。
 *
 * z 取 `regionLabel + 1`（= 43），不新增图层：《画布图层优先级规范》§2 末段
 * 给临时 affordance 留了口子（编辑器反馈挂 `operationCursorBox − 1 / − 2`），
 * 一个手势反馈不值得把 15 层的公共契约重排成 16 层。压在区域标签之上，是因为
 * 环被地图上的文字截断会读成「画错了」。
 */
export function MapGamePressRing({
  cell,
  cellSize,
  durationMs,
  seq,
}: {
  /** 正在被按住的那一格；`null` 表示没有进行中的长按。 */
  cell: CellCoord | null;
  cellSize: number;
  /** 与页面上的长按定时器同一个值（`GAME_LONG_PRESS_MS`）。 */
  durationMs: number;
  /** 每次按下递增 —— 同一格连按两次也要从头画。 */
  seq: number;
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
        />
      </div>
    </div>
  );
}

/**
 * v0.7.11：「刚放下的东西」按格子索引 —— 值是该格的参与者编号，`null` 是那个 `×`。
 * 只用来挂一次性的缩放动效，过期就由页面摘掉（见 `GamePage` 的 `markPulse`）。
 */
export type GamePlacementPulse = Readonly<Record<string, number | null>>;

const EMPTY_PULSE: GamePlacementPulse = {};

/**
 * 层 5 · 游戏放置层（Game Placement Layer）— SPEC-G01 (docs/v0.4.0.md §7).
 * What the player has placed: participant avatars, the 3×3 number grid, and
 * the forbidden `×`. One cell holds exactly one of the three forms (or
 * nothing); a cell with two or more participants hides its avatar and shows
 * the numbers instead, so the two never overlap.
 *
 * The layer is inert — every interaction is dispatched by the board container.
 *
 * v0.6.4 (docs/v0.6.4.md §3): `activeParticipantId` magnifies whatever that
 * participant already has on the board — their avatar and their own 编号
 * glyphs — so touching / clicking a roster card shows where that participant
 * currently sits. Only their own glyphs grow; a cell shared with other
 * participants keeps everyone else at the normal size.
 *
 * v0.6.4 fix (§4): a 编号 glyph shows the participant's configured 编号展示
 * text when they have one, and their sequence number otherwise — the same
 * mapping the roster badges use, so the board never disagrees with the panel.
 */
export function MapGamePlacementLayer({
  board,
  slots,
  charactersById,
  cellSize,
  activeParticipantId = null,
  settleKey = null,
  pulse = EMPTY_PULSE,
}: {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cellSize: number;
  /** 1-based participant id (the board's numbering); `null` = nobody active. */
  activeParticipantId?: number | null;
  /**
   * v0.7.11：刚刚由「长按落下」的那一格（`x,y`）。命中的头像播一次落定。
   *
   * 为什么不给所有头像都挂入场动画：进页面时棋盘是从存档恢复的，十几个头像
   * 同时弹一下，会读成「刚刚发生了一连串操作」。只有这一格是真的刚放下的。
   */
  settleKey?: string | null;
  /**
   * v0.7.11：刚放下的**编号 / 禁止符号**，按格子键索引 —— 值是参与者编号，
   * `null` 表示那个 `×`。命中的那一个字形播一次「盖章」缩放。
   *
   * 用表而不是单个「最后一格」：按住滑动会连着放好几格，单值会让前一格的字形
   * 在动画播到一半时被摘掉类，缩放立刻弹回原尺寸 —— 看起来像闪了一下。
   */
  pulse?: GamePlacementPulse;
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
                className={settleKey === key ? 'place-settle absolute' : 'absolute'}
                style={{
                  inset: 0,
                  // v0.6.4 §3: the active participant's avatar magnifies around
                  // the cell centre so it reads as "this one" at a glance.
                  // v0.7.12: the magnification is the **only** cue now — the
                  // 2px `--primary` ring was dropped (it collided with each
                  // character's own theme colour and read as a second badge).
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
                      // v0.7.11：刚放下的这个编号「盖章」一次（180ms 缩放）。
                      className={pulse[key] === participantId ? 'place-pop' : undefined}
                    >
                      {label}
                    </text>
                  );
                })}
              </svg>
            ) : null}

            {placement.kind === 'forbidden' ? (
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
                  // v0.7.12：`×` 有自己的一支动效 —— 从 0.35 倍弹到 1.16 倍再落定，
                  // 带一点回正的轻微旋转。编号的 `place-pop` 是「盖章」，这个更像
                  // 「划掉」，两者不该长得一模一样。
                  className={pulse[key] === null ? 'forbidden-pop' : undefined}
                >
                  ×
                </text>
              </svg>
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
  // v0.5.1 FEAT-L02 / SPEC-L03: a colour block paints the avatar disc instead
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
