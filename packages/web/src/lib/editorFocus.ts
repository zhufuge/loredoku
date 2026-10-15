import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import type { Selection } from '@/stores/editorStore';

/**
 * OPT-C07 (docs/v0.3.7.md §OPT-C07): clicking the board must take the focus
 * away from an active participant, so the two highlight sources never fight
 * for attention.
 *
 * The editor has two independent focus axes:
 *
 * - `activation` — the participant linkage preview (`activeParticipantId` +
 *   `activationMode`, v0.3.3 MOD-802);
 * - `selection` — the operation box + info drawer (v0.3.5 OPT-A05).
 *
 * The state-machine shape of `activation` is *unchanged* — this module only
 * encodes the mutual-exclusion rule between the two axes, so the rule lives in
 * exactly one testable place instead of being spread over the page handlers.
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
      // §2: clearing the participant happens for **both** activation modes.
      // A click on a region label counts too — otherwise a click-pinned
      // participant would stay highlighted next to the region drawer.
      return { activation: { ...INACTIVE_ACTIVATION }, selection: event.selection };

    case 'participant':
      // Toggle semantics stay in `reduceLinkageActivation`; the cell selection
      // is dropped because the drawer switches to the participant (§5).
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
 * Who currently owns the drawer. A hover-activated participant does **not**
 * take the drawer away from a selected cell (v0.3.3 MOD-802: hover never
 * changes the drawer), only a click-pinned participant does.
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
