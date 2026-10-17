import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import type { Selection } from '@/stores/editorStore';

/**
 * OPT-C07 (docs/v0.3.7.md §OPT-C07): clicking the board drops the participant
 * focus, so the two highlight sources never fight. Two independent axes —
 * `activation` (linkage preview, MOD-802) and `selection` (operation box + info
 * drawer, OPT-A05). `activation`'s own state machine is unchanged; this module
 * only encodes the mutual-exclusion rule, in one testable place.
 */
export interface EditorFocus {
  activation: LinkageActivationState;
  selection: Selection | null;
}

export type FocusEvent =
  /** A click on the board: a cell, a region label, or empty space (`null`). */
  | { type: 'cell'; selection: Selection | null }
  /** A click on a participant card — toggle-style, same as MOD-802. */
  | { type: 'participant'; participantId: number }
  /** Esc — clears both axes. */
  | { type: 'escape' };

export const INITIAL_FOCUS: EditorFocus = {
  activation: { ...INACTIVE_ACTIVATION },
  selection: null,
};

export function reduceEditorFocus(focus: EditorFocus, event: FocusEvent): EditorFocus {
  switch (event.type) {
    case 'cell':
      // §2: cleared for **both** activation modes; a region label counts too,
      // otherwise a click-pinned participant stays lit next to the drawer.
      return { activation: { ...INACTIVE_ACTIVATION }, selection: event.selection };

    case 'participant':
      // Toggle semantics stay in `reduceLinkageActivation`; the cell selection is
      // dropped because the drawer switches to the participant (§5).
      return {
        activation: reduceLinkageActivation(focus.activation, {
          type: 'click',
          participantId: event.participantId,
        }),
        selection: null,
      };

    case 'escape':
      return { activation: { ...INACTIVE_ACTIVATION }, selection: null };
  }
}

/**
 * Who currently owns the drawer. Hover never changes it (MOD-802) — only a
 * click-pinned participant takes the drawer away from a selected cell.
 */
export function focusOwner(focus: EditorFocus): 'participant' | 'cell' | 'region' | 'none' {
  const { activation, selection } = focus;
  if (activation.activeParticipantId !== null && activation.activationMode === 'click') {
    return 'participant';
  }
  if (selection) return selection.type === 'region' ? 'region' : 'cell';
  if (activation.activeParticipantId !== null) return 'participant';
  return 'none';
}

/**
 * BUG-G01 (docs/v0.4.0.md §1): whether the cell / region / participant info
 * drawer is open. The focus axes live in the store while `infoOpen` is page
 * state, and a cell click sets **both** `selection` and `selectedRegionId`, so
 * an effect mirroring "any axis is non-null" re-opens the drawer after the page
 * handler closed it. Rule: while `mapInfoOpen` is true the info drawer is
 * **always closed**.
 */
export function infoDrawerOpen(input: {
  infoOpen: boolean;
  mapInfoOpen: boolean;
  selectedSlotIndex: number | null;
}): boolean {
  if (input.mapInfoOpen) return false;
  if (!input.infoOpen) return false;
  return input.selectedSlotIndex === null;
}
