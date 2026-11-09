import { describe, expect, it } from 'vitest';
import {
  GAME_NUMBER_FONT_RATIO,
  GAME_NUMBER_GRID,
  type CellPlacement,
  type CharacterSlotEntry,
  type GamePlacementBoard,
} from '@loredoku/shared';
import {
  allParticipantsPlaced,
  autoForbiddenCells,
  canPlaceForbidden,
  canPlaceParticipant,
  canRedo,
  canUndo,
  candidateCellCount,
  cellKey,
  clearAll,
  clearCell,
  countPlacements,
  createGamePlacementState,
  forbiddenCells,
  formatCellLabel,
  glyphFontSize,
  hasParticipant,
  modeAfterPlacement,
  numberSlotAnchor,
  numbersIn,
  participantPlacementAt,
  placeForbidden,
  placeParticipant,
  avatarPlacedParticipantIds,
  placedParticipantIds,
  placementAt,
  placementBlockReason,
  redo,
  resolveToolHint,
  sweepParticipantNumbers,
  toggleForbidden,
  undo,
  validatePlacement,
  type GamePlacementState,
  type ParticipantPlacementVariant,
} from './gamePlacement';

/**
 * SPEC-G01 / SPEC-G03 / SPEC-G04 (docs/v0.4.0.md §7 ~ §10) plus
 * SPEC-G05 / SPEC-G06 / FEAT-V01 (docs/v0.4.1.md §5 / §6 / §8) — the placement
 * rules as pure functions, so the page only has to dispatch.
 */

const EMPTY_NOSTAND = new Set<string>();
const nostand = (...keys: string[]): Set<string> => new Set(keys);
/** A board big enough that the row/column sweep never runs off the edge. */
const GRID = 9;

function withPlacements(board: GamePlacementBoard): GamePlacementState {
  return { ...createGamePlacementState(), board };
}

function place(
  state: GamePlacementState,
  x: number,
  y: number,
  participantId: number,
  options: {
    blockingCells?: Set<string>;
    variant?: ParticipantPlacementVariant;
    gridSize?: number;
  } = {},
): GamePlacementState {
  return placeParticipant(state, {
    x,
    y,
    participantId,
    blockingCells: options.blockingCells ?? EMPTY_NOSTAND,
    gridSize: options.gridSize ?? GRID,
    variant: options.variant ?? 'number',
  });
}

function forbid(state: GamePlacementState, x: number, y: number): GamePlacementState {
  return placeForbidden(state, { x, y, blockingCells: EMPTY_NOSTAND });
}

/** The `×` keys the sweep added around a placement at (x, y). */
function sweepOf(x: number, y: number, gridSize = GRID): string[] {
  return autoForbiddenCells({
    board: {},
    x,
    y,
    gridSize,
    blockingCells: EMPTY_NOSTAND,
  });
}

function slot(characterId: number, positionConditions?: Array<{ x: number; y: number }>): CharacterSlotEntry {
  return positionConditions ? { characterId, positionConditions } : { characterId };
}

describe('placing a participant (SPEC-G03 §9.2)', () => {
  it('puts number 1 in the 3×3 grid on an empty cell with a tap', () => {
    const next = place(createGamePlacementState(), 2, 3, 1);
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'numbers', entries: [1] });
    expect(numbersIn(placementAt(next.board, 2, 3))).toEqual([1]);
  });

  it('puts the avatar on an empty cell with a long-press', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, { variant: 'image' });
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'participant', index: 1 });
  });

  /**
   * v0.7.12 改口径（需求：「已放置参与者和禁止符号的格子，参与者编号点击时
   * 无效果」）：以前点别人的头像格会给九宫格追加一个编号、把那张脸顶掉；
   * 现在短按在头像格上一律无效果 —— 要换人请长按（那是另一条规则）。
   */
  it('ignores a short press on somebody else’s avatar cell', () => {
    const first = place(createGamePlacementState(), 1, 1, 1, { variant: 'image' });
    const second = place(first, 1, 1, 2);
    expect(second).toBe(first);
    expect(placementAt(second.board, 1, 1)).toEqual({ kind: 'participant', index: 1 });
    expect(
      placementBlockReason({
        board: first.board,
        x: 1,
        y: 1,
        participantId: 2,
        blockingCells: EMPTY_NOSTAND,
      }),
    ).toBe('avatar');
  });

  it('still lets a long-press replace somebody else’s avatar', () => {
    let state = place(createGamePlacementState(), 1, 1, 1, { variant: 'image' });
    state = place(state, 1, 1, 2, { variant: 'image' });
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'participant', index: 2 });
  });

  it('promotes a carried number to the avatar on long-press', () => {
    let state = place(createGamePlacementState(), 0, 0, 2);
    state = place(state, 0, 0, 2, { variant: 'image' });
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'participant', index: 2 });
  });

  it('toggles the number off when the same cell is tapped again (SPEC-J03)', () => {
    const first = place(createGamePlacementState(), 0, 0, 3);
    const second = place(first, 0, 0, 3);
    // a tap on the cell that already carries this 编号 removes it —
    // the cell goes back to being empty, never a `×`.
    expect(placementAt(second.board, 0, 0)).toBeNull();
    expect(forbiddenCells(second.board).size).toBe(0);
    expect(second.past).toHaveLength(2);
  });

  it('ignores a long-press on the cell already showing that avatar', () => {
    const first = place(createGamePlacementState(), 0, 0, 3, { variant: 'image' });
    const second = place(first, 0, 0, 3, { variant: 'image' });
    expect(second).toBe(first);
    expect(placementAt(second.board, 0, 0)).toEqual({ kind: 'participant', index: 3 });
  });

  it('rejects a non-standable cell in both variants', () => {
    const state = createGamePlacementState();
    const noStand = nostand('1,1');
    expect(canPlaceParticipant({ board: state.board, x: 1, y: 1, participantId: 1, blockingCells: noStand })).toBe(false);
    expect(place(state, 1, 1, 1, { blockingCells: noStand })).toBe(state);
    expect(place(state, 1, 1, 1, { blockingCells: noStand, variant: 'image' })).toBe(state);
    expect(
      placementBlockReason({ board: state.board, x: 1, y: 1, participantId: 1, blockingCells: noStand }),
    ).toBe('non-standable');
  });

  it('rejects a cell that already carries a × in both variants', () => {
    const state = forbid(createGamePlacementState(), 4, 4);
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, blockingCells: EMPTY_NOSTAND })).toBe(false);
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, blockingCells: EMPTY_NOSTAND, variant: 'image' })).toBe(false);
    expect(place(state, 4, 4, 1)).toBe(state);
    expect(place(state, 4, 4, 1, { variant: 'image' })).toBe(state);
  });

  it('rejects a tenth number on a tap — but a long-press still confirms', () => {
    const full: GamePlacementBoard = {
      '0,0': { kind: 'numbers', entries: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    };
    const state = withPlacements(full);
    expect(canPlaceParticipant({ board: state.board, x: 0, y: 0, participantId: 10, blockingCells: EMPTY_NOSTAND })).toBe(false);
    expect(place(state, 0, 0, 10)).toBe(state);
    // The confirm gesture replaces the cell wholesale, so a full grid is no
    // obstacle for the image variant.
    expect(canPlaceParticipant({ board: state.board, x: 0, y: 0, participantId: 4, blockingCells: EMPTY_NOSTAND, variant: 'image' })).toBe(true);
    const confirmed = place(state, 0, 0, 4, { variant: 'image' });
    expect(placementAt(confirmed.board, 0, 0)).toEqual({ kind: 'participant', index: 4 });
  });
});

