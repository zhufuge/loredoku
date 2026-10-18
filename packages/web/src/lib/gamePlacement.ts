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
 * SPEC-G05 §5.2 (docs/v0.4.1.md §5) + SPEC-J05 (docs/v0.4.3.md §3.6): where this
 * participant "is" — the confirmed cell, or `null` when nothing counts.
 *
 * SPEC-J05: a 编号 is a **candidate** mark and may sit on several cells at once,
 * so "where is this participant" is decided in three steps:
 *
 * 1. an **avatar** wins outright — that is the confirmed cell (there is at most
 *    one, which `placementBlockReason` enforces);
 * 2. with no avatar, the participant's 编号 must sit on **exactly one** cell —
 *    the v0.4.1 leniency: a lone mark still answers the question;
 * 3. several candidate marks and no avatar → `null`: nothing is confirmed, so
 *    `validatePlacement` says "unplaced" instead of picking a candidate at random.
 */
export function participantPlacementAt(
  board: GamePlacementBoard,
  participantId: number,
): CellCoord | null {
  let candidate: CellCoord | null = null;
  let candidates = 0;
  for (const [key, placement] of Object.entries(board)) {
    if (!placement || placement.kind === 'forbidden') continue;
    if (!hasParticipant(placement, participantId)) continue;
    const [x, y] = key.split(',').map(Number);
    const coord = { x: x as number, y: y as number };
    if (placement.kind === 'participant') return coord;
    candidate = coord;
    candidates += 1;
  }
  return candidates === 1 ? candidate : null;
}

/**
 * SPEC-J05: how many cells carry this participant as a **candidate 编号** (an
 * avatar cell is not counted). The submit check uses it to tell "never touched"
 * apart from "marked candidates but never confirmed".
 */
export function candidateCellCount(board: GamePlacementBoard, participantId: number): number {
  let count = 0;
  for (const placement of Object.values(board)) {
    if (placement?.kind !== 'numbers') continue;
    if (placement.entries.includes(participantId)) count += 1;
  }
  return count;
}

/**
 * SPEC-G05 §5.3: every participant with **any** mark on the board — a 编号
 * counts, and so does an avatar. The uniqueness rule consults this set.
 *
 * v0.5.1 SPEC-L05: the roster card **no longer fades** on a 编号, so the game
 * page fades with {@link avatarPlacedParticipantIds} instead. This function
 * keeps its original meaning for the uniqueness rule and its tests.
 */
export function placedParticipantIds(board: GamePlacementBoard): Set<number> {
  const placed = new Set<number>();
  for (const placement of Object.values(board)) {
    if (!placement || placement.kind === 'forbidden') continue;
    for (const entry of numbersIn(placement)) placed.add(entry);
  }
  return placed;
}

/**
 * v0.5.1 SPEC-L05 (docs/v0.5.1.md §5.1): the participants whose **avatar** is
 * on the board — a 编号 alone does **not** count.
 *
 * Before v0.5.1 the roster card faded for any mark, which made placing a
 * candidate number dim the card as if it were done. Only an avatar means
 * "placed", so this is the set the game page fades with.
 */
export function avatarPlacedParticipantIds(board: GamePlacementBoard): Set<number> {
  const placed = new Set<number>();
  for (const placement of Object.values(board)) {
    if (placement?.kind !== 'participant') continue;
    placed.add(placement.index);
  }
  return placed;
}

/** SPEC-G05 §5.2 / §8.1: 1-based `R{row} C{col}` label used in toasts. */
export function formatCellLabel(coord: CellCoord): string {
  return `R${coord.y + 1} C${coord.x + 1}`;
}

/**
 * SPEC-G05 §5.2: why a participant placement was refused, for the toast.
 *
 * SPEC-J05 §3.6: `'elsewhere'` now means **"this participant's avatar is already
 * confirmed on another cell"** — a mere candidate 编号 elsewhere is not a reason
 * to refuse any more, so the old 「编号 N 已放置在 R{r} C{c}」 toast is gone.
 *
 * SPEC-J03 §9 Q6 (docs/v0.4.3.md): `'duplicate'` stays in the union even though
 * no path returns it any more — tapping a cell that already carries this number
 * is the **toggle-off** case now (allowed), not a refusal. Keeping the member
 * avoids churning the union / the page's `switch` for a purely cosmetic win.
 */
export type PlacementBlock =
  | 'non-standable'
  | 'forbidden'
  | 'avatar'
  | 'duplicate'
  | 'grid-full'
  | 'elsewhere';

/**
 * SPEC-G01 §7.2 + SPEC-G03 §9.2 + SPEC-G05 §5.2 + SPEC-J03 §3.2 + SPEC-J05 §3.6:
 * the single source of truth for "may this participant land here?".
 * `canPlaceParticipant` is a thin reading of it, and the page turns the code into
 * a toast — so the rule and its explanation can never drift apart.
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

  // SPEC-J05 §3.6 (docs/v0.4.3.md): a 编号 is a **candidate** mark and one
  // participant may carry it on many cells at once — so a short press is never
  // blocked by uniqueness, and never reports "already elsewhere".
  //
  // The **avatar** is the unique thing. A long press confirms a cell, so it is
  // refused only when the participant has already confirmed *another* cell —
  // `participantPlacementAt` prefers the avatar cell, and returns a lone
  // candidate otherwise (or `null` when there are several). A long press on a
  // cell while the participant's other marks are mere candidates is exactly the
  // confirmation step: it is allowed, and SPEC-H01 then clears those candidates.
  const confirmed = participantPlacementAt(board, participantId);
  if (variant === 'image' && confirmed && (confirmed.x !== x || confirmed.y !== y)) {
    return 'elsewhere';
  }

  const placement = placementAt(board, x, y);
  if (!placement) return null;
  if (placement.kind === 'forbidden') return 'forbidden';
  if (hasParticipant(placement, participantId)) {
    // The cell already belongs to this participant:
    // - `participant` (avatar): a long-press there changes nothing and a tap is
    // not a number to remove — refused either way;
    // - `numbers`: a long-press promotes it to the avatar, a tap removes the
    //   number (SPEC-J03 §3.2 toggle). Both are allowed.
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
 * SPEC-H01 (docs/v0.4.2.md §1.2) + SPEC-J05 §3.6 (docs/v0.4.3.md): once a
 * participant is **confirmed** (long-press → avatar), their number must survive
 * in exactly one cell — the confirmed one. Candidate marks elsewhere are stale.
 *
 * SPEC-J05 narrowed the caller: only `placeParticipant`'s **image** branch runs
 * this. Short presses are free to leave the same number on many cells.
 *
 * A cell that loses its only entry is **deleted** (it becomes empty, not `×`).
 * Cells that still hold other participants' numbers keep their form.
 *
 * Returns the board unchanged (same reference) when there is nothing to sweep,
 * so the caller's single `commit` stays a no-op.
 */
