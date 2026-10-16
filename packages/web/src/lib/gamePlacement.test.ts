import { describe, expect, it } from 'vitest';
import type { CellPlacement, GamePlacementBoard } from '@loredoku/shared';
import {
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
  hasParticipant,
  numberSlotAnchor,
  numbersIn,
  placementAt,
  placeForbidden,
  placeParticipant,
  redo,
  resolveToolHint,
  submitPlacement,
  undo,
  type GamePlacementState,
  type ParticipantPlacementVariant,
} from './gamePlacement';

/**
 * SPEC-G01 / SPEC-G03 / SPEC-G04 (docs/v0.4.0.md §7 ~ §10) — the placement
 * rules as pure functions, so the page only has to dispatch.
 */

const EMPTY_NOSTAND = new Set<string>();
const nostand = (...keys: string[]): Set<string> => new Set(keys);

function withPlacements(board: GamePlacementBoard): GamePlacementState {
  return { ...createGamePlacementState(), board };
}

function place(
  state: GamePlacementState,
  x: number,
  y: number,
  participantId: number,
  noStandCells: Set<string> = EMPTY_NOSTAND,
  variant: ParticipantPlacementVariant = 'number',
): GamePlacementState {
  return placeParticipant(state, { x, y, participantId, noStandCells, variant });
}

describe('placing a participant (SPEC-G03 §9.2)', () => {
  it('puts number 1 in the 3×3 grid on an empty cell with a tap', () => {
    const next = place(createGamePlacementState(), 2, 3, 1);
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'numbers', entries: [1] });
    expect(numbersIn(placementAt(next.board, 2, 3))).toEqual([1]);
  });

  it('puts the avatar on an empty cell with a long-press', () => {
    const next = place(createGamePlacementState(), 2, 3, 1, EMPTY_NOSTAND, 'image');
    expect(placementAt(next.board, 2, 3)).toEqual({ kind: 'participant', index: 1 });
  });

  it('appends a second participant as a number, hiding the avatar', () => {
    let state = place(createGamePlacementState(), 1, 1, 1, EMPTY_NOSTAND, 'image');
    state = place(state, 1, 1, 2);
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'numbers', entries: [1, 2] });
    expect(numbersIn(placementAt(state.board, 1, 1))).toEqual([1, 2]);
  });

  it('promotes a carried number to the avatar on long-press', () => {
    let state = place(createGamePlacementState(), 0, 0, 2);
    state = place(state, 0, 0, 2, EMPTY_NOSTAND, 'image');
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
    const first = place(createGamePlacementState(), 0, 0, 3, EMPTY_NOSTAND, 'image');
    const second = place(first, 0, 0, 3, EMPTY_NOSTAND, 'image');
    expect(second).toBe(first);
    expect(placementAt(second.board, 0, 0)).toEqual({ kind: 'participant', index: 3 });
  });

  it('rejects a non-standable cell in both variants', () => {
    const state = createGamePlacementState();
    expect(canPlaceParticipant({ board: state.board, x: 1, y: 1, participantId: 1, noStandCells: nostand('1,1') })).toBe(false);
    expect(place(state, 1, 1, 1, nostand('1,1'))).toBe(state);
    expect(place(state, 1, 1, 1, nostand('1,1'), 'image')).toBe(state);
  });

  it('rejects a cell that already carries a × in both variants', () => {
    const state = placeForbidden(createGamePlacementState(), { x: 4, y: 4, noStandCells: EMPTY_NOSTAND });
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, noStandCells: EMPTY_NOSTAND })).toBe(false);
    expect(canPlaceParticipant({ board: state.board, x: 4, y: 4, participantId: 1, noStandCells: EMPTY_NOSTAND, variant: 'image' })).toBe(false);
    expect(place(state, 4, 4, 1)).toBe(state);
    expect(place(state, 4, 4, 1, EMPTY_NOSTAND, 'image')).toBe(state);
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
    const confirmed = place(state, 0, 0, 4, EMPTY_NOSTAND, 'image');
    expect(placementAt(confirmed.board, 0, 0)).toEqual({ kind: 'participant', index: 4 });
  });

  it('keeps separate cells independent', () => {
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = place(state, 5, 5, 2);
    expect(countPlacements(state.board)).toBe(2);
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'numbers', entries: [1] });
    expect(placementAt(state.board, 5, 5)).toEqual({ kind: 'numbers', entries: [2] });
  });
});