/**
 * SPEC-J05 §3.6（docs/v0.4.3.md）：唯一性从「编号 / 头像」**收窄到只有头像**。
 * 编号是候选标记，同一位参与者可以同时留在多个格子上；短按既不看唯一性，
 * 也不会再报「编号 N 已放置在 R{r} C{c}」。
 */
describe('uniqueness is about the avatar only (SPEC-J05 §3.6)', () => {
  it('lets the same 编号 sit on several cells at once', () => {
    const first = place(createGamePlacementState(), 1, 1, 1);
    const second = place(first, 4, 4, 1);
    expect(second).not.toBe(first);
    expect(placementAt(second.board, 1, 1)).toEqual({ kind: 'numbers', entries: [1] });
    expect(placementAt(second.board, 4, 4)).toEqual({ kind: 'numbers', entries: [1] });
    // 候选编号不是「已在别处」——短按永远拿不到这个拒绝码。
    expect(
      placementBlockReason({
        board: second.board,
        x: 6,
        y: 6,
        participantId: 1,
        blockingCells: EMPTY_NOSTAND,
      }),
    ).toBeNull();
  });

  it('still keeps one avatar — 长按另一格是搬家，不是第二个头像（v0.7.11）', () => {
    const confirmed = place(createGamePlacementState(), 1, 1, 2, { variant: 'image' });
    expect(placementAt(confirmed.board, 1, 1)).toEqual({ kind: 'participant', index: 2 });
    const moved = place(confirmed, 5, 5, 2, { variant: 'image' });
    expect(placementAt(moved.board, 1, 1)).toBeNull();
    expect(placementAt(moved.board, 5, 5)).toEqual({ kind: 'participant', index: 2 });
    expect(avatarPlacedParticipantIds(moved.board)).toEqual(new Set([2]));
    // 不再有「已在别处」这个拒绝码：唯一性由搬家满足。
    expect(
      placementBlockReason({
        board: confirmed.board,
        x: 5,
        y: 5,
        participantId: 2,
        blockingCells: EMPTY_NOSTAND,
        variant: 'image',
      }),
    ).toBeNull();
  });

  it('confirms a long-press while candidate 编号 wait on other cells', () => {
    // 候选不是答案：长按其中任一格就是「确认」，随后 SPEC-H01 把候选清掉。
    let state = place(createGamePlacementState(), 0, 0, 3, { gridSize: 5 });
    state = place(state, 1, 1, 3, { gridSize: 5 });
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'numbers', entries: [3] });
    state = place(state, 1, 1, 3, { gridSize: 5, variant: 'image' });
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'participant', index: 3 });
    expect(placementAt(state.board, 0, 0)).toBeNull();
  });

  it('allows promoting the participant on its own cell', () => {
    const first = place(createGamePlacementState(), 1, 1, 2);
    const promoted = place(first, 1, 1, 2, { variant: 'image' });
    expect(placementAt(promoted.board, 1, 1)).toEqual({ kind: 'participant', index: 2 });
  });

  it('frees the participant again after a clear', () => {
    let state = place(createGamePlacementState(), 1, 1, 1);
    state = clearCell(state, { x: 1, y: 1 });
    const moved = place(state, 4, 4, 1);
    expect(placementAt(moved.board, 4, 4)).toEqual({ kind: 'numbers', entries: [1] });
  });

  it('reports where the participant already sits, and who is placed', () => {
    const state = place(createGamePlacementState(), 3, 6, 4);
    expect(participantPlacementAt(state.board, 4)).toEqual({ x: 3, y: 6 });
    expect(participantPlacementAt(state.board, 5)).toBeNull();
    expect(placedParticipantIds(state.board).has(4)).toBe(true);
    expect(formatCellLabel({ x: 3, y: 6 })).toBe('R7 C4');
  });
});

