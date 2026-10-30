import {
  GAME_NUMBER_GRID,
  GAME_NUMBER_GRID_CELLS,
  GAME_PLACEMENT_HISTORY_MAX,
  type CellCoord,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import type { CellPlacement, GamePlacementBoard } from '@loredoku/shared';
import { estimateTextWidth } from './textWidth';

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
  return { board: {}, past: [], future: [] };
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
 *    the caller can tell "never touched" from "marked candidates but never
 *    confirmed".
 *
 * v0.7.12：**提交校验不再用它**。判卷只认头像（`avatarCellOf`）—— 见
 * `validatePlacement` 的注释。这个函数保留下来，是因为「编号也算一个位置」
 * 在**画面上**仍然成立（提示层、联动高亮都按它指的地方画），只是不再决定
 * 交卷的结果。
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

/**
 * v0.7.12：名单上的每一位都**已经有头像**了吗？—— 提交按钮的可用条件。
 *
 * 只数头像（`avatarPlacedParticipantIds`），编号不算：编号是草稿，草稿不是交卷。
 * 空槽（`null`）不参与判断，一份 3 人名单里的第 4 格是空格时不该拦着玩家提交。
 */
export function allParticipantsPlaced(
  board: GamePlacementBoard,
  slots: Array<CharacterSlotEntry | null>,
): boolean {
  const placed = avatarPlacedParticipantIds(board);
  return slots.every((slot, index) => !slot || placed.has(index + 1));
}

/** SPEC-G05 §5.2 / §8.1: 1-based `R{row} C{col}` label used in toasts. */
export function formatCellLabel(coord: CellCoord): string {
  return `R${coord.y + 1} C${coord.x + 1}`;
}

/**
 * SPEC-G05 §5.2: why a participant placement was refused, for the toast.
 *
 * v0.7.11: `'elsewhere'` 不再存在 —— 长按另一个格子不会因为「已经放在别处」
 * 被拒，而是**把头像搬过去**（旧格释放，见 `placeParticipant`）。玩家改主意
 * 不是错误。
 *
 * SPEC-J03 §9 Q6 (docs/v0.4.3.md): `'duplicate'` stays in the union even though
 * no path returns it any more — tapping a cell that already carries this number
 * is the **toggle-off** case now (allowed), not a refusal. Keeping the member
 * avoids churning the union / the page's `switch` for a purely cosmetic win.
 */
export type PlacementBlock = 'non-standable' | 'forbidden' | 'avatar' | 'duplicate' | 'grid-full';

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
  blockingCells: Set<string>;
  variant?: ParticipantPlacementVariant;
}): PlacementBlock | null {
  const { board, x, y, participantId, blockingCells, variant = 'number' } = input;
  if (blockingCells.has(cellKey(x, y))) return 'non-standable';

  // SPEC-J05 §3.6 (docs/v0.4.3.md): a 编号 is a **candidate** mark and one
  // participant may carry it on many cells at once — so a short press is never
  // blocked by uniqueness.
  //
  // The **avatar** is unique too, but v0.7.11 不再拒绝：长按另一格就是**搬家**
  // （旧格释放、同行同列的自动 `×` 跟着回滚）。唯一性因此由「搬家」满足，
  // 而不是由「报错」满足。
  const placement = placementAt(board, x, y);
  if (!placement) return null;
  if (placement.kind === 'forbidden') return 'forbidden';
  if (placement.kind === 'participant') {
    /**
     * v0.7.12：头像格上**短按无效果**。
     *
     * 之前只有「这一格已经是自己的头像」会被拒；点别人的头像格仍会走九宫格
     * 追加，于是那张脸被编号顶掉（`placeParticipant` 的 numbers 分支整格替换）。
     * 需求要的是：已放置参与者的格子，编号点上去什么都不发生。
     *
     * 长按（`variant: 'image'`）仍允许落在**别人**的头像格上 —— 那是「换人站
     * 这里」，与「编号盖掉头像」不是一回事；自己的头像格一律无效果。
     */
    if (hasParticipant(placement, participantId)) return 'avatar';
    return variant === 'image' ? null : 'avatar';
  }
  // `numbers`：短按删掉自己那一个编号（toggle），长按升级成头像，都允许。
  if (hasParticipant(placement, participantId)) return null;
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
  blockingCells: Set<string>;
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
  blockingCells: Set<string>;
}): boolean {
  const { board, x, y, blockingCells } = input;
  if (blockingCells.has(cellKey(x, y))) return false;
  return !showsAvatar(placementAt(board, x, y));
}

