import {
  GAME_NUMBER_GRID,
  GAME_NUMBER_GRID_CELLS,
  GAME_PLACEMENT_HISTORY_MAX,
} from '@loredoku/shared';
import type { CellPlacement, GamePlacementBoard } from '@loredoku/shared';

/**
 * SPEC-G01 / SPEC-G03 / SPEC-G04 (docs/v0.4.0.md §7 ~ §10): the game board's
 * placement rules, as pure functions.
 *
 * Every mutator returns a **new** `GamePlacementState` and pushes the previous
 * board onto the undo stack — except when the operation is a no-op (a rejected
 * placement, a clear on an empty cell), which returns the state untouched so a
 * rejected click never eats an undo step.
 */

/** Which of the mutually exclusive interaction modes the toolbar is in. */
export type GameOperationMode =
  | { kind: 'idle' }
  /** A roster card was clicked: the next cell click places this participant. */
  | { kind: 'placing'; participantId: number }
  | { kind: 'forbidden' }
  | { kind: 'clearing' };

export interface GamePlacementState {
  board: GamePlacementBoard;
  /** Older boards, newest last. Capped at `GAME_PLACEMENT_HISTORY_MAX`. */
  past: GamePlacementBoard[];
  future: GamePlacementBoard[];
  /**
   * SPEC-G04 §10.4: how many entries of `past` existed when the player last
   * submitted. Undo stops there — the player may not step back past their own
   * submission. `0` means nothing was ever submitted.
   */
  submittedPastLength: number;
}

/** What the tool-hint layer draws over the hovered cell (SPEC-G02). */
export type GameToolHint =
  | { kind: 'number'; participantId: number }
  | { kind: 'forbidden' }
  | { kind: 'eraser' };

/**
 * v0.4.0 验收补充（SPEC-G03 §9.2）：同一次「放置参与者」手势的两种落点——
 * **短按（点击）放标号**，**长按放头像**。
 *
 * - `number`：往该格的 9 宫格里追加一个标号（空格 → 第 1 格）；
 * - `image`：整格替换为该参与者的头像（`{ kind: 'participant' }`），
 *   即「确认这格就是这位参与者」，原有标号被覆盖。
 */
export type ParticipantPlacementVariant = 'number' | 'image';

export function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function createGamePlacementState(): GamePlacementState {
  return { board: {}, past: [], future: [], submittedPastLength: 0 };
}

export function placementAt(
  board: GamePlacementBoard,
  x: number,
  y: number,
): CellPlacement | null {
  return board[cellKey(x, y)] ?? null;
}

/** The participant numbers a cell carries — one for an avatar, many for a 3×3. */
export function numbersIn(placement: CellPlacement | null): number[] {
  if (!placement) return [];
  if (placement.kind === 'participant') return [placement.index];
  if (placement.kind === 'numbers') return placement.entries;
  return [];
}

export function hasParticipant(placement: CellPlacement | null, participantId: number): boolean {
  return numbersIn(placement).includes(participantId);
}

/** True when the cell shows a participant avatar (exactly one participant). */
export function showsAvatar(placement: CellPlacement | null): boolean {
  return placement?.kind === 'participant';
}

/**
 * SPEC-G01 §7.2 + SPEC-G03 §9.2: a participant may be placed when the cell is
 * standable, carries no `×`, does not already hold this participant's number,
 * and still has a free slot in the 3×3 number grid.
 *
 * v0.4.0 验收补充：`variant: 'image'`（长按）走「确认」语义——整格替换为头像，
 * 因此 9 宫格已满不构成阻碍，但「已是该参与者头像」仍是无效果。
 */