describe('placing a number toggles (SPEC-J03 §3)', () => {
  it('adds the number on the first tap and removes it on the second', () => {
    const first = place(createGamePlacementState(), 2, 2, 1);
    expect(placementAt(first.board, 2, 2)).toEqual({ kind: 'numbers', entries: [1] });
    const second = place(first, 2, 2, 1);
    expect(placementAt(second.board, 2, 2)).toBeNull();
    expect(forbiddenCells(second.board).size).toBe(0);
  });

  it('drops only its own entry from a shared cell', () => {
    let state = place(createGamePlacementState(), 3, 3, 1);
    state = place(state, 3, 3, 2);
    expect(placementAt(state.board, 3, 3)).toEqual({ kind: 'numbers', entries: [1, 2] });
    const removed = place(state, 3, 3, 1);
    expect(placementAt(removed.board, 3, 3)).toEqual({ kind: 'numbers', entries: [2] });
  });

  it('spends one history step per tap — adding and removing alike', () => {
    const first = place(createGamePlacementState(), 0, 0, 5);
    expect(first.past).toHaveLength(1);
    const off = place(first, 0, 0, 5);
    expect(off.past).toHaveLength(2);
    // Undo walks back through the removal first, then the insertion.
    expect(undo(off).board[cellKey(0, 0)]).toEqual({ kind: 'numbers', entries: [5] });
    expect(undo(undo(off)).board).toEqual({});
  });

  it('never toggles an avatar away — a tap there is refused (Q5)', () => {
    const avatar = place(createGamePlacementState(), 1, 1, 4, { variant: 'image' });
    expect(place(avatar, 1, 1, 4)).toBe(avatar);
    expect(
      placementBlockReason({
        board: avatar.board,
        x: 1,
        y: 1,
        participantId: 4,
        blockingCells: EMPTY_NOSTAND,
      }),
    ).toBe('avatar');
    expect(placementAt(avatar.board, 1, 1)).toEqual({ kind: 'participant', index: 4 });
  });

  it('stops refusing a repeat — `duplicate` is not a block reason any more', () => {
    const state = place(createGamePlacementState(), 6, 6, 7);
    expect(
      placementBlockReason({
        board: state.board,
        x: 6,
        y: 6,
        participantId: 7,
        blockingCells: EMPTY_NOSTAND,
      }),
    ).toBeNull();
    expect(
      canPlaceParticipant({
        board: state.board,
        x: 6,
        y: 6,
        participantId: 7,
        blockingCells: EMPTY_NOSTAND,
      }),
    ).toBe(true);
  });

  it('keeps the 9-cell cap on the add direction only', () => {
    const full: GamePlacementBoard = {
      '0,0': { kind: 'numbers', entries: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    };
    const state = withPlacements(full);
    expect(place(state, 0, 0, 10)).toBe(state);
    // …but toggling one of the nine off is still allowed.
    const off = place(state, 0, 0, 4);
    expect(placementAt(off.board, 0, 0)).toEqual({
      kind: 'numbers',
      entries: [1, 2, 3, 5, 6, 7, 8, 9],
    });
  });

  it('still refuses a tap on a cell carrying a ×', () => {
    const state = forbid(createGamePlacementState(), 4, 4);
    expect(place(state, 4, 4, 1)).toBe(state);
  });

  it('no longer refuses a tap on another cell — the 编号 may repeat (§3.6)', () => {
    const first = place(createGamePlacementState(), 1, 1, 1);
    const second = place(first, 4, 4, 1);
    expect(second).not.toBe(first);
    expect(placementAt(second.board, 1, 1)).toEqual({ kind: 'numbers', entries: [1] });
    expect(placementAt(second.board, 4, 4)).toEqual({ kind: 'numbers', entries: [1] });
  });
});

describe('the automatic × is a long-press consequence only (SPEC-J02 §2)', () => {
  it('leaves the row and the column alone when a 编号 lands', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6 });
    expect(forbiddenCells(next.board).size).toBe(0);
    expect(Object.keys(next.board)).toEqual([cellKey(2, 3)]);
  });

  it('lets several 编号 share a row — exclusions are the player’s own business', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 1, 0, 2, { gridSize: 5 });
    state = place(state, 2, 0, 3, { gridSize: 5 });
    expect(forbiddenCells(state.board).size).toBe(0);
    expect(countPlacements(state.board)).toBe(3);
    // v0.7.12：编号根本不参加判卷（见 `validatePlacement`），所以这一排也不会
    // 以「同行」的形式出现在失败名单里 —— 它读起来就是三个人都还没放。
    const result = validatePlacement({
      board: state.board,
      slots: [slot(101), slot(102), slot(103)],
    });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'unplaced',
      'unplaced',
      'unplaced',
    ]);
  });

  it('still fills the row and the column on a long-press', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'participant', index: 1 });
    expect(forbiddenCells(next.board).size).toBeGreaterThan(0);
  });
});

describe('the automatic × on the row and column (SPEC-G06)', () => {
  it('covers exactly the rest of the row and the column', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    const swept = sweepOf(2, 3, 6);
    // 5 others on the row + 5 others on the column.
    expect(swept).toHaveLength(10);
    for (const key of swept) {
      expect(placementAt(next.board, ...(key.split(',').map(Number) as [number, number]))).toEqual({
        kind: 'forbidden',
        auto: true,
      });
    }
    // The cell that received the participant is untouched.
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'participant', index: 1 });
  });

  it('skips non-standable cells, avatars and existing ×', () => {
    // A pre-existing avatar at (3,0): the sweep must leave it alone.
    const state = withPlacements({ '3,0': { kind: 'participant', index: 8 } });
    const next = place(state, 1, 0, 1, {
      blockingCells: nostand('4,0'),
      gridSize: 5,
      variant: 'image',
    });
    // Row 0: 0 → ×, 1 = placed, 2 → ×, 3 = avatar, 4 = non-standable.
    expect(placementAt(next.board, 0, 0)).toEqual({ kind: 'forbidden', auto: true });
    expect(placementAt(next.board, 2, 0)).toEqual({ kind: 'forbidden', auto: true });
    expect(placementAt(next.board, 3, 0)).toEqual({ kind: 'participant', index: 8 });
    expect(placementAt(next.board, 4, 0)).toBeNull();
    // Column 1: every other row takes the ×.
    expect(placementAt(next.board, 1, 4)).toEqual({ kind: 'forbidden', auto: true });
  });

  it('is idempotent — a repeated sweep records no extra step', () => {
    const first = place(createGamePlacementState(), 2, 2, 1, { gridSize: 4, variant: 'image' });
    const again = autoForbiddenCells({
      board: first.board,
      x: 2,
      y: 2,
      gridSize: 4,
      blockingCells: EMPTY_NOSTAND,
    });
    // Everything the sweep would touch already carries a ×.
    for (const key of again) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(placementAt(first.board, x, y)).toEqual({ kind: 'forbidden', auto: true });
    }
  });

  it('merges the placement and the sweep into one undo step', () => {
    const placed = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    const undone = undo(placed);
    expect(countPlacements(undone.board)).toBe(0);
  });

  it('overwrites a numbers-only cell in the row (方案 A §6.2)', () => {
    // Participant 8 carries a 编号 at (4, 0); confirming 1 at (1, 0) with a
    // long-press sweeps the same row, and the × wins over a 编号-only cell.
    let state = place(createGamePlacementState(), 4, 0, 8, { gridSize: 6 });
    state = place(state, 1, 0, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(state.board, 4, 0)).toEqual({ kind: 'forbidden', auto: true });
    expect(placedParticipantIds(state.board).has(8)).toBe(false);
  });

  it('leaves an avatar in the row alone, so the clash reaches the validator', () => {
    let state = place(createGamePlacementState(), 4, 0, 8, { gridSize: 6, variant: 'image' });
    state = clearCell(state, { x: 1, y: 0 });
    state = place(state, 1, 0, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(state.board, 4, 0)).toEqual({ kind: 'participant', index: 8 });
    const result = validatePlacement({
      board: state.board,
      slots: [slot(101), null, null, null, null, null, null, slot(108)],
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'row')).toBe(true);
  });

  it('does not sweep when the placement itself was refused', () => {
    // v0.7.11：唯一性不再是拒绝理由（长按另一格 = 搬家），所以这里改用仍然存在
    // 的拒绝路径 —— 不可站立格。被拒时棋盘一格都不该动，自然也不补 ×。
    const first = place(createGamePlacementState(), 1, 1, 1, { gridSize: 5, variant: 'image' });
    const refused = place(first, 2, 2, 1, {
      gridSize: 5,
      variant: 'image',
      blockingCells: nostand('2,2'),
    });
    expect(refused).toBe(first);
    expect(forbiddenCells(refused.board)).toEqual(forbiddenCells(first.board));
  });
});

