import { describe, expect, it } from 'vitest';
import type { CellPlacement, CharacterSlotEntry, GamePlacementBoard } from '@loredoku/shared';
import {
  autoForbiddenCells,
  canPlaceForbidden,
  canPlaceParticipant,
  canRedo,
  canUndo,
  cellKey,
  clearAll,
  clearCell,
  countPlacements,
  createGamePlacementState,
  forbiddenCells,
  formatCellLabel,
  hasParticipant,
  numberSlotAnchor,
  numbersIn,
  participantPlacementAt,
  placeForbidden,
  placeParticipant,
  placedParticipantIds,
  placementAt,
  placementBlockReason,
  redo,
  resolveToolHint,
  submitPlacement,
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
    noStandCells?: Set<string>;
    variant?: ParticipantPlacementVariant;
    gridSize?: number;
  } = {},
): GamePlacementState {
  return placeParticipant(state, {
    x,
    y,
    participantId,
    noStandCells: options.noStandCells ?? EMPTY_NOSTAND,
    gridSize: options.gridSize ?? GRID,
    variant: options.variant ?? 'number',
  });
}

function forbid(state: GamePlacementState, x: number, y: number): GamePlacementState {
  return placeForbidden(state, { x, y, noStandCells: EMPTY_NOSTAND });
}

/** The `×` keys the sweep added around a placement at (x, y). */
function sweepOf(x: number, y: number, gridSize = GRID): string[] {
  return autoForbiddenCells({
    board: {},
    x,
    y,
    gridSize,
    noStandCells: EMPTY_NOSTAND,
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

  it('appends a second participant as a number, hiding the avatar', () => {
    let state = place(createGamePlacementState(), 1, 1, 1, { variant: 'image' });
    state = place(state, 1, 1, 2);
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'numbers', entries: [1, 2] });
    expect(numbersIn(placementAt(state.board, 1, 1))).toEqual([1, 2]);
  });

  it('promotes a carried number to the avatar on long-press', () => {
    let state = place(createGamePlacementState(), 0, 0, 2);
    state = place(state, 0, 0, 2, { variant: 'image' });
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'participant', index: 2 });
  });

  it('ignores a repeat of the same participant on the same cell', () => {
    const first = place(createGamePlacementState(), 0, 0, 3);
    const second = place(first, 0, 0, 3);
    // No new history step either — a rejected click must not eat an undo.
    expect(second).toBe(first);
    expect(placementAt(second.board, 0, 0)).toEqual({ kind: 'numbers', entries: [3] });
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
    expect(canPlaceParticipant({ board: state.board, x: 1, y: 1, participantId: 1, noStandCells: noStand })).toBe(false);
    expect(place(state, 1, 1, 1, { noStandCells: noStand })).toBe(state);
    expect(place(state, 1, 1, 1, { noStandCells: noStand, variant: 'image' })).toBe(state);
    expect(
      placementBlockReason({ board: state.board, x: 1, y: 1, participantId: 1, noStandCells: noStand }),
    ).toBe('non-standable');
  });

  it('rejects a cell that already carries a × in both variants', () => {
    const state = forbid(createGamePlacementState(), 4, 4);
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, noStandCells: EMPTY_NOSTAND })).toBe(false);
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, noStandCells: EMPTY_NOSTAND, variant: 'image' })).toBe(false);
    expect(place(state, 4, 4, 1)).toBe(state);
    expect(place(state, 4, 4, 1, { variant: 'image' })).toBe(state);
  });

  it('rejects a tenth number on a tap — but a long-press still confirms', () => {
    const full: GamePlacementBoard = {
      '0,0': { kind: 'numbers', entries: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    };
    const state = withPlacements(full);
    expect(canPlaceParticipant({ board: state.board, x: 0, y: 0, participantId: 10, noStandCells: EMPTY_NOSTAND })).toBe(false);
    expect(place(state, 0, 0, 10)).toBe(state);
    // The confirm gesture replaces the cell wholesale, so a full grid is no
    // obstacle for the image variant.
    expect(canPlaceParticipant({ board: state.board, x: 0, y: 0, participantId: 4, noStandCells: EMPTY_NOSTAND, variant: 'image' })).toBe(true);
    const confirmed = place(state, 0, 0, 4, { variant: 'image' });
    expect(placementAt(confirmed.board, 0, 0)).toEqual({ kind: 'participant', index: 4 });
  });
});

