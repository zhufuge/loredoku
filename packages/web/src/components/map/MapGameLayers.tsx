import {
  GAME_FORBIDDEN_FONT_RATIO,
  GAME_NUMBER_FONT_RATIO,
  GAME_NUMBER_STROKE_RATIO,
  GAME_TOOL_HINT_ERASER_COLOR,
  GAME_TOOL_HINT_FORBIDDEN_COLOR,
  MAP_LAYER_Z,
  type CellCoord,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import type { GamePlacementBoard } from '@loredoku/shared';
import { objectPadding } from '@/lib/canvasScale';
import { numberSlotAnchor, type GameToolHint } from '@/lib/gamePlacement';
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
 */
export function MapGameToolHintLayer({
  hint,
  cell,
  cellSize,
  themeColors,
}: {
  hint: GameToolHint | null;
  cell: CellCoord | null;
  cellSize: number;
  /** Slot index → theme colour, for the number glyph. */
  themeColors: Map<number, string>;
}): JSX.Element | null {
  if (!hint || !cell) return null;
  const total = cellSize;
  const glyph = ((): JSX.Element => {
    if (hint.kind === 'number') {
      const fontSize = cellSize * GAME_NUMBER_FONT_RATIO;
      const anchor = numberSlotAnchor(0);
      return (
        <text
          x={anchor.x * total}
          y={anchor.y * total}
          fill={themeColors.get(hint.participantId) ?? '#000000'}
          stroke="#000000"
          strokeWidth={fontSize * GAME_NUMBER_STROKE_RATIO}
          paintOrder="stroke fill"
          fontSize={fontSize}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
        >
          {hint.participantId}
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
 */
export function MapGamePlacementLayer({
  board,
  slots,
  charactersById,
  cellSize,
}: {
  board: GamePlacementBoard;
  slots: Array<CharacterSlotEntry | null>;
  charactersById: Map<number, Character>;
  cellSize: number;
}): JSX.Element | null {
  const entries = Object.entries(board).filter(([, placement]) => placement !== null && placement !== undefined);
  if (entries.length === 0) return null;
  const numberFontSize = cellSize * GAME_NUMBER_FONT_RATIO;
  const numberStroke = numberFontSize * GAME_NUMBER_STROKE_RATIO;
  const forbiddenFontSize = cellSize * GAME_FORBIDDEN_FONT_RATIO;
  const avatarPadding = objectPadding(cellSize);

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
              <ParticipantAvatar
                slot={slots[placement.index - 1] ?? null}
                charactersById={charactersById}
                padding={avatarPadding}
              />
            ) : null}

            {placement.kind === 'numbers' ? (
              <svg className="absolute left-0 top-0" width={cellSize} height={cellSize}>
                {placement.entries.map((participantId, index) => {
                  const anchor = numberSlotAnchor(index);
                  return (
                    <text
                      key={`num-${key}-${participantId}-${index}`}
                      x={anchor.x * cellSize}
                      y={anchor.y * cellSize}
                      fill={slots[participantId - 1]?.themeColor ?? '#000000'}
                      stroke="#000000"
                      strokeWidth={numberStroke}
                      paintOrder="stroke fill"
                      fontSize={numberFontSize}
                      fontWeight={700}
                      textAnchor="middle"
                      dominantBaseline="central"
                    >
                      {participantId}
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
