import { describe, expect, it } from 'vitest';
import {
  INACTIVE_ACTIVATION,
  isParticipantActive,
  reduceLinkageActivation,
  type LinkageActivationEvent,
  type LinkageActivationState,
} from './linkageActivation';

/** Applies a list of events in order. */
function run(state: LinkageActivationState, events: LinkageActivationEvent[]): LinkageActivationState {
  return events.reduce(reduceLinkageActivation, state);
}

const enter = (participantId: number): LinkageActivationEvent => ({ type: 'enter', participantId });
const leave = (participantId: number): LinkageActivationEvent => ({ type: 'leave', participantId });
const click = (participantId: number): LinkageActivationEvent => ({ type: 'click', participantId });
const restore = (participantId: number): LinkageActivationEvent => ({
  type: 'restore',
  participantId,
});
const escape: LinkageActivationEvent = { type: 'escape' };

describe('reduceLinkageActivation (MOD-802 §1.2.4)', () => {
  it('hover enter activates, hover leave deactivates', () => {
    const active = reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1));
    expect(active).toEqual({ activeParticipantId: 1, activationMode: 'hover' });
    expect(reduceLinkageActivation(active, leave(1))).toEqual(INACTIVE_ACTIVATION);
  });

  it('click activates, second click on the same participant deactivates', () => {
    const active = reduceLinkageActivation(INACTIVE_ACTIVATION, click(1));
    expect(active).toEqual({ activeParticipantId: 1, activationMode: 'click' });
    expect(reduceLinkageActivation(active, click(1))).toEqual(INACTIVE_ACTIVATION);
  });

  it('click activation survives pointer leave / re-enter', () => {
    const active = run(INACTIVE_ACTIVATION, [click(1)]);
    expect(reduceLinkageActivation(active, leave(1))).toEqual(active);
    expect(reduceLinkageActivation(active, enter(1))).toEqual(active);
  });

  it('hovering another participant auto-ends the current one', () => {
    const hoverA = reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1));
    const hoverB = reduceLinkageActivation(hoverA, enter(2));
    expect(hoverB).toEqual({ activeParticipantId: 2, activationMode: 'hover' });
  });

  it('clicking another participant auto-ends the current one', () => {
    const clickA = reduceLinkageActivation(INACTIVE_ACTIVATION, click(1));
    const clickB = reduceLinkageActivation(clickA, click(2));
    expect(clickB).toEqual({ activeParticipantId: 2, activationMode: 'click' });
  });

  it('clicking a hover-active participant upgrades to click mode without a gap', () => {
    const hoverA = reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1));
    const clickA = reduceLinkageActivation(hoverA, click(1));
    expect(clickA).toEqual({ activeParticipantId: 1, activationMode: 'click' });
    // Still active — the second click is what turns it off.
    expect(reduceLinkageActivation(clickA, click(1))).toEqual(INACTIVE_ACTIVATION);
  });

  it('click-active participant ignores hover enter and hover leave', () => {
    const clickA = reduceLinkageActivation(INACTIVE_ACTIVATION, click(1));
    expect(reduceLinkageActivation(clickA, enter(1))).toEqual(clickA);
    expect(reduceLinkageActivation(clickA, leave(1))).toEqual(clickA);
  });

  it('leave for a non-active participant is a no-op', () => {
    const hoverA = reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1));
    expect(reduceLinkageActivation(hoverA, leave(2))).toEqual(hoverA);
    expect(reduceLinkageActivation(INACTIVE_ACTIVATION, leave(1))).toEqual(INACTIVE_ACTIVATION);
  });

  it('escape force-clears any activation', () => {
    expect(reduceLinkageActivation(reduceLinkageActivation(INACTIVE_ACTIVATION, click(1)), escape))
      .toEqual(INACTIVE_ACTIVATION);
    expect(reduceLinkageActivation(reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1)), escape))
      .toEqual(INACTIVE_ACTIVATION);
  });

  it('hover-active participant ends on leave even after another was clicked', () => {
    // A click-active, B hover-active → leave B ends it; A stays.
    const state = run(INACTIVE_ACTIVATION, [click(1), enter(2)]);
    expect(state).toEqual({ activeParticipantId: 2, activationMode: 'hover' });
    expect(reduceLinkageActivation(state, leave(2))).toEqual(INACTIVE_ACTIVATION);
  });

  it('full spec sequence: hover → leave → click → leave → re-enter → click', () => {
    const state = run(INACTIVE_ACTIVATION, [
      enter(1), // hover active
      leave(1), // hover ends
      click(1), // click active
      leave(1), // ignored (click mode)
      enter(1), // ignored (click mode)
      click(1), // toggle off
    ]);
    expect(state).toEqual(INACTIVE_ACTIVATION);
  });

  it('isParticipantActive reports the active slot only', () => {
    const active = reduceLinkageActivation(INACTIVE_ACTIVATION, click(3));
    expect(isParticipantActive(active, 3)).toBe(true);
    expect(isParticipantActive(active, 1)).toBe(false);
    expect(isParticipantActive(INACTIVE_ACTIVATION, 3)).toBe(false);
  });
});

describe('restore (BUG-G02 §9)', () => {
  it('pins the participant as click-active', () => {
    expect(reduceLinkageActivation(INACTIVE_ACTIVATION, restore(1))).toEqual({
      activeParticipantId: 1,
      activationMode: 'click',
    });
  });

  it('is idempotent — re-asserting the same participant is a no-op', () => {
    const active = run(INACTIVE_ACTIVATION, [restore(1)]);
    expect(reduceLinkageActivation(active, restore(1))).toBe(active);
    expect(run(INACTIVE_ACTIVATION, [restore(1), restore(1), restore(1)])).toEqual({
      activeParticipantId: 1,
      activationMode: 'click',
    });
  });

  it('upgrades a hover activation to click without a gap', () => {
    const hover = reduceLinkageActivation(INACTIVE_ACTIVATION, enter(1));
    expect(reduceLinkageActivation(hover, restore(1))).toEqual({
      activeParticipantId: 1,
      activationMode: 'click',
    });
  });

  it('switches the active participant when re-asserted on another one', () => {
    const clickB = reduceLinkageActivation(INACTIVE_ACTIVATION, click(2));
    expect(reduceLinkageActivation(clickB, restore(1))).toEqual({
      activeParticipantId: 1,
      activationMode: 'click',
    });
  });

  it('BUG-G02: the armed card stays highlighted after the pointer leaves it', () => {
    // Placement-armed participant 4 → pointer leaves its card, then drifts off
    // it. A plain `click` would toggle it off; `restore` keeps it active.
    const armed = run(INACTIVE_ACTIVATION, [restore(4)]);
    expect(reduceLinkageActivation(armed, leave(4))).toEqual(armed);
    expect(reduceLinkageActivation(armed, restore(4))).toEqual(armed);
    const hover5 = reduceLinkageActivation(armed, enter(5));
    expect(hover5).toEqual({ activeParticipantId: 5, activationMode: 'hover' });
    // …leaving the other card re-asserts the armed participant.
    expect(reduceLinkageActivation(hover5, restore(4))).toEqual({
      activeParticipantId: 4,
      activationMode: 'click',
    });
  });
});