export function canPlaceParticipant(input: {
  board: GamePlacementBoard;
  x: number;
  y: number;
  participantId: number;
  noStandCells: Set<string>;
  variant?: ParticipantPlacementVariant;
}): boolean {
  const { board, x, y, participantId, noStandCells, variant = 'number' } = input;
  if (noStandCells.has(cellKey(x, y))) return false;
  const placement = placementAt(board, x, y);
  if (!placement) return true;
  if (placement.kind === 'forbidden') return false;
  if (hasParticipant(placement, participantId)) {
    // A tap has nothing left to add; a long-press promotes a carried number
    // to the avatar — unless the cell already *is* that avatar.
    return variant === 'image' && placement.kind !== 'participant';
  }
  // A long-press replaces the cell wholesale, so a full grid is no obstacle.
  if (variant === 'image') return true;
  return numbersIn(placement).length < GAME_NUMBER_GRID_CELLS;
}

/**
 * SPEC-G04 §10.1: `×` may be placed on any standable cell that does not show a
 * participant avatar. A numbers-only cell (two or more participants) is
 * overwritten — the numbers are cleared and replaced by the `×`.
 */
export function canPlaceForbidden(input: {
  board: GamePlacementBoard;
  x: number;
  y: number;
  noStandCells: Set<string>;
}): boolean {
  const { board, x, y, noStandCells } = input;
  if (noStandCells.has(cellKey(x, y))) return false;
  return !showsAvatar(placementAt(board, x, y));
}

/** SPEC-G04 §10.3: one history step per mutating operation. */
function commit(
  state: GamePlacementState,
  board: GamePlacementBoard,
): GamePlacementState {
  if (boardEquals(state.board, board)) return state;
  let past = [...state.past, state.board];
  // The oldest entry is dropped first; the submit barrier follows it down.
  let submittedPastLength = state.submittedPastLength;
  if (past.length > GAME_PLACEMENT_HISTORY_MAX) {
    past = past.slice(past.length - GAME_PLACEMENT_HISTORY_MAX);
    if (submittedPastLength > 0) submittedPastLength -= 1;
  }
  return { board, past, future: [], submittedPastLength };
}

/**
 * SPEC-G03 §9.2（v0.4.0 验收补充后）：
 *
 * - `variant: 'number'`（短按，默认）：往该格追加一个标号——空格得到 9 宫格
 *   第 1 格的标号，已有其他参与者标号则续接；该参与者标号已存在则无效果。
 * - `variant: 'image'`（长按）：整格替换为该参与者的头像，即「确认这格就是
 *   这位参与者」；该格已是同一头像时无效果（`commit` 的结构比较会拦住）。
 */
export function placeParticipant(
  state: GamePlacementState,
  input: {
    x: number;
    y: number;
    participantId: number;
    noStandCells: Set<string>;
    variant?: ParticipantPlacementVariant;
  },
): GamePlacementState {
  const variant = input.variant ?? 'number';
  if (!canPlaceParticipant({ ...input, board: state.board, variant })) return state;
  const key = cellKey(input.x, input.y);
  if (variant === 'image') {
    return commit(state, {
      ...state.board,
      [key]: { kind: 'participant', index: input.participantId },
    });
  }
  const previous = placementAt(state.board, input.x, input.y);
  const numbers = previous ? [...numbersIn(previous), input.participantId] : [input.participantId];
  return commit(state, { ...state.board, [key]: { kind: 'numbers', entries: numbers } });
}

/** SPEC-G04 §10.1: `×` replaces any numbers-only cell and blocks a new one. */
export function placeForbidden(
  state: GamePlacementState,
  input: { x: number; y: number; noStandCells: Set<string> },
): GamePlacementState {
  if (!canPlaceForbidden({ ...input, board: state.board })) return state;
  const key = cellKey(input.x, input.y);
  if (placementAt(state.board, input.x, input.y)?.kind === 'forbidden') return state;
  return commit(state, { ...state.board, [key]: { kind: 'forbidden' } });
}

/** SPEC-G04 §10.2: clearing one cell; a cell with nothing is a no-op. */
export function clearCell(
  state: GamePlacementState,
  input: { x: number; y: number },
): GamePlacementState {
  const key = cellKey(input.x, input.y);
  if (!placementAt(state.board, input.x, input.y)) return state;
  const board = { ...state.board };
  delete board[key];
  return commit(state, board);
}

