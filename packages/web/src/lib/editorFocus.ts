import {
  INACTIVE_ACTIVATION,
  reduceLinkageActivation,
  type LinkageActivationState,
} from '@/lib/linkageActivation';
import type { Selection } from '@/stores/editorStore';

/** OPT-C07 (docs/v0.3.7.md §OPT-C07): clicking the board drops the participant focus, so the two highlight sources never fight. */
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

/** What a click on a region **list item** (left panel) focuses. The list used to set only `selectedRegionId`, so the info drawer opened with `selection === null` and rendered an empty panel (「点列表项，信息框弹出来但是空白」). Both entry points must therefore end with the same pair; this helper is the shared half. */
export function regionFocusSelection(regionId: string | null): Selection | null {
  return regionId === null ? null : { type: 'region', regionId };
}

/** Who currently owns the drawer. Hover never changes it (MOD-802) — only a click-pinned participant takes the drawer away from a selected cell. */
export function focusOwner(focus: EditorFocus): 'participant' | 'cell' | 'region' | 'none' {
  const { activation, selection } = focus;
  if (activation.activeParticipantId !== null && activation.activationMode === 'click') {
    return 'participant';
  }
  if (selection) return selection.type === 'region' ? 'region' : 'cell';
  if (activation.activeParticipantId !== null) return 'participant';
  return 'none';
}

/** BUG-G01 (docs/v0.4.0.md §1): whether the cell / region / participant info drawer is open. Rule: while `mapInfoOpen` is true the info drawer is **always closed**. */
export function infoDrawerOpen(input: {
  infoOpen: boolean;
  mapInfoOpen: boolean;
  selectedSlotIndex: number | null;
}): boolean {
  if (input.mapInfoOpen) return false;
  if (!input.infoOpen) return false;
  return input.selectedSlotIndex === null;
}