describe('the forbidden × (SPEC-G04 §10.1)', () => {
  it('replaces a numbers-only cell', () => {
    let state = place(createGamePlacementState(), 1, 1, 1);
    state = place(state, 1, 1, 2);
    state = forbid(state, 1, 1);
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'forbidden' });
  });

  it('leaves a cell showing a participant avatar alone', () => {
    const state = place(createGamePlacementState(), 2, 2, 1, { variant: 'image' });
    expect(canPlaceForbidden({ board: state.board, x: 2, y: 2, blockingCells: EMPTY_NOSTAND })).toBe(false);
    expect(placeForbidden(state, { x: 2, y: 2, blockingCells: EMPTY_NOSTAND })).toBe(state);
  });

  it('is rejected on a non-standable cell', () => {
    const state = createGamePlacementState();
    expect(placeForbidden(state, { x: 0, y: 1, blockingCells: nostand('0,1') })).toBe(state);
  });

  it('activates the non-standable mask for the cells it covers', () => {
    let state = forbid(createGamePlacementState(), 3, 3);
    state = forbid(state, 1, 2);
    expect(forbiddenCells(state.board)).toEqual(new Set(['3,3', '1,2']));
  });
});

/**
 * v0.7.12（「禁止符号点已经放置了禁止符号的格子时，清空该格子的禁止符号」）。
 *
 * `×` 工具从此是一支开关：同一格再点一次就收回。此前这一下什么都不做，撤销一个
 * 点错的 `×` 要先切橡皮、再切回来。
 */
describe('toggleForbidden（v0.7.12）', () => {
  it('puts a × down on an empty cell', () => {
    const state = toggleForbidden(createGamePlacementState(), {
      x: 2,
      y: 3,
      blockingCells: EMPTY_NOSTAND,
    });
    expect(placementAt(state.board, 2, 3)).toEqual({ kind: 'forbidden' });
    expect(state.past).toHaveLength(1);
  });

  it('takes the × back when the same cell is hit again', () => {
    let state = forbid(createGamePlacementState(), 2, 3);
    state = toggleForbidden(state, { x: 2, y: 3, blockingCells: EMPTY_NOSTAND });
    expect(placementAt(state.board, 2, 3)).toBeNull();
    // 放 + 收 = 两步可回退（和「擦一格」同等的历史粒度）。
    expect(state.past).toHaveLength(2);

    // 收回去之后又能放回来 —— 是开关，不是一次性的。
    state = toggleForbidden(state, { x: 2, y: 3, blockingCells: EMPTY_NOSTAND });
    expect(placementAt(state.board, 2, 3)).toEqual({ kind: 'forbidden' });
  });

  it('takes back an automatic × as well — the player asked for it', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { variant: 'image' });
    expect(placementAt(state.board, 3, 0)).toEqual({ kind: 'forbidden', auto: true });

    state = toggleForbidden(state, { x: 3, y: 0, blockingCells: EMPTY_NOSTAND });
    expect(placementAt(state.board, 3, 0)).toBeNull();
    // 别的自动 × 不受牵连。
    expect(placementAt(state.board, 0, 3)).toEqual({ kind: 'forbidden', auto: true });
  });

  it('still refuses a non-standable cell and an avatar cell', () => {
    const withAvatar = place(createGamePlacementState(), 4, 4, 1, { variant: 'image' });
    expect(
      toggleForbidden(withAvatar, { x: 4, y: 4, blockingCells: EMPTY_NOSTAND }),
    ).toBe(withAvatar);
    expect(
      toggleForbidden(createGamePlacementState(), {
        x: 1,
        y: 1,
        blockingCells: nostand('1,1'),
      }),
    ).toEqual(createGamePlacementState());
  });

  it('a numbers-only cell is replaced by the ×, not appended to', () => {
    let state = place(createGamePlacementState(), 5, 5, 1);
    state = toggleForbidden(state, { x: 5, y: 5, blockingCells: EMPTY_NOSTAND });
    expect(placementAt(state.board, 5, 5)).toEqual({ kind: 'forbidden' });
  });
});

describe('clearing (SPEC-G04 §10.2)', () => {
  it('empties one cell and records the step', () => {
    const placed = place(createGamePlacementState(), 1, 1, 1);
    const cleared = clearCell(placed, { x: 1, y: 1 });
    expect(placementAt(cleared.board, 1, 1)).toBeNull();
    expect(canUndo(cleared)).toBe(true);
  });

  it('is a no-op on an empty cell', () => {
    const state = createGamePlacementState();
    expect(clearCell(state, { x: 9, y: 9 })).toBe(state);
  });

  it('long-press clears the whole board in a single undo step', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 });
    state = place(state, 1, 1, 2, { gridSize: 4 });
    state = place(state, 2, 2, 3, { gridSize: 4 });
    const wiped = clearAll(state);
    expect(countPlacements(wiped.board)).toBe(0);
    // The wipe adds exactly one step on top of the three placements.
    expect(wiped.past).toHaveLength(state.past.length + 1);
    const restored = undo(wiped);
    expect(countPlacements(restored.board)).toBeGreaterThan(0);
    expect(placedParticipantIds(restored.board)).toEqual(new Set([1, 2, 3]));
  });
});

