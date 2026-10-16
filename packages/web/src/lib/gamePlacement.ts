import {
  GAME_NUMBER_GRID,
  GAME_NUMBER_GRID_CELLS,
  GAME_PLACEMENT_HISTORY_MAX,
  type CellCoord,
  type CharacterSlotEntry,
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
 * SPEC-G05 §5.2 (docs/v0.4.1.md §5): where this participant already sits, or
 * `null` when they are not on the board. A participant occupies **at most one**
 * cell, so the first hit is the only hit.
 */
export function participantPlacementAt(
  board: GamePlacementBoard,
  participantId: number,
): CellCoord | null {
  for (const [key, placement] of Object.entries(board)) {
    if (!placement || placement.kind === 'forbidden') continue;
    if (!hasParticipant(placement, participantId)) continue;
    const [x, y] = key.split(',').map(Number);
    return { x: x as number, y: y as number };
  }
  return null;
}

/**
 * SPEC-G05 §5.3: every participant currently on the board — the game page
 * fades their roster card and the uniqueness rule consults this set.
 */
export function placedParticipantIds(board: GamePlacementBoard): Set<number> {
  const placed = new Set<number>();
  for (const placement of Object.values(board)) {
    if (!placement || placement.kind === 'forbidden') continue;
    for (const entry of numbersIn(placement)) placed.add(entry);
  }
  return placed;
}

/** SPEC-G05 §5.2 / §8.1: 1-based `R{row} C{col}` label used in toasts. */
export function formatCellLabel(coord: CellCoord): string {
  return `R${coord.y + 1} C${coord.x + 1}`;
}

/** SPEC-G05 §5.2: why a participant placement was refused, for the toast. */
export type PlacementBlock =
  | 'non-standable'
  | 'forbidden'
  | 'avatar'
  | 'duplicate'
  | 'grid-full'
  | 'elsewhere';

/**
 * SPEC-G01 §7.2 + SPEC-G03 §9.2 + SPEC-G05 §5.2: the single source of truth for
 * "may this participant land here?". `canPlaceParticipant` is a thin reading of
 * it, and the page turns the code into a toast — so the rule and its explanation
 * can never drift apart.
 */
export function placementBlockReason(input: {
  board: GamePlacementBoard;
  x: number;
  y: number;
  participantId: number;
  noStandCells: Set<string>;
  variant?: ParticipantPlacementVariant;
}): PlacementBlock | null {
  const { board, x, y, participantId, noStandCells, variant = 'number' } = input;
  if (noStandCells.has(cellKey(x, y))) return 'non-standable';

  // SPEC-G05: one participant, one cell. The participant's own cell is the only
  // exception — a long-press there is a "promote to avatar", not a second place.
  const elsewhere = participantPlacementAt(board, participantId);
  if (elsewhere && (elsewhere.x !== x || elsewhere.y !== y)) return 'elsewhere';

  const placement = placementAt(board, x, y);
  if (!placement) return null;
  if (placement.kind === 'forbidden') return 'forbidden';
  if (hasParticipant(placement, participantId)) {
    // A tap has nothing left to add; a long-press promotes a carried number to
    // the avatar — unless the cell already *is* that avatar.
    if (variant !== 'image') return 'duplicate';
    return placement.kind === 'participant' ? 'avatar' : null;
  }
  // A long-press replaces the cell wholesale, so a full grid is no obstacle.
  if (variant === 'image') return null;
  return numbersIn(placement).length < GAME_NUMBER_GRID_CELLS ? null : 'grid-full';
}

/** SPEC-G01 / SPEC-G03 / SPEC-G05: `true` when nothing blocks the placement. */
export function canPlaceParticipant(input: {
  board: GamePlacementBoard;
  x: number;
  y: number;
  participantId: number;
  noStandCells: Set<string>;
  variant?: ParticipantPlacementVariant;
}): boolean {
  return placementBlockReason(input) === null;
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
 * SPEC-G06 §6.1 (docs/v0.4.1.md §6): after a participant lands on (x, y), the
 * rest of that **row** and **column** is closed off with `×` — a standable cell
 * with no `×` and no avatar. A cell that only carries other participants'
 * numbers is overwritten (§6.2 方案 A): the `×` wins and those participants lose
 * their only marker, so they become placeable again.
 *
 * Returns the cells that should carry a `×` (the caller merges them in), so the
 * placement + the sweep stay **one** undo step.
 */
export function autoForbiddenCells(input: {
  board: GamePlacementBoard;
  x: number;
  y: number;
  gridSize: number;
  noStandCells: Set<string>;
}): string[] {
  const { board, x, y, gridSize, noStandCells } = input;
  const keys: string[] = [];
  const consider = (cx: number, cy: number): void => {
    if (cx === x && cy === y) return;
    const key = cellKey(cx, cy);
    if (noStandCells.has(key)) return;
    const placement = placementAt(board, cx, cy);
    if (placement?.kind === 'forbidden') return;
    if (showsAvatar(placement)) return;
    keys.push(key);
  };
  for (let column = 0; column < gridSize; column += 1) consider(column, y);
  for (let row = 0; row < gridSize; row += 1) consider(x, row);
  return keys;
}

/**
 * SPEC-G03 §9.2（v0.4.0 验收补充后）+ SPEC-G06（v0.4.1）：
 *
 * - `variant: 'number'`（短按，默认）：往该格追加一个标号——空格得到 9 宫格
 *   第 1 格的标号，已有其他参与者标号则续接；该参与者标号已存在则无效果。
 * - `variant: 'image'`（长按）：整格替换为该参与者的头像，即「确认这格就是
 *   这位参与者」；该格已是同一头像时无效果（`commit` 的结构比较会拦住）。
 * - 落格之后**同行同列自动补 `×`**（SPEC-G06），与本次放置合并为一个历史步。
 */
export function placeParticipant(
  state: GamePlacementState,
  input: {
    x: number;
    y: number;
    participantId: number;
    noStandCells: Set<string>;
    /** SPEC-G06: the row/column sweep needs to know how far the board extends. */
    gridSize: number;
    variant?: ParticipantPlacementVariant;
  },
): GamePlacementState {
  const variant = input.variant ?? 'number';
  if (!canPlaceParticipant({ ...input, board: state.board, variant })) return state;
  const key = cellKey(input.x, input.y);
  let board: GamePlacementBoard;
  if (variant === 'image') {
    board = {
      ...state.board,
      [key]: { kind: 'participant', index: input.participantId },
    };
  } else {
    const previous = placementAt(state.board, input.x, input.y);
    const numbers = previous
      ? [...numbersIn(previous), input.participantId]
      : [input.participantId];
    board = { ...state.board, [key]: { kind: 'numbers', entries: numbers } };
  }

  // SPEC-G06: one gesture → one history step, sweep included.
  for (const swept of autoForbiddenCells({
    board,
    x: input.x,
    y: input.y,
    gridSize: input.gridSize,
    noStandCells: input.noStandCells,
  })) {
    board[swept] = { kind: 'forbidden' };
  }

  return commit(state, board);
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

// ---------------------------------------------------------------------------
// FEAT-V01 (docs/v0.4.1.md §8): the submit check
// ---------------------------------------------------------------------------

export type PlacementIssueCode = 'unplaced' | 'row' | 'column' | 'condition';

export interface PlacementIssue {
  /** 1-based participant number, matching the roster badge and the numbers. */
  participantId: number;
  code: PlacementIssueCode;
  message: string;
}

export interface PlacementValidation {
  passed: boolean;
  issues: PlacementIssue[];
}

export interface ValidatePlacementInput {
  board: GamePlacementBoard;
  /**
   * The roster, in display order. Index + 1 is the participant number; `null`
   * entries are empty frames and are not validated. Position conditions are
   * read straight off each slot (§7.4), so there is exactly one source of truth.
   */
  slots: Array<CharacterSlotEntry | null>;
  /** Optional name lookup so a message can read `编号 3（张三）尚未放置`. */
  nameOf?: (participantId: number) => string | undefined;
}

/**
 * SPEC-FEAT-V01 §8.1: walk the participants in number order and collect **every**
 * problem (the dialog lists them all, so no early exit):
 *
 * 1. the participant must be on the board;
 * 2. nobody else may share its row;
 * 3. nobody else may share its column;
 * 4. if the participant carries position conditions, its cell must be one of
 *    them — an empty list means "no positional constraint" (§14 Q11).
 *
 * Rows/columns are reported from both sides of a clash (each participant gets
 * its own issue), which keeps the list a straight projection of the roster.
 */
export function validatePlacement(input: ValidatePlacementInput): PlacementValidation {
  const { board, slots } = input;
  const issues: PlacementIssue[] = [];

  const label = (participantId: number): string => {
    const name = input.nameOf?.(participantId);
    return name && name.length > 0 ? `编号 ${participantId}（${name}）` : `编号 ${participantId}`;
  };

  /** occupant map: cellKey → participant numbers, restricted to the roster. */
  const occupants = new Map<string, number[]>();
  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const coord = participantPlacementAt(board, participantId);
    if (!coord) return;
    const key = cellKey(coord.x, coord.y);
    occupants.set(key, [...(occupants.get(key) ?? []), participantId]);
  });

  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const coord = participantPlacementAt(board, participantId);

    if (!coord) {
      issues.push({
        participantId,
        code: 'unplaced',
        message: `${label(participantId)} 尚未放置`,
      });
      return;
    }

    // Row / column exclusivity — everyone else on this row or column clashes.
    const sameRow: number[] = [];
    const sameColumn: number[] = [];
    for (const [key, ids] of occupants) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      for (const other of ids) {
        if (other === participantId) continue;
        if (y === coord.y) sameRow.push(other);
        if (x === coord.x) sameColumn.push(other);
      }
    }
    for (const other of dedupeSorted(sameRow)) {
      issues.push({
        participantId,
        code: 'row',
        message: `${label(participantId)} 与${label(other)} 同在第 ${coord.y + 1} 行`,
      });
    }
    for (const other of dedupeSorted(sameColumn)) {
      issues.push({
        participantId,
        code: 'column',
        message: `${label(participantId)} 与${label(other)} 同在第 ${coord.x + 1} 列`,
      });
    }

    const conditions = slot.positionConditions ?? [];
    if (conditions.length > 0) {
      const allowed = conditions.some((entry) => entry.x === coord.x && entry.y === coord.y);
      if (!allowed) {
        const options = conditions.map((entry) => formatCellLabel({ x: entry.x, y: entry.y }));
        issues.push({
          participantId,
          code: 'condition',
          message: `${label(participantId)} 位于 ${formatCellLabel(coord)}，不在其位置条件内（可选 ${options.join(' / ')}）`,
        });
      }
    }
  });

  issues.sort((a, b) => a.participantId - b.participantId);
  return { passed: issues.length === 0, issues };
}

function dedupeSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