describe('the forbidden × (SPEC-G04 §10.1)', () => {
  it('replaces a numbers-only cell', () => {
    let state = place(createGamePlacementState(), 1, 1, 1);
    state = place(state, 1, 1, 2);
    state = placeForbidden(state, { x: 1, y: 1, noStandCells: EMPTY_NOSTAND });
    expect(placementAt(state.board, 1, 1)).toEqual({ kind: 'forbidden' });
  });

  it('leaves a cell showing a participant avatar alone', () => {
    const state = place(createGamePlacementState(), 2, 2, 1, EMPTY_NOSTAND, 'image');
    expect(canPlaceForbidden({ board: state.board, x: 2, y: 2, noStandCells: EMPTY_NOSTAND })).toBe(false);
    expect(placeForbidden(state, { x: 2, y: 2, noStandCells: EMPTY_NOSTAND })).toBe(state);
  });

  it('is rejected on a non-standable cell', () => {
    const state = createGamePlacementState();
    expect(placeForbidden(state, { x: 0, y: 1, noStandCells: nostand('0,1') })).toBe(state);
  });

  it('activates the non-standable mask for the cells it covers', () => {
    let state = placeForbidden(createGamePlacementState(), { x: 3, y: 3, noStandCells: EMPTY_NOSTAND });
    state = placeForbidden(state, { x: 1, y: 2, noStandCells: EMPTY_NOSTAND });
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
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = place(state, 1, 1, 2);
    state = place(state, 2, 2, 3);
    const wiped = clearAll(state);
    expect(countPlacements(wiped.board)).toBe(0);
    // The wipe adds exactly one step on top of the three placements.
    expect(wiped.past).toHaveLength(state.past.length + 1);
    const restored = undo(wiped);
    expect(countPlacements(restored.board)).toBe(3);
  });
});

describe('undo / redo (SPEC-G04 §10.3)', () => {
  it('steps back one operation at a time', () => {
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = place(state, 1, 0, 2);
    state = place(state, 2, 0, 3);
    state = undo(state);
    expect(placementAt(state.board, 2, 0)).toBeNull();
    state = undo(state);
    expect(placementAt(state.board, 1, 0)).toBeNull();
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'numbers', entries: [1] });
  });

  it('is disabled with an empty stack and returns the same state', () => {
    const state = createGamePlacementState();
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
    expect(canRedo(state)).toBe(false);
    expect(redo(state)).toBe(state);
  });

  it('a new placement clears the redo stack', () => {
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = undo(state);
    expect(canRedo(state)).toBe(true);
    state = place(state, 4, 4, 2);
    expect(canRedo(state)).toBe(false);
    expect(placementAt(state.board, 0, 0)).toBeNull();
    expect(placementAt(state.board, 4, 4)).toEqual({ kind: 'numbers', entries: [2] });
  });

  it('redoes an undone placement', () => {
    const placed = place(createGamePlacementState(), 1, 1, 1);
    const undone = undo(placed);
    const redone = redo(undone);
    expect(placementAt(redone.board, 1, 1)).toEqual({ kind: 'numbers', entries: [1] });
  });

  it('caps the history at the configured maximum', () => {
    let state = createGamePlacementState();
    for (let index = 0; index < 210; index += 1) {
      state = clearCell(state, { x: index % 24, y: Math.floor(index / 24) });
      if (index % 2 === 0) {
        state = place(state, index % 24, Math.floor(index / 24), 1);
      }
    }
    expect(state.past.length).toBeLessThanOrEqual(200);
  });
});

describe('submitting (SPEC-G04 §10.4)', () => {
  it('blocks undo at the submitted snapshot but keeps the board', () => {
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = submitPlacement(state);
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'numbers', entries: [1] });
    // Undo may not step back past the submission.
    expect(canUndo(state)).toBe(false);
    expect(undo(state)).toBe(state);
  });

  it('allows further play after a submit and blocks the way back', () => {
    let state = place(createGamePlacementState(), 0, 0, 1);
    state = submitPlacement(state);
    state = place(state, 1, 1, 2);
    expect(canUndo(state)).toBe(true);
    state = undo(state);
    expect(placementAt(state.board, 1, 1)).toBeNull();
    expect(placementAt(state.board, 0, 0)).toEqual({ kind: 'numbers', entries: [1] });
    // Back at the submitted board — no further undo.
    expect(canUndo(state)).toBe(false);
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