/** SPEC-G04 §10.3: one history step per mutating operation. */
function commit(
  state: GamePlacementState,
  board: GamePlacementBoard,
): GamePlacementState {
  if (boardEquals(state.board, board)) return state;
  let past = [...state.past, state.board];
  // The oldest entry is dropped first.
  if (past.length > GAME_PLACEMENT_HISTORY_MAX) {
    past = past.slice(past.length - GAME_PLACEMENT_HISTORY_MAX);
  }
  return { board, past, future: [] };
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
  blockingCells: Set<string>;
}): string[] {
  const { board, x, y, gridSize, blockingCells } = input;
  const keys: string[] = [];
  const consider = (cx: number, cy: number): void => {
    if (cx === x && cy === y) return;
    const key = cellKey(cx, cy);
    if (blockingCells.has(key)) return;
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
 * 同行同列自动补出来的 `×` 的清理（v0.7.11）。
 *
 * 自动 `×` 是**派生**的：某位头像站在那里，它的整行整列就不许放东西。头像一旦
 * 搬走，那些 `×` 就没有依据了 —— 留在棋盘上等于告诉玩家「这一行还是不能放」。
 *
 * 只删**带 `auto` 标记**且**不在任何头像的行列上**的格子。玩家自己点的 `×`
 * 不带标记，一条都不动；另一位头像仍然占着的行 / 列也照旧保留（那些格子的
 * 「不能放」依然成立）。
 */
export function pruneAutoForbidden(board: GamePlacementBoard): GamePlacementBoard {
  const rows = new Set<number>();
  const columns = new Set<number>();
  for (const [key, placement] of Object.entries(board)) {
    if (placement?.kind !== 'participant') continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    columns.add(x);
    rows.add(y);
  }

  const next: GamePlacementBoard = {};
  let changed = false;
  for (const [key, placement] of Object.entries(board)) {
    if (!placement) continue;
    if (placement.kind === 'forbidden' && placement.auto) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      if (!rows.has(y) && !columns.has(x)) {
        changed = true;
        continue;
      }
    }
    next[key] = placement;
  }
  return changed ? next : board;
}

/** 这位参与者**头像**所在的格子（编号不算）；没有就是 `null`。 */
export function avatarCellOf(
  board: GamePlacementBoard,
  participantId: number,
): CellCoord | null {
  for (const [key, placement] of Object.entries(board)) {
    if (placement?.kind !== 'participant') continue;
    if (placement.index !== participantId) continue;
    const [x, y] = key.split(',').map(Number) as [number, number];
    return { x, y };
  }
  return null;
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
    blockingCells: Set<string>;
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
    board = { ...state.board };
    /**
     * v0.7.11：长按另一格 = **搬家**。旧格先释放，否则同一个人的两个头像会同时
     * 站在棋盘上（唯一性是画出来的，不是拒绝出来的）。
     */
    const previousAvatar = avatarCellOf(state.board, input.participantId);
    if (previousAvatar) delete board[cellKey(previousAvatar.x, previousAvatar.y)];
    board[key] = { kind: 'participant', index: input.participantId };
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
      blockingCells: input.blockingCells,
    })) {
      board[swept] = { kind: 'forbidden', auto: true };
    }

    // SPEC-H01: the confirmed avatar is now the participant's only cell — the
    // candidate numbers it left behind elsewhere are stale.
    board = sweepParticipantNumbers(board, {
      participantId: input.participantId,
      except: { x: input.x, y: input.y },
    });

    // v0.7.11：搬家之后，旧行旧列的自动 `×` 失去依据 —— 这里一并收回。
    board = pruneAutoForbidden(board);
  }

  return commit(state, board);
}

/** SPEC-G04 §10.1: `×` replaces any numbers-only cell and blocks a new one. */
export function placeForbidden(
  state: GamePlacementState,
  input: { x: number; y: number; blockingCells: Set<string> },
): GamePlacementState {
  if (!canPlaceForbidden({ ...input, board: state.board })) return state;
  const key = cellKey(input.x, input.y);
  if (placementAt(state.board, input.x, input.y)?.kind === 'forbidden') return state;
  return commit(state, { ...state.board, [key]: { kind: 'forbidden' } });
}