describe('placement uniqueness (SPEC-G05 §5.2)', () => {
  it('refuses a second cell for the same participant', () => {
    const first = place(createGamePlacementState(), 1, 1, 1);
    const second = place(first, 4, 4, 1);
    expect(second).toBe(first);
    expect(placementAt(second.board, 4, 4)).toBeNull();
    expect(
      placementBlockReason({
        board: first.board,
        x: 4,
        y: 4,
        participantId: 1,
        noStandCells: EMPTY_NOSTAND,
      }),
    ).toBe('elsewhere');
  });

  it('refuses a second cell even when the new one is a long-press', () => {
    const first = place(createGamePlacementState(), 1, 1, 2);
    expect(place(first, 5, 5, 2, { variant: 'image' })).toBe(first);
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

describe('the automatic × on the row and column (SPEC-G06)', () => {
  it('covers exactly the rest of the row and the column', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6 });
    const swept = sweepOf(2, 3, 6);
    // 5 others on the row + 5 others on the column.
    expect(swept).toHaveLength(10);
    for (const key of swept) {
      expect(placementAt(next.board, ...(key.split(',').map(Number) as [number, number]))).toEqual({
        kind: 'forbidden',
      });
    }
    // The cell that received the participant is untouched.
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'numbers', entries: [1] });
  });

  it('skips non-standable cells, avatars and existing ×', () => {
    // A pre-existing avatar at (3,0): the sweep must leave it alone.
    const state = withPlacements({ '3,0': { kind: 'participant', index: 8 } });
    const next = place(state, 1, 0, 1, { noStandCells: nostand('4,0'), gridSize: 5 });
    // Row 0: 0 → ×, 1 = placed, 2 → ×, 3 = avatar, 4 = non-standable.
    expect(placementAt(next.board, 0, 0)).toEqual({ kind: 'forbidden' });
    expect(placementAt(next.board, 2, 0)).toEqual({ kind: 'forbidden' });
    expect(placementAt(next.board, 3, 0)).toEqual({ kind: 'participant', index: 8 });
    expect(placementAt(next.board, 4, 0)).toBeNull();
    // Column 1: every other row takes the ×.
    expect(placementAt(next.board, 1, 4)).toEqual({ kind: 'forbidden' });
  });

  it('is idempotent — a repeated sweep records no extra step', () => {
    const first = place(createGamePlacementState(), 2, 2, 1, { gridSize: 4 });
    const again = autoForbiddenCells({
      board: first.board,
      x: 2,
      y: 2,
      gridSize: 4,
      noStandCells: EMPTY_NOSTAND,
    });
    // Everything the sweep would touch already carries a ×.
    for (const key of again) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect(placementAt(first.board, x, y)).toEqual({ kind: 'forbidden' });
    }
  });

  it('merges the placement and the sweep into one undo step', () => {
    const placed = place(createGamePlacementState(), 2, 3, 1, { gridSize: 6 });
    const undone = undo(placed);
    expect(countPlacements(undone.board)).toBe(0);
  });

  it('overwrites a numbers-only cell in the row (方案 A §6.2)', () => {
    // Participant 8 sits at (4, 0); placing 1 in the same row clears it out.
    // The × the first placement left on (1,0) is cleared by hand first — that
    // is exactly the path a player takes to reach a row clash at all.
    let state = place(createGamePlacementState(), 4, 0, 8, { gridSize: 6 });
    state = clearCell(state, { x: 1, y: 0 });
    state = place(state, 1, 0, 1, { gridSize: 6 });
    expect(placementAt(state.board, 4, 0)).toEqual({ kind: 'forbidden' });
    expect(placedParticipantIds(state.board).has(8)).toBe(false);
  });

  it('leaves an avatar in the row alone, so the clash reaches the validator', () => {
    let state = place(createGamePlacementState(), 4, 0, 8, { gridSize: 6, variant: 'image' });
    state = clearCell(state, { x: 1, y: 0 });
    state = place(state, 1, 0, 1, { gridSize: 6 });
    expect(placementAt(state.board, 4, 0)).toEqual({ kind: 'participant', index: 8 });
    const result = validatePlacement({
      board: state.board,
      slots: [slot(101), null, null, null, null, null, null, slot(108)],
    });
    expect(result.passed).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'row')).toBe(true);
  });

  it('does not sweep when the placement itself was refused', () => {
    const first = place(createGamePlacementState(), 1, 1, 1, { gridSize: 5 });
    const refused = place(first, 2, 2, 1, { gridSize: 5 });
    expect(refused).toBe(first);
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
    expect(canPlaceForbidden({ board: state.board, x: 2, y: 2, noStandCells: EMPTY_NOSTAND })).toBe(false);
    expect(placeForbidden(state, { x: 2, y: 2, noStandCells: EMPTY_NOSTAND })).toBe(state);
  });

  it('is rejected on a non-standable cell', () => {
    const state = createGamePlacementState();
    expect(placeForbidden(state, { x: 0, y: 1, noStandCells: nostand('0,1') })).toBe(state);
  });

  it('activates the non-standable mask for the cells it covers', () => {
    let state = forbid(createGamePlacementState(), 3, 3);
    state = forbid(state, 1, 2);
    expect(forbiddenCells(state.board)).toEqual(new Set(['3,3', '1,2']));
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

describe('submitting (SPEC-G04 §10.4)', () => {
  it('blocks undo at the submitted snapshot but keeps the board', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 });
    state = submitPlacement(state);
    expect(placementAt(state.board, 0, 0)).not.toBeNull();
    // Undo may not step back past the submission.
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
  });

  it('allows further play after a submit and blocks the way back', () => {
    let state = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 });
    state = submitPlacement(state);
    state = place(state, 1, 1, 2, { gridSize: 4 });
    expect(canUndo(state)).toBe(true);
    state = undo(state);
    expect(placementAt(state.board, 1, 1)).toBeNull();
    expect(placementAt(state.board, 0, 0)).not.toBeNull();
    // Back at the submitted board — no further undo.
    expect(canUndo(state)).toBe(false);
  });
});