describe('undo / redo (SPEC-G04 §10.3)', () => {
  it('steps back one operation at a time', () => {
    // A diagonal, so the auto-× of each placement never blocks the next one.
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 });
    state = place(state, 1, 1, 2, { gridSize: 4 });
    state = place(state, 2, 2, 3, { gridSize: 4 });
    state = undo(state);
    expect(placementAt(state.board, 2, 2)).toBeNull();
    state = undo(state);
    expect(placementAt(state.board, 1, 1)).toBeNull();
    expect(numbersIn(placementAt(state.board, 0, 0))).toEqual([1]);
  });

  it('is disabled with an empty stack and returns the same state', () => {
    const state = createGamePlacementState();
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
    expect(canRedo(state)).toBe(false);
    expect(redo(state)).toBe(state);
  });

  it('a new placement clears the redo stack', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 });
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    state = place(state, 4, 4, 2, { gridSize: 6 });
    expect(canRedo(state)).toBe(false);
    expect(placementAt(state.board, 0, 0)).toBeNull();
    expect(numbersIn(placementAt(state.board, 4, 4))).toEqual([2]);
  });

  it('redoes an undone placement', () => {
    const placed = place(createGamePlacementState(), 1, 1, 1, { gridSize: 4 });
    const undone = undo(placed);
    const redone = redo(undone);
    expect(numbersIn(placementAt(redone.board, 1, 1))).toEqual([1]);
  });

  it('caps the history at the configured maximum', () => {
    // 20 distinct participants on a fresh diagonal each round (so every row and
    // column is free), then a whole-board wipe: 21 steps per round.
    let state = createGamePlacementState();
    for (let round = 0; round < 15; round += 1) {
      for (let i = 0; i < 20; i += 1) {
        state = place(state, i, i, i + 1, { gridSize: 24 });
      }
      state = clearAll(state);
    }
    expect(state.past.length).toBe(200);
  });
});

describe('长按搬家（v0.7.11）', () => {
  it('removes the old cell and keeps exactly one avatar', () => {
    let state = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    state = place(state, 5, 5, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(state.board, 2, 3)).toBeNull();
    expect(placementAt(state.board, 5, 5)).toEqual({ kind: 'participant', index: 1 });
    expect(avatarPlacedParticipantIds(state.board)).toEqual(new Set([1]));
  });

  it('rolls the automatic × of the old row and column back', () => {
    let state = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    const before = forbiddenCells(state.board);
    expect(before.has(cellKey(0, 3))).toBe(true);

    state = place(state, 5, 5, 1, { gridSize: 6, variant: 'image' });
    const after = forbiddenCells(state.board);

    // 旧行的 `×` 没有依据了 —— 一条都不该留下。
    expect(after.has(cellKey(0, 3))).toBe(false);
    expect(after.has(cellKey(2, 0))).toBe(false);
    // 新行新列必须是齐的。
    expect(after.has(cellKey(0, 5))).toBe(true);
    expect(after.has(cellKey(5, 0))).toBe(true);
    // 正好是「新行 ∪ 新列 − 头像自己那一格」。
    expect(after.size).toBe(10);
  });

  it('never removes a × the player placed by hand', () => {
    let state = forbid(createGamePlacementState(), 0, 0);
    state = place(state, 2, 3, 1, { gridSize: 6, variant: 'image' });
    state = place(state, 5, 5, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'forbidden' });
  });

  it('keeps the × that another avatar still justifies', () => {
    // A 在 (1,1)、B 在 (2,2)。A 搬走之后，(2,1) 与 (1,2) 依然在 B 的行 / 列上。
    let state = place(createGamePlacementState(), 1, 1, 1, { gridSize: 6, variant: 'image' });
    state = place(state, 2, 2, 2, { gridSize: 6, variant: 'image' });
    state = place(state, 4, 4, 1, { gridSize: 6, variant: 'image' });
    expect(placementAt(state.board, 2, 1)?.kind).toBe('forbidden');
    expect(placementAt(state.board, 1, 2)?.kind).toBe('forbidden');
  });

  it('clearing an avatar takes its automatic × with it', () => {
    let state = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    state = clearCell(state, { x: 2, y: 3 });
    expect(countPlacements(state.board)).toBe(0);
  });

  it('a long press on the avatar’s own cell changes nothing and says nothing', () => {
    const state = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6, variant: 'image' });
    // 同一格：拒绝码是 `avatar`（页面据此**不弹提示**，只是静默不动）。
    expect(
      placementBlockReason({
        board: state.board,
        x: 2,
        y: 3,
        participantId: 1,
        blockingCells: EMPTY_NOSTAND,
        variant: 'image',
      }),
    ).toBe('avatar');
    expect(place(state, 2, 3, 1, { gridSize: 6, variant: 'image' })).toBe(state);
  });
});

describe('submit validation (FEAT-V01 §8)', () => {
  it('passes when every participant is placed on its own row and column', () => {
    // Two participants on a clean diagonal — the auto-× guarantees this state
    // is what a player actually reaches.
    let state = createGamePlacementState();
    state = place(state, 0, 0, 1, { gridSize: 4, variant: 'image' });
    state = place(state, 2, 2, 2, { gridSize: 4, variant: 'image' });
    const result = validatePlacement({ board: state.board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports an unplaced participant and stops checking that one', () => {
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4, variant: 'image' })
      .board;
    const result = validatePlacement({ board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([
      { participantId: 2, code: 'unplaced', message: '编号 2 尚未放置' },
    ]);
  });

  /**
   * v0.7.12（「点击提交校验时，参与者标号不能代表参与者」）：编号是草稿。
   * 两位参与者各点了一格编号、都没长按确认头像 —— 这一局就是**两个人都没放**。
   */
  it('does not let a 编号 stand in for the participant', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 2, 2, 2, { gridSize: 5 });
    const result = validatePlacement({ board: state.board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['unplaced', 'unplaced']);
    // 消息仍会说明「你点过，但没确认」，而不是一句生硬的「尚未放置」。
    expect(result.issues[0]?.message).toContain('尚未确认');
  });

  it('uses the roster names when they are available', () => {
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4, variant: 'image' })
      .board;
    const result = validatePlacement({
      board,
      slots: [slot(101), slot(102)],
      nameOf: (id) => (id === 2 ? '张三' : undefined),
    });
    expect(result.issues[0]?.message).toBe('编号 2（张三） 尚未放置');
  });

  it('flags a row clash from both sides', () => {
    // Built by hand: an avatar survives the sweep, so the clash is reachable.
    const board: GamePlacementBoard = {
      '1,0': { kind: 'participant', index: 1 },
      '4,0': { kind: 'participant', index: 8 },
    };
    const result = validatePlacement({
      board,
      slots: [slot(101), null, null, null, null, null, null, slot(108)],
    });
    const rowIssues = result.issues.filter((issue) => issue.code === 'row');
    expect(rowIssues.map((issue) => issue.participantId)).toEqual([1, 8]);
    expect(rowIssues[0]?.message).toBe('编号 1 与编号 8 同在第 1 行');
  });

  it('flags a column clash', () => {
    const board: GamePlacementBoard = {
      '0,0': { kind: 'participant', index: 1 },
      '0,3': { kind: 'participant', index: 2 },
    };
    const result = validatePlacement({ board, slots: [slot(101), slot(102)] });
    const columnIssues = result.issues.filter((issue) => issue.code === 'column');
    expect(columnIssues).toHaveLength(2);
    expect(columnIssues[0]?.message).toBe('编号 1 与编号 2 同在第 1 列');
  });

  it('enforces position conditions as an OR list', () => {
    const state = place(createGamePlacementState(), 3, 3, 1, { gridSize: 6, variant: 'image' });
    let result = validatePlacement({
      board: state.board,
      slots: [slot(101, [{ x: 3, y: 3 }, { x: 5, y: 5 }])],
    });
    expect(result.passed).toBe(true);

    result = validatePlacement({ board: state.board, slots: [slot(101, [{ x: 5, y: 5 }])] });
    expect(result.passed).toBe(false);
    expect(result.issues[0]?.code).toBe('condition');
    expect(result.issues[0]?.message).toContain('R4 C4');
    expect(result.issues[0]?.message).toContain('R6 C6');

    // An empty list is "no constraint" (§14 Q11).
    expect(validatePlacement({ board: state.board, slots: [slot(101, [])] }).passed).toBe(true);
  });

  it('collects several problems and sorts them by participant number', () => {
    const board = place(createGamePlacementState(), 0, 0, 3, { gridSize: 4, variant: 'image' })
      .board;
    const result = validatePlacement({
      board,
      slots: [slot(101), slot(102), slot(103, [{ x: 1, y: 1 }]), slot(104)],
    });
    expect(result.issues.map((issue) => issue.participantId)).toEqual([1, 2, 3, 4]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      'unplaced',
      'unplaced',
      'condition',
      'unplaced',
    ]);
  });

  it('ignores empty roster frames', () => {
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4, variant: 'image' })
      .board;
    expect(validatePlacement({ board, slots: [slot(101), null, null] }).passed).toBe(true);
  });
});