export function sweepParticipantNumbers(
  board: GamePlacementBoard,
  input: { participantId: number; except: CellCoord },
): GamePlacementBoard {
  const next: GamePlacementBoard = {};
  let changed = false;
  for (const [key, placement] of Object.entries(board)) {
    if (!placement) continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    const isAnchor = x === input.except.x && y === input.except.y;
    if (isAnchor || placement.kind !== 'numbers' || !placement.entries.includes(input.participantId)) {
      next[key] = placement;
      continue;
    }
    const entries = placement.entries.filter((entry) => entry !== input.participantId);
    changed = true;
    if (entries.length > 0) next[key] = { kind: 'numbers', entries };
  }
  return changed ? next : board;
}

/**
 * SPEC-G03 §9.2+ SPEC-G06+ SPEC-H01
 * + SPEC-J02 / SPEC-J03 / SPEC-J05：
 *
 * - `variant: 'number'`（**短按**，默认）—— 放的是这位参与者的**编号**，而且是一次
 *   **切换**（SPEC-J03 §3.2）：
 *   - 该格**已有**该编号 → **删除**这一个 entry；删到空则**整格删除**（回到空格，
 *     **不是** `×`）；
 *   - 该格**没有**该编号 → 追加为九宫格的下一格（空格得到第 1 格）。
 *   - SPEC-J02：**不**补同行同列的 `×`。
 *   - SPEC-J05：**不看唯一性** —— 同一位参与者的编号可以同时留在多个格子上（都是
 *     候选标记），所以加入路径**也不做** SPEC-H01 的清理。
 * - `variant: 'image'`（**长按**）—— 这才是「把参与者放到格子上」：整格替换为该
 *   参与者的头像；该格已是同一头像时无效果（`commit` 的结构比较会拦住）。
 *   - SPEC-G06：落格之后**同行同列自动补 `×`**。
 *   - SPEC-H01：把该参与者留在**其它格子的候选编号**清除（头像只有一个），
 *     与本次放置合并为**一个**历史步。
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
  const previous = placementAt(state.board, input.x, input.y);

  // SPEC-J03 §3.2: a tap on the cell that already carries this number toggles it
  // off. Nothing else happens — no `×` sweep, no number cleanup, just one undo
  // step.
  if (
    variant !== 'image' &&
    previous?.kind === 'numbers' &&
    previous.entries.includes(input.participantId)
  ) {
    const board = { ...state.board };
    const entries = previous.entries.filter((entry) => entry !== input.participantId);
    if (entries.length > 0) board[key] = { kind: 'numbers', entries };
    else delete board[key];
    return commit(state, board);
  }

  let board: GamePlacementBoard;
  if (variant === 'image') {
    board = {
      ...state.board,
      [key]: { kind: 'participant', index: input.participantId },
    };
  } else {
    // SPEC-J05 §3.6: the number is a candidate mark — it stacks onto whatever the
    // cell already carries and stays on every cell it was tapped on.
    const numbers = previous
      ? [...numbersIn(previous), input.participantId]
      : [input.participantId];
    board = { ...state.board, [key]: { kind: 'numbers', entries: numbers } };
  }

  // SPEC-J02 §2.2 + SPEC-J05 §3.6: both follow-ups are **long-press**
  // consequences only — a candidate 编号 stays free of row/column exclusions and
  // keeps its copies on the other cells, so only the confirmation step pays them.
  if (variant === 'image') {
    for (const swept of autoForbiddenCells({
      board,
      x: input.x,
      y: input.y,
      gridSize: input.gridSize,
      noStandCells: input.noStandCells,
    })) {
      board[swept] = { kind: 'forbidden' };
    }

    // SPEC-H01: the confirmed avatar is now the participant's only cell — the
    // candidate numbers it left behind elsewhere are stale.
    board = sweepParticipantNumbers(board, {
      participantId: input.participantId,
      except: { x: input.x, y: input.y },
    });
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
 * 1. the participant must be on the board — `participantPlacementAt` decides what
 *    that means (SPEC-J05 §3.6: a confirmed avatar, or a lone candidate 编号);
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
      // SPEC-J05 §3.6: a participant with several candidate 编号 and no avatar has
      // *touched* the board without *confirming* anything — say so, instead of
      // the bare 「尚未放置」 the player would read as "my taps did nothing".
      const candidates = candidateCellCount(board, participantId);
      issues.push({
        participantId,
        code: 'unplaced',
        message:
          candidates > 0
            ? `${label(participantId)} 尚未确认（${candidates} 格只有候选编号，长按格子放置头像才算放置）`
            : `${label(participantId)} 尚未放置`,
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