describe('submit validation (FEAT-V01 §8)', () => {
  it('passes when every participant is placed on its own row and column', () => {
    // Two participants on a clean diagonal — the auto-× guarantees this state
    // is what a player actually reaches.
    let state = createGamePlacementState();
    state = place(state, 0, 0, 1, { gridSize: 4 });
    state = place(state, 2, 2, 2, { gridSize: 4 });
    const result = validatePlacement({ board: state.board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports an unplaced participant and stops checking that one', () => {
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 }).board;
    const result = validatePlacement({ board, slots: [slot(101), slot(102)] });
    expect(result.passed).toBe(false);
    expect(result.issues).toEqual([
      { participantId: 2, code: 'unplaced', message: '编号 2 尚未放置' },
    ]);
  });

  it('uses the roster names when they are available', () => {
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 }).board;
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
      '1,0': { kind: 'numbers', entries: [1] },
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
      '0,0': { kind: 'numbers', entries: [1] },
      '0,3': { kind: 'numbers', entries: [2] },
    };
    const result = validatePlacement({ board, slots: [slot(101), slot(102)] });
    const columnIssues = result.issues.filter((issue) => issue.code === 'column');
    expect(columnIssues).toHaveLength(2);
    expect(columnIssues[0]?.message).toBe('编号 1 与编号 2 同在第 1 列');
  });

  it('enforces position conditions as an OR list', () => {
    const state = place(createGamePlacementState(), 3, 3, 1, { gridSize: 6 });
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
    const board = place(createGamePlacementState(), 0, 0, 3, { gridSize: 4 }).board;
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
    const board = place(createGamePlacementState(), 0, 0, 1, { gridSize: 4 }).board;
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
});