describe('the tool hint (SPEC-G02 §2)', () => {
  it('shows the participant number while placing', () => {
    expect(
      resolveToolHint({ mode: { kind: 'placing', participantId: 2 }, placement: null, nonStandable: false }),
    ).toEqual({ kind: 'number', participantId: 2 });
  });

  it('shows the × while forbidding', () => {
    expect(
      resolveToolHint({ mode: { kind: 'forbidden' }, placement: null, nonStandable: false }),
    ).toEqual({ kind: 'forbidden' });
  });

  it('shows the eraser while clearing, participant or not', () => {
    const avatar = { kind: 'participant', index: 1 } as const;
    expect(resolveToolHint({ mode: { kind: 'clearing' }, placement: null, nonStandable: false })).toEqual({
      kind: 'eraser',
    });
    expect(resolveToolHint({ mode: { kind: 'clearing' }, placement: avatar, nonStandable: false })).toEqual({
      kind: 'eraser',
    });
  });

  it('hides the × on a cell that shows a participant', () => {
    const avatar = { kind: 'participant', index: 1 } as const;
    expect(
      resolveToolHint({ mode: { kind: 'forbidden' }, placement: avatar, nonStandable: false }),
    ).toBeNull();
  });

  /**
   * v0.7.12：头像格与 `×` 格在放置态下是**无效果**的，所以也不预告编号。
   */
  it('shows no number on a cell that already holds an avatar or a ×', () => {
    expect(
      resolveToolHint({
        mode: { kind: 'placing', participantId: 2 },
        placement: { kind: 'participant', index: 1 },
        nonStandable: false,
      }),
    ).toBeNull();
    expect(
      resolveToolHint({
        mode: { kind: 'placing', participantId: 2 },
        placement: { kind: 'forbidden' },
        nonStandable: false,
      }),
    ).toBeNull();
  });

  /**
   * v0.7.12：`×` 工具在**已经有 `×`** 的格子上一按是**收回**，但预告仍是 `×`
   * —— 不能把字形换成橡皮。指针压到哪一格，工具就还是那一支；换字形会让同一支
   * 笔在格子之间改变身份，比「按下去方向反过来」更难解释。
   */
  it('keeps previewing the × on a cell that already carries one (v0.7.12)', () => {
    expect(
      resolveToolHint({
        mode: { kind: 'forbidden' },
        placement: { kind: 'forbidden' },
        nonStandable: false,
      }),
    ).toEqual({ kind: 'forbidden' });
  });

  it('shows nothing on a non-standable cell and in idle mode', () => {
    expect(
      resolveToolHint({ mode: { kind: 'placing', participantId: 1 }, placement: null, nonStandable: true }),
    ).toBeNull();
    expect(
      resolveToolHint({ mode: { kind: 'forbidden' }, placement: null, nonStandable: true }),
    ).toBeNull();
    expect(
      resolveToolHint({ mode: { kind: 'idle' }, placement: null, nonStandable: false }),
    ).toBeNull();
  });
});

describe('helpers', () => {
  it('builds cell keys', () => {
    expect(cellKey(3, 7)).toBe('3,7');
  });

  it('reports whether a cell holds a participant', () => {
    const numbers: CellPlacement = { kind: 'numbers', entries: [1, 4] };
    expect(hasParticipant(numbers, 4)).toBe(true);
    expect(hasParticipant(numbers, 2)).toBe(false);
    expect(hasParticipant(null, 1)).toBe(false);
  });

  it('spreads the nine numbers over a 3×3 grid', () => {
    expect(numberSlotAnchor(0)).toEqual({ x: 1 / 6, y: 1 / 6 });
    expect(numberSlotAnchor(2)).toEqual({ x: 5 / 6, y: 1 / 6 });
    expect(numberSlotAnchor(4)).toEqual({ x: 0.5, y: 0.5 });
    expect(numberSlotAnchor(8)).toEqual({ x: 5 / 6, y: 5 / 6 });
  });

  // v0.6.4 fix (docs/v0.6.4.md §4): a 编号 glyph can be configured text, and
  // a third of a 40px cell (≈13.3px) is not much room for it.
  const SLOT = 40 / GAME_NUMBER_GRID;
  const FONT = 40 * GAME_NUMBER_FONT_RATIO;

  it('keeps the font size for a label that fits its slot', () => {
    // Digits — the historical case — never shrink, even two of them.
    expect(glyphFontSize('7', SLOT, FONT)).toBe(FONT);
    expect(glyphFontSize('12', SLOT, FONT)).toBe(FONT);
    // A single wide glyph is exactly one em and still fits.
    expect(glyphFontSize('甲', SLOT, FONT)).toBe(FONT);
  });

  it('shrinks a label that would spill over its slot', () => {
    const fitted = glyphFontSize('甲乙', SLOT, FONT);
    expect(fitted).toBeLessThan(FONT);
    // The estimate at the fitted size is exactly the box: 2 em × font = slot.
    expect(fitted * 2).toBeCloseTo(SLOT, 6);
    // Three digits are wider than a slot too.
    expect(glyphFontSize('123', SLOT, FONT)).toBeLessThan(FONT);
  });

  it('leaves the font size alone when the box is unusable', () => {
    expect(glyphFontSize('甲乙', 0, FONT)).toBe(FONT);
    expect(glyphFontSize('甲乙', Number.NaN, FONT)).toBe(FONT);
    expect(glyphFontSize('', SLOT, FONT)).toBe(FONT);
  });
});

