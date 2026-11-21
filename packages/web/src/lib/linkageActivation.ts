/** MOD-802 (docs/v0.3.3.md §1.2.4): the single-active linkage activation state machine — exactly one participant's linkages active at a time. `hover` ends on pointer-leave, `click` is a toggle that survives movement. Pure, so every transition is testable without a DOM. */

export type ActivationMode = 'hover' | 'click';

export interface LinkageActivationState {
  /** Slot index of the active participant, or `null` when nothing is active. */
  activeParticipantId: number | null;
  /** How the current activation was triggered. */
  activationMode: ActivationMode | null;
}

export type LinkageActivationEvent =
  | { type: 'enter'; participantId: number }
  | { type: 'leave'; participantId: number }
  | { type: 'click'; participantId: number }
  /** BUG-G02 (docs/v0.4.1.md §9): idempotent "make this participant the click-activated one" — a plain `click` would *toggle* it off when the pointer leaves the placement-armed card. */
  | { type: 'restore'; participantId: number }
  | { type: 'escape' };

export const INACTIVE_ACTIVATION: LinkageActivationState = {
  activeParticipantId: null,
  activationMode: null,
};

/** Applies one event. */
export function reduceLinkageActivation(
  state: LinkageActivationState,
  event: LinkageActivationEvent,
): LinkageActivationState {
  switch (event.type) {
    case 'enter': {
      const { participantId } = event;
      // A click-activated participant ignores hover entirely.
      if (state.activeParticipantId === participantId && state.activationMode === 'click') {
        return state;
      }
      return { activeParticipantId: participantId, activationMode: 'hover' };
    }
    case 'leave': {
      if (state.activationMode !== 'hover') return state;
      if (state.activeParticipantId !== event.participantId) return state;
      return INACTIVE_ACTIVATION;
    }
    case 'click': {
      const { participantId } = event;
      // Second click on the click-activated participant switches it off.
      if (state.activeParticipantId === participantId && state.activationMode === 'click') {
        return INACTIVE_ACTIVATION;
      }
      return { activeParticipantId: participantId, activationMode: 'click' };
    }
    case 'restore': {
      const { participantId } = event;
      // Already exactly this click activation → nothing to do (idempotent).
      if (state.activeParticipantId === participantId && state.activationMode === 'click') {
        return state;
      }
      return { activeParticipantId: participantId, activationMode: 'click' };
    }
    case 'escape':
      return INACTIVE_ACTIVATION;
  }
}

/** Convenience helper for tests / callers that only need the active id. */
export function isParticipantActive(
  state: LinkageActivationState,
  participantId: number,
): boolean {
  return state.activeParticipantId === participantId;
}
