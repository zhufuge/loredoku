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
 * 层 5 · 游戏放置层（Game Placement Layer）— SPEC-G01 (docs/v0.4.0.md §7).
 *
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
}: {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cellSize: number;
  /** 1-based participant id (the board's numbering); `null` = nobody active. */
  activeParticipantId?: number | null;
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
                className="absolute"
                style={{
                  inset: 0,
                  // v0.6.4 §3: the active participant's avatar magnifies around
                  // the cell centre, with a ring so it reads as "this one" even
                  // at a glance. Inactive avatars are untouched.
                  transform:
                    placement.index === activeParticipantId
                      ? `scale(${GAME_ACTIVE_PARTICIPANT_AVATAR_SCALE})`
                      : undefined,
                  transformOrigin: 'center',
                  transition: 'transform 150ms ease-out',
                  borderRadius: '50%',
                  boxShadow:
                    placement.index === activeParticipantId
                      ? '0 0 0 2px hsl(var(--primary))'
                      : undefined,
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