/**
 * SPEC-H01（docs/v0.4.2.md §1.2）+ CLAR-H13 §1.1：一位参与者的**编号**只能留在
 * 一个格子上。落位时把该编号从其它格子清除，并与放置合并成同一个历史步。
 */
describe('number cleanup on placement (SPEC-H01 §1.2)', () => {
  it('keeps the number on the cell just placed and clears it elsewhere', () => {
    const board: GamePlacementBoard = {
      '1,1': { kind: 'numbers', entries: [1] },
      '4,4': { kind: 'numbers', entries: [1] },
    };
    const swept = sweepParticipantNumbers(board, { participantId: 1, except: { x: 1, y: 1 } });
    expect(swept['1,1']).toEqual({ kind: 'numbers', entries: [1] });
    expect(swept['4,4']).toBeUndefined();
  });

  it('drops only the target entry from a shared cell', () => {
    const board: GamePlacementBoard = { '4,4': { kind: 'numbers', entries: [1, 2, 3] } };
    const swept = sweepParticipantNumbers(board, { participantId: 2, except: { x: 0, y: 0 } });
    expect(swept['4,4']).toEqual({ kind: 'numbers', entries: [1, 3] });
  });

  it('leaves an empty cell behind — never a × — when the last entry goes', () => {
    const board: GamePlacementBoard = { '4,4': { kind: 'numbers', entries: [2] } };
    const swept = sweepParticipantNumbers(board, { participantId: 2, except: { x: 0, y: 0 } });
    expect(swept['4,4']).toBeUndefined();
    expect(Object.keys(swept)).toHaveLength(0);
  });

  it('sweeps 编号 only: the anchor cell and a same-participant avatar stay put', () => {
    const board: GamePlacementBoard = {
      '0,0': { kind: 'forbidden' },
      '1,1': { kind: 'numbers', entries: [1] },
      '5,5': { kind: 'participant', index: 1 },
      '7,7': { kind: 'numbers', entries: [9] },
    };
    expect(sweepParticipantNumbers(board, { participantId: 1, except: { x: 1, y: 1 } })).toBe(board);
  });

  it('returns the same board reference when there is nothing to clean', () => {
    const board: GamePlacementBoard = { '1,1': { kind: 'numbers', entries: [1] } };
    expect(sweepParticipantNumbers(board, { participantId: 1, except: { x: 1, y: 1 } })).toBe(board);
    expect(sweepParticipantNumbers(board, { participantId: 2, except: { x: 0, y: 0 } })).toBe(board);
  });

  it('collapses a legacy duplicate board inside the same gesture', () => {
    // A board saved before SPEC-G05 could carry the same 编号 in two cells.
    // Placing the participant on the cell it already occupies is a promote
    // (long-press), and the cleanup folds the stray 编号 into that one step.
    const legacy: GamePlacementBoard = {
      '1,1': { kind: 'numbers', entries: [1] },
      '4,4': { kind: 'numbers', entries: [1] },
    };
    const state = place(withPlacements(legacy), 1, 1, 1, { variant: 'image' });
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'participant', index: 1 });
    expect(placementAt(state.board, 4, 4)).toBeNull();
    expect(participantPlacementAt(state.board, 1)).toEqual({ x: 1, y: 1 });
    expect(state.past).toHaveLength(1);
    // One gesture → one undo step, and that step restores the board it started from.
    expect(undo(state).board).toEqual(legacy);
  });

  it('still spends exactly one history step per gesture (v0.4.1 equivalent)', () => {
    const first = place(createGamePlacementState(), 2, 2, 1);
    expect(first.past).toHaveLength(1);
    // SPEC-J05: a second cell is a second candidate 编号 — that costs a step…
    const second = place(first, 6, 6, 1);
    expect(second.past).toHaveLength(2);
    // …but a refused tap must not eat one.
    const blocked = place(forbid(second, 3, 3), 3, 3, 1);
    expect(blocked.past).toHaveLength(second.past.length + 1);
    const refused = place(blocked, 3, 3, 1);
    expect(refused).toBe(blocked);
    expect(placementAt(second.board, 2, 2)).toEqual({ kind: 'numbers', entries: [1] });
  });
});

/**
 * SPEC-J05 §3.6（docs/v0.4.3.md）：编号 = 候选标记，**可以重复落在多个格子上**；
 * 唯一的是头像。连带两处口径：`participantPlacementAt` 先看头像（没有头像时只有
 * 「恰好一个候选」才算数），提交校验把「只有候选、没确认」与「完全没动」分开讲。
 */
