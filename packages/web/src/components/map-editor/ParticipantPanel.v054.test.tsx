import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARTICIPANT_SEQ_FONT_SIZE,
  PARTICIPANT_SEQ_SIZE,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';
import { readSource } from '@/testing/source';

/**
 * FEAT-O12 / FEAT-O13 (docs/v0.5.4.md §6): every participant card — editor,
 * puzzle editor, game page and preview, since they all share this component —
 * shows the character's **name** between the avatar and the clue, and the
 * sequence badge is bigger and flush with the card's own frame.
 */

const source = readSource('components/map-editor/ParticipantPanel.tsx');

const CHARACTER: Character = {
  id: 1,
  code: 'jade',
  name: '阿玉',
  gender: 'female',
  description: null,
  avatarPath: null,
  avatarUrl: null,
  avatarThumbUrl: null,
  avatarMime: null,
  avatarSize: null,
  avatarWidth: null,
  avatarHeight: null,
  bgColor: null,
  meta: {},
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ParticipantPanel — 源码契约（FEAT-O12 / FEAT-O13）', () => {
  it('renders the name in its own row between the avatar and the clue', () => {
    expect(source).toContain('PARTICIPANT_NAME_HEIGHT');
    const avatar = source.indexOf('data-testid={`slot-avatar-${index}`}');
    const name = source.indexOf('data-testid={`slot-name-${index}`}');
    // The clue block's own inline style — `CLUE_AREA_HEIGHT` alone would also
    // hit the constant's definition and the card's height sum.
    const clue = source.indexOf('style={{ height: CLUE_AREA_HEIGHT }}');
    expect(avatar).toBeGreaterThan(-1);
    // Avatar → name → clue, in that order.
    expect(name).toBeGreaterThan(avatar);
    expect(clue).toBeGreaterThan(name);
  });

  it('the badge sits on the corner and borrows the card frame', () => {
    // FEAT-O13: no top / left border of its own; only the bottom-right rounds.
    expect(source).toContain('borderTopWidth: 0');
    expect(source).toContain('borderLeftWidth: 0');
    expect(source).toContain('PARTICIPANT_SEQ_BORDER_RADIUS');
    expect(source).toContain('PARTICIPANT_SEQ_SIZE');
    // …and it grew.
    expect(PARTICIPANT_SEQ_SIZE).toBe(20);
    expect(PARTICIPANT_SEQ_FONT_SIZE).toBe(14);
  });

  it('adds the name row to the card height instead of stealing from the clue', () => {
    expect(source).toContain('height: PANEL_CELL_HEIGHT + NAME_AREA_HEIGHT + CLUE_AREA_HEIGHT,');
  });
});

describe('ParticipantPanel — 渲染行为（FEAT-O12 / FEAT-O13）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(slots: Array<CharacterSlotEntry | null>): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={slots}
          charactersById={new Map([[1, CHARACTER]])}
          selectedSlotIndex={null}
          draggingIndex={null}
          onActivateClick={vi.fn()}
        />,
      );
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the character name under the avatar', () => {
    render([{ characterId: 1, clue: '不在花丛旁' }]);
    const name = container.querySelector<HTMLElement>('[data-testid="slot-name-0"]');
    expect(name?.textContent).toBe('阿玉');
    expect(name?.getAttribute('title')).toBe('阿玉');
  });

  it('renders no name row for an empty slot', () => {
    render([null]);
    expect(container.querySelector('[data-testid="slot-name-0"]')).toBeNull();
  });

  it('the sequence badge is taller and flush with the corner', () => {
    render([{ characterId: 1 }]);
    const badge = container.querySelector<HTMLElement>('[data-testid="slot-seq-0"]');
    expect(badge?.textContent).toBe('1');
    expect(badge?.style.height).toBe(`${PARTICIPANT_SEQ_SIZE}px`);
    expect(badge?.style.fontSize).toBe(`${PARTICIPANT_SEQ_FONT_SIZE}px`);
    expect(badge?.style.top).toBe('0px');
    expect(badge?.style.left).toBe('0px');
    expect(badge?.style.borderTopWidth).toBe('0px');
    expect(badge?.style.borderLeftWidth).toBe('0px');
  });
});