/** SPEC-G04 §10.2 §5: the long-press wipe — recorded as a single undo step. */
export function clearAll(state: GamePlacementState): GamePlacementState {
  return commit(state, {});
}

export function canUndo(state: GamePlacementState): boolean {
  return state.past.length > state.submittedPastLength;
}

export function canRedo(state: GamePlacementState): boolean {
  return state.future.length > 0;
}

export function undo(state: GamePlacementState): GamePlacementState {
  if (!canUndo(state)) return state;
  const previous = state.past[state.past.length - 1]!;
  return {
    board: previous,
    past: state.past.slice(0, -1),
    future: [state.board, ...state.future],
    submittedPastLength: Math.min(state.submittedPastLength, state.past.length - 1),
  };
}

export function redo(state: GamePlacementState): GamePlacementState {
  if (!canRedo(state)) return state;
  const next = state.future[0]!;
  return {
    board: next,
    past: [...state.past, state.board],
    future: state.future.slice(1),
    submittedPastLength: state.submittedPastLength,
  };
}

/**
 * SPEC-G04 §10.4: submitting marks the current history depth as the wall the
 * undo stack may not cross. The board itself is untouched — the player keeps
 * playing afterwards and may submit again.
 */
export function submitPlacement(state: GamePlacementState): GamePlacementState {
  return { ...state, submittedPastLength: state.past.length };
}

/** SPEC-G01 §7.1: a placed `×` also activates the cell's non-standable mask. */
export function forbiddenCells(board: GamePlacementBoard): Set<string> {
  const cells = new Set<string>();
  for (const [key, placement] of Object.entries(board)) {
    if (placement?.kind === 'forbidden') cells.add(key);
  }
  return cells;
}

/** Total number of placed cells, for the toolbar's step counter. */
export function countPlacements(board: GamePlacementBoard): number {
  let count = 0;
  for (const placement of Object.values(board)) {
    if (placement) count += 1;
  }
  return count;
}

/**
 * SPEC-G02 §2: the hint follows the mode, not the board — placing a symbol
 * never clears it, only leaving the cell does (that part lives in the page).
 *
 * A non-standable cell accepts no placement at all, so it shows no hint; the
 * eraser is the one exception the spec calls out and is always shown.
 */
export function resolveToolHint(input: {
  mode: GameOperationMode;
  placement: CellPlacement | null;
  nonStandable: boolean;
}): GameToolHint | null {
  const { mode, placement, nonStandable } = input;
  if (mode.kind === 'idle') return null;
  if (mode.kind === 'clearing') return { kind: 'eraser' };
  if (mode.kind === 'placing') {
    if (nonStandable) return null;
    return { kind: 'number', participantId: mode.participantId };
  }
  if (nonStandable) return null;
  if (placement?.kind === 'participant') return null;
  return { kind: 'forbidden' };
}

/**
 * SPEC-G01 §7.1: the 3×3 sub-grid position of the i-th number inside its cell,
 * as a 0..1 anchor pair (the renderer multiplies by `cellSize`).
 */
export function numberSlotAnchor(index: number): { x: number; y: number } {
  const column = index % GAME_NUMBER_GRID;
  const row = Math.floor(index / GAME_NUMBER_GRID);
  return {
    x: (column + 0.5) / GAME_NUMBER_GRID,
    y: (row + 0.5) / GAME_NUMBER_GRID,
  };
}

/**
 * Structural comparison — `commit` uses it to detect a no-op placement, so a
 * rejected click never occupies an undo step.
 */
export function boardEquals(a: GamePlacementBoard, b: GamePlacementBoard): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!placementEquals(a[key] ?? null, b[key] ?? null)) return false;
  }
  return true;
}

function placementEquals(a: CellPlacement | null, b: CellPlacement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'participant' && b.kind === 'participant') return a.index === b.index;
  if (a.kind === 'numbers' && b.kind === 'numbers') {
    if (a.entries.length !== b.entries.length) return false;
    return a.entries.every((entry, index) => entry === b.entries[index]);
  }
  return true;
}