describe('a 编号 repeats across cells (SPEC-J05 §3.6)', () => {
  it('keeps a copy on every cell the 编号 was tapped on', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 3, 1, 1, { gridSize: 5 });
    state = place(state, 4, 4, 1, { gridSize: 5 });
    expect(countPlacements(state.board)).toBe(3);
    for (const [x, y] of [[0, 0], [3, 1], [4, 4]] as const) {
      expect(placementAt(state.board, x, y)).toEqual({ kind: 'numbers', entries: [1] });
    }
    expect(candidateCellCount(state.board, 1)).toBe(3);
    // 候选编号不产生任何排除项，也不互相清理。
    expect(forbiddenCells(state.board).size).toBe(0);
    expect(placedParticipantIds(state.board).has(1)).toBe(true);
  });

  it('takes one copy away without touching the others', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 2, 2, 1, { gridSize: 5 });
    const off = place(state, 2, 2, 1, { gridSize: 5 });
    expect(placementAt(off.board, 2, 2)).toBeNull();
    expect(placementAt(off.board, 0, 0)).toEqual({ kind: 'numbers', entries: [1] });
    expect(candidateCellCount(off.board, 1)).toBe(1);
  });

  it('answers 「where is this participant」 with the avatar, else the lone candidate', () => {
    const single = place(createGamePlacementState(), 2, 2, 5).board;
    expect(participantPlacementAt(single, 5)).toEqual({ x: 2, y: 2 });
    // 两个候选、没有头像 → 谁也确认不了 → null（不随机挑一个）。
    const many = place(withPlacements(single), 4, 4, 5, { gridSize: 5 });
    expect(participantPlacementAt(many.board, 5)).toBeNull();
    // 头像压过候选编号。
    const confirmed = place(many, 4, 4, 5, { gridSize: 5, variant: 'image' });
    expect(participantPlacementAt(confirmed.board, 5)).toEqual({ x: 4, y: 4 });
  });

  it('tells 「尚未确认」 apart from 「尚未放置」 at submit time', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 2, 2, 1, { gridSize: 5 });
    const result = validatePlacement({ board: state.board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([
      {
        participantId: 1,
        code: 'unplaced',
        message: '编号 1 尚未确认（2 格只有候选编号，长按格子放置头像才算放置）',
      },
      { participantId: 2, code: 'unplaced', message: '编号 2 尚未放置' },
    ]);
  });

  it('passes a participant who confirmed the avatar on one of its candidate cells', () => {
    let state = place(createGamePlacementState(), 1, 1, 1, { gridSize: 5 });
    state = place(state, 1, 1, 1, { gridSize: 5, variant: 'image' });
    const result = validatePlacement({ board: state.board, slots: [slot(101)] });
    expect(result.issues).toEqual([]);
    expect(result.passed).toBe(true);
  });
});

/**
 * v0.7.12：提交按钮的可用条件 —— 名单上每位都**已经有头像**。
 *
 * 「编号不算参与者」在这里是同一句话的另一个说法：点出来的一格编号只是草稿，
 * 不能把按钮点亮。
 */
describe('allParticipantsPlaced（v0.7.12）', () => {
  it('needs an avatar for every slot — 编号 顶不上', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 5 });
    state = place(state, 2, 2, 2, { gridSize: 5 });
    expect(allParticipantsPlaced(state.board, [slot(101), slot(102)])).toBe(false);

    state = place(state, 1, 1, 2, { gridSize: 5, variant: 'image' });
    // 2 有头像了，1 还只有编号 —— 仍然不许提交。
    expect(allParticipantsPlaced(state.board, [slot(101), slot(102)])).toBe(false);

    state = place(state, 0, 0, 1, { gridSize: 5, variant: 'image' });
    expect(allParticipantsPlaced(state.board, [slot(101), slot(102)])).toBe(true);
  });

  it('ignores empty roster frames and an empty roster', () => {
    expect(allParticipantsPlaced({}, [null, null])).toBe(true);
    expect(allParticipantsPlaced({}, [])).toBe(true);
  });
});

/**
 * v0.5.1 SPEC-L05（docs/v0.5.1.md §5.1）：参与者框的变淡只对**头像**生效。
 *
 * `placedParticipantIds`（「有任何标记」）语义不变，新增的
 * `avatarPlacedParticipantIds`（「只有头像」）才是游戏页变淡用的集合 ——
 * 所以放编号时卡片保持原样，确认头像后才淡下去。
 */
describe('avatarPlacedParticipantIds（v0.5.1 SPEC-L05）', () => {
  it('ignores a plain 编号 — the card must not fade', () => {
    const state = place(createGamePlacementState(), 2, 2, 1);
    expect(placementAt(state.board, 2, 2)).toEqual({ kind: 'numbers', entries: [1] });
    // The old set still sees it (it is the uniqueness rule's view)…
    expect(placedParticipantIds(state.board)).toEqual(new Set([1]));
    // …but the fade no longer does.
    expect(avatarPlacedParticipantIds(state.board)).toEqual(new Set());
  });

  it('ignores several candidate 编号 for the same participant', () => {
    let state = place(createGamePlacementState(), 0, 0, 3);
    state = place(state, 4, 4, 3);
    expect(placedParticipantIds(state.board)).toEqual(new Set([3]));
    expect(avatarPlacedParticipantIds(state.board)).toEqual(new Set());
  });

  it('collects the avatar once it lands', () => {
    const state = place(createGamePlacementState(), 1, 1, 2, {
      gridSize: 6,
      variant: 'image',
    });
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'participant', index: 2 });
    expect(avatarPlacedParticipantIds(state.board)).toEqual(new Set([2]));
  });

  it('restores the card when the avatar is cleared', () => {
    const placed = place(createGamePlacementState(), 1, 1, 2, {
      gridSize: 6,
      variant: 'image',
    });
    const cleared = clearCell(placed, { x: 1, y: 1 });
    expect(avatarPlacedParticipantIds(cleared.board)).toEqual(new Set());
  });

  it('never counts an × as a placement', () => {
    const state = placeForbidden(createGamePlacementState(), {
      x: 3,
      y: 3,
      blockingCells: EMPTY_NOSTAND,
    });
    expect(avatarPlacedParticipantIds(state.board)).toEqual(new Set());
    expect(placedParticipantIds(state.board)).toEqual(new Set());
  });

  it('returns an empty set for an untouched board', () => {
    expect(avatarPlacedParticipantIds(createGamePlacementState().board)).toEqual(new Set());
  });
});

/**
 * v0.8.5：头像落下之后名册的选中态要退掉；编号不能退 —— 那是一次连续动作。
 */
describe('modeAfterPlacement (v0.8.5)', () => {
  const placing = { kind: 'placing', participantId: 3 } as const;

  it('头像放下之后回到 idle —— 手上不再举着那位参与者', () => {
    expect(modeAfterPlacement(placing, 'image')).toEqual({ kind: 'idle' });
  });

  it('编号不退出放置态，而且是同一个对象（调用方据此跳过 setState）', () => {
    expect(modeAfterPlacement(placing, 'number')).toBe(placing);
  });

  it('其他工具态原样返回', () => {
    const forbidden = { kind: 'forbidden' } as const;
    expect(modeAfterPlacement(forbidden, 'image')).toBe(forbidden);
    expect(modeAfterPlacement({ kind: 'idle' }, 'image')).toEqual({ kind: 'idle' });
  });
});