/**
 * v0.7.12：`×` 工具是一支**开关** —— 同一格再点一次就把那个 `×` 收回去。
 *
 * 此前这一下什么都不做，想撤销一个点错的 `×` 得先切到橡皮、再切回来：两次工具
 * 切换只为了一个单格动作，而橡皮擦的是**整格**（这一步本身也多了一层心理成本）。
 * 允许在同一个工具里反向操作，是因为 `×` 是唯一「只代表自己」的格子内容：擦掉它
 * 不会伤到任何别的标记（编号要留、头像要留，`×` 不留）。
 *
 * 自动补的 `×`（`auto: true`）同样可以这样收回。玩家手动取消一个排除项是明确的
 * 意思表示；等下一次有头像落下，`placeParticipant` 会按**当时**的行列重新补。
 *
 * 这里不做 `pruneAutoForbidden`：删掉一格不会让任何别的格子「失去依据」，与擦
 * 头像不同，没有需要连带回滚的东西。
 */
export function toggleForbidden(
  state: GamePlacementState,
  input: { x: number; y: number; blockingCells: Set<string> },
): GamePlacementState {
  if (placementAt(state.board, input.x, input.y)?.kind === 'forbidden') {
    const board = { ...state.board };
    delete board[cellKey(input.x, input.y)];
    return commit(state, board);
  }
  return placeForbidden(state, input);
}

/**
 * SPEC-G04 §10.2: clearing one cell; a cell with nothing is a no-op.
 *
 * v0.7.11：擦掉一个头像之后，它的自动 `×` 也跟着走（`pruneAutoForbidden`）——
 * 否则棋盘上会留下「这一行仍然不能放」的假提示。玩家的手放 `×` 不受影响。
 */
export function clearCell(
  state: GamePlacementState,
  input: { x: number; y: number },
): GamePlacementState {
  const key = cellKey(input.x, input.y);
  if (!placementAt(state.board, input.x, input.y)) return state;
  const board = { ...state.board };
  delete board[key];
  return commit(state, pruneAutoForbidden(board));
}

/** SPEC-G04 §10.2 §5: the long-press wipe — recorded as a single undo step. */
export function clearAll(state: GamePlacementState): GamePlacementState {
  return commit(state, {});
}

export function canUndo(state: GamePlacementState): boolean {
  return state.past.length > 0;
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
  };
}

export function redo(state: GamePlacementState): GamePlacementState {
  if (!canRedo(state)) return state;
  const next = state.future[0]!;
  return {
    board: next,
    past: [...state.past, state.board],
    future: state.future.slice(1),
  };
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
    /**
     * v0.7.12：头像格与 `×` 格**不预览编号**。
     *
     * 这两种格子点击是**无效果**的（头像格属于别人，`×` 格是排除项），却曾经
     * 在悬停时画出一个编号 —— 预告了一件不会发生的事。提示层的职责是「松手会
     * 发生什么」，既然什么都不会发生，就不该有那一格字。
     */
    if (placement?.kind === 'forbidden' || placement?.kind === 'participant') return null;
    return { kind: 'number', participantId: mode.participantId };
  }
  if (nonStandable) return null;
  if (placement?.kind === 'participant') return null;
  /**
   * v0.7.12：`×` 工具在**已经有 `×`** 的格子上，预告仍然是 `×`。
   *
   * 那一格再点一次确实是**收回**（见 `toggleForbidden`），但提示层的字形不该
   * 跟着换成橡皮 —— 换字形等于在指针底下改变这支工具的**身份**：同一支笔，压到
   * 这一格就变成另一支笔，比「同一个箭头按下去方向会反过来」更难解释。工具是
   * 玩家选定的，提示只说明「这一格归这支工具管」。
   */
  return { kind: 'forbidden' };
}

/**
 * v0.8.5：一次放置落下之后，工具栏该停在哪个模式。
 *
 * **头像（`image`）放下 = 这位参与者已经就位**，手上不再举着任何东西 —— 名册
 * 那张卡的选中环随之退掉。否则界面在宣称「你还举着他」，下一次点格子会让人以为
 * 要放第二个（而头像本来就只有一张）。
 *
 * **编号（`number`）不退出**：同一位参与者的编号会落在很多格上（一行线索里常有
 * 好几个数字），每落一次都要回名册重点一下，等于把连续标注变成反复点卡片。
 *
 * 模式没变时**返回同一个对象**，调用方可以靠引用相等跳过 `setState`。
 */
