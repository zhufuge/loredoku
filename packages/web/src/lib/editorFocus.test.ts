import { describe, expect, it } from 'vitest';
import { INACTIVE_ACTIVATION } from './linkageActivation';
import {
  focusOwner,
  infoDrawerOpen,
  INITIAL_FOCUS,
  reduceEditorFocus,
  regionFocusSelection,
  type EditorFocus,
} from './editorFocus';

function focus(activeParticipantId: number | null, mode: 'hover' | 'click' | null): EditorFocus {
  return {
    activation: { activeParticipantId, activationMode: mode },
    selection: null,
  };
}

function withSelection(
  activeParticipantId: number | null,
  mode: 'hover' | 'click' | null,
  selection: EditorFocus['selection'],
): EditorFocus {
  return {
    activation: { activeParticipantId, activationMode: mode },
    selection,
  };
}

const CELL_X = { type: 'cell', x: 2, y: 3 } as const;

describe('reduceEditorFocus (OPT-C07 §2)', () => {
  it('starts with no focus at all', () => {
    expect(INITIAL_FOCUS).toEqual({ activation: INACTIVE_ACTIVATION, selection: null });
    expect(focusOwner(INITIAL_FOCUS)).toBe('none');
  });

  it('§2: clicking a cell clears a hover-activated participant', () => {
    const next = reduceEditorFocus(focus(1, 'hover'), { type: 'cell', selection: CELL_X });
    expect(next.activation).toEqual(INACTIVE_ACTIVATION);
    expect(next.selection).toEqual(CELL_X);
  });

  it('§2: clicking a cell clears a click-pinned participant too', () => {
    const next = reduceEditorFocus(focus(1, 'click'), { type: 'cell', selection: CELL_X });
    expect(next.activation).toEqual(INACTIVE_ACTIVATION);
    expect(next.selection).toEqual(CELL_X);
  });

  it('§2: a click on empty space also clears the participant', () => {
    const next = reduceEditorFocus(focus(0, 'click'), { type: 'cell', selection: null });
    expect(next.activation.activeParticipantId).toBeNull();
    expect(next.selection).toBeNull();
    expect(focusOwner(next)).toBe('none');
  });

  it('§5: a region label click clears the participant as well', () => {
    const next = reduceEditorFocus(focus(1, 'click'), {
      type: 'cell',
      selection: { type: 'region', regionId: 'rg_a' },
    });
    expect(next.activation).toEqual(INACTIVE_ACTIVATION);
    expect(focusOwner(next)).toBe('region');
  });

  it('§2: clicking a participant activates it and drops the cell selection', () => {
    const next = reduceEditorFocus(
      withSelection(null, null, CELL_X),
      { type: 'participant', participantId: 2 },
    );
    expect(next.activation).toEqual({ activeParticipantId: 2, activationMode: 'click' });
    expect(next.selection).toBeNull();
    expect(focusOwner(next)).toBe('participant');
  });

  it('§2: clicking the same participant again clears it', () => {
    const first = reduceEditorFocus(INITIAL_FOCUS, { type: 'participant', participantId: 2 });
    const second = reduceEditorFocus(first, { type: 'participant', participantId: 2 });
    expect(second.activation).toEqual(INACTIVE_ACTIVATION);
    expect(focusOwner(second)).toBe('none');
  });

  it('§2: clicking another participant switches to it', () => {
    const first = reduceEditorFocus(INITIAL_FOCUS, { type: 'participant', participantId: 2 });
    const next = reduceEditorFocus(first, { type: 'participant', participantId: 5 });
    expect(next.activation).toEqual({ activeParticipantId: 5, activationMode: 'click' });
  });

  it('§2: a click promotes a hover-pinned participant to click mode', () => {
    const next = reduceEditorFocus(focus(3, 'hover'), { type: 'participant', participantId: 3 });
    expect(next.activation).toEqual({ activeParticipantId: 3, activationMode: 'click' });
  });

  it('§6: escape clears both axes', () => {
    const next = reduceEditorFocus(
      withSelection(4, 'click', CELL_X),
      { type: 'escape' },
    );
    expect(next).toEqual({ activation: INACTIVE_ACTIVATION, selection: null });
  });

  it('§5: the two axes are mutually exclusive after a participant click', () => {
    let state = reduceEditorFocus(INITIAL_FOCUS, { type: 'cell', selection: CELL_X });
    expect(state.selection).not.toBeNull();
    state = reduceEditorFocus(state, { type: 'participant', participantId: 1 });
    expect(state.selection).toBeNull();
    state = reduceEditorFocus(state, { type: 'cell', selection: CELL_X });
    expect(state.activation.activeParticipantId).toBeNull();
  });
});

describe('focusOwner (OPT-C07 §5)', () => {
  it('a click-pinned participant owns the drawer', () => {
    expect(focusOwner(focus(1, 'click'))).toBe('participant');
  });

  it('hover alone does not take the drawer away from a selected cell', () => {
    // v0.3.3 MOD-802: hover never changes the drawer.
    const state = withSelection(1, 'hover', CELL_X);
    expect(focusOwner(state)).toBe('cell');
  });

  it('falls back to the participant when nothing is selected', () => {
    expect(focusOwner(focus(1, 'hover'))).toBe('participant');
  });

  it('reports a region selection as a region', () => {
    expect(
      focusOwner(withSelection(null, null, { type: 'region', regionId: 'rg_a' })),
    ).toBe('region');
  });
});

// ---- v0.7.0 fix: the region list must focus like the region label ----
describe('regionFocusSelection', () => {
  it('mirrors the canvas label click — both axes end on the region', () => {
    // The list used to set only `selectedRegionId`, so the info drawer opened
    // with `selection === null` and rendered an empty panel.
    expect(regionFocusSelection('rg_a')).toEqual({ type: 'region', regionId: 'rg_a' });
  });

  it('clears the selection when the item is clicked again (toggle off)', () => {
    expect(regionFocusSelection(null)).toBeNull();
  });
});

// ---- BUG-G01 (docs/v0.4.0.md §1): the info drawer must not pop back up ----
describe('infoDrawerOpen (BUG-G01)', () => {
  it('is always closed while the 「地图基本信息」drawer is open', () => {
    // The bug: `EditorCanvas.selectCellAt` writes `selectedRegionId` as well as
    // `selection`, so the page effect that mirrors "any axis is non-null"
    // re-opened the info drawer after the page handler had closed it.
    expect(
      infoDrawerOpen({ infoOpen: true, mapInfoOpen: true, selectedSlotIndex: null }),
    ).toBe(false);
    expect(
      infoDrawerOpen({ infoOpen: true, mapInfoOpen: true, selectedSlotIndex: 2 }),
    ).toBe(false);
  });

  it('stays closed when the page never opened it', () => {
    expect(
      infoDrawerOpen({ infoOpen: false, mapInfoOpen: false, selectedSlotIndex: null }),
    ).toBe(false);
  });

  it('follows the focus axes once the basic-info drawer is closed', () => {
    expect(
      infoDrawerOpen({ infoOpen: true, mapInfoOpen: false, selectedSlotIndex: null }),
    ).toBe(true);
    // A selected slot hands the panel to `ParticipantDrawer` instead.
    expect(
      infoDrawerOpen({ infoOpen: true, mapInfoOpen: false, selectedSlotIndex: 0 }),
    ).toBe(false);
  });
});