export function modeAfterPlacement(
  mode: GameOperationMode,
  variant: ParticipantPlacementVariant,
): GameOperationMode {
  if (mode.kind !== 'placing') return mode;
  return variant === 'image' ? { kind: 'idle' } : mode;
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
 * v0.6.4 fix (docs/v0.6.4.md §4): the font size at which `text` still fits a
 * `boxWidth`-wide box.
 *
 * A 编号 is no longer necessarily a digit — the puzzle can configure any text
 * for a participant, and a 3×3 slot is only a third of a cell wide. Wide (CJK /
 * fullwidth) glyphs count as a full em, everything else as ~0.62em (see
 * `textWidth.ts`); when the estimate exceeds the box the font shrinks
 * proportionally, so a long label never spills over its neighbours. Digits —
 * the historical case — never trigger the shrink.
 */
export function glyphFontSize(text: string, boxWidth: number, fontSize: number): number {
  if (!Number.isFinite(boxWidth) || boxWidth <= 0) return fontSize;
  if (!Number.isFinite(fontSize) || fontSize <= 0) return fontSize;
  const width = estimateTextWidth(text, fontSize);
  return width <= boxWidth ? fontSize : (fontSize * boxWidth) / width;
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
 * 1. the participant must be on the board — **only an avatar counts** (v0.7.12；
 *    编号是候选标记，`avatarCellOf` 才是判据，见下）；
 * 2. nobody else may share its row;
 * 3. nobody else may share its column;
 * 4. if the participant carries position conditions, its cell must be one of
 *    them — an empty list means "no positional constraint" (§14 Q11).
 *
 * Rows/columns are reported from both sides of a clash (each participant gets
 * its own issue), which keeps the list a straight projection of the roster.
 *
 * v0.7.12（"提交校验时，参与者标号不能代表参与者"）：这里从
 * `participantPlacementAt`（没有头像时，唯一的候选编号也认）换成
 * `avatarCellOf`（只认头像）。标号的作用是**自己数格子时的草稿**，它可能只是
 * 玩家随手点过的一格；把草稿当交卷，等于替玩家宣布「我确定了」。
 */
export function validatePlacement(input: ValidatePlacementInput): PlacementValidation {
  const { board, slots } = input;
  const issues: PlacementIssue[] = [];

  const label = (participantId: number): string => participantLabel(participantId, input.nameOf);

  /** occupant map: cellKey → participant numbers, restricted to the roster. */
  const occupants = new Map<string, number[]>();
  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const coord = avatarCellOf(board, participantId);
    if (!coord) return;
    const key = cellKey(coord.x, coord.y);
    occupants.set(key, [...(occupants.get(key) ?? []), participantId]);
  });

  slots.forEach((slot, index) => {
    if (!slot) return;
    const participantId = index + 1;
    const coord = avatarCellOf(board, participantId);

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

/**
 * v0.7.11：提交未通过时，弹窗只回答**谁不对**，不回答**为什么**。
 *
 * 原来的清单把每一处同类 / 同列 / 位置条件都摊开写（十几条），像一张调试报告；
 * 玩家真正需要的是「回去看哪几位」。这里按参与者归并：同一个人有多条问题时
 * 只留一句 —— 没上场的说「未放置」，其余一律说「位置不对」。
 *
 * 归并规则：`unplaced` 优先（一个还没放下的人，谈位置没有意义）。
 */
export interface PlacementBlame {
  participantId: number;
  /** 展示用：「编号 3（张三）」。 */
  label: string;
  reason: 'unplaced' | 'wrong';
}

export function participantLabel(
  participantId: number,
  nameOf?: (participantId: number) => string | undefined,
): string {
  const name = nameOf?.(participantId);
  return name && name.length > 0 ? `编号 ${participantId}（${name}）` : `编号 ${participantId}`;
}

export function summarizeIssues(
  issues: PlacementIssue[],
  nameOf?: (participantId: number) => string | undefined,
): PlacementBlame[] {
  const byParticipant = new Map<number, PlacementBlame>();
  for (const issue of issues) {
    const existing = byParticipant.get(issue.participantId);
    const reason: PlacementBlame['reason'] = issue.code === 'unplaced' ? 'unplaced' : 'wrong';
    if (!existing) {
      byParticipant.set(issue.participantId, {
        participantId: issue.participantId,
        label: participantLabel(issue.participantId, nameOf),
        reason,
      });
      continue;
    }
    if (reason === 'unplaced') existing.reason = 'unplaced';
  }
  return [...byParticipant.values()].sort((a, b) => a.participantId - b.participantId);
}

function dedupeSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}
