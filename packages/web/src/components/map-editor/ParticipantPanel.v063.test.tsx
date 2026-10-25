import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PARTICIPANT_CELL_GAP,
  PARTICIPANT_MIN_WIDTH,
  PARTICIPANT_SEQ_BORDER_RADIUS,
  PARTICIPANT_SLOT_RADIUS,
  ROSTER_COLS_MAX,
  ROSTER_PANEL_BORDER_WIDTH,
  ROSTER_PANEL_MAX_WIDTH,
  ROSTER_PANEL_MIN_WIDTH,
  ROSTER_PANEL_PADDING,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * v0.6.3 (docs/v0.6.3.md §3): the roster's column count belongs to the puzzle.
 *
 * These are render-level assertions on the two things that change: the matrix
 * follows the column count instead of the container, and the panel's width
 * follows the matrix — while the slot keeps its size in both modes.
 */

const CHARACTER: Character = {
  id: 1,
  code: 'jade',
  name: '阿玉',
  gender: 'female',
  description: null,
  avatarPath: null,
  avatarUrl: null,
  avatarThumbUrl: null,
  bgColor: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** Six participants, the size the rest of the fixtures use. */
function slots(count = 6): Array<CharacterSlotEntry | null> {
  return Array.from({ length: count }, (_, index) =>
    index === 0 ? { characterId: 1, clue: '不在花丛旁' } : null,
  );
}

describe('ParticipantPanel — 参与者布局（v0.6.3 §3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(cols: number | null, count = 6): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={slots(count)}
          charactersById={new Map([[1, CHARACTER]])}
          cols={cols}
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

  const aside = (): HTMLElement =>
    container.querySelector('aside') as HTMLElement;
  const matrix = (): HTMLElement =>
    container.querySelector('[data-testid="roster-matrix"]') as HTMLElement;
  /** jsdom serialises `repeat()` into the raw attribute but will not parse it. */
  const columnCount = (): number => {
    const raw = matrix().getAttribute('style') ?? '';
    const match = /repeat\((\d+),/.exec(raw);
    return match ? Number(match[1]) : 0;
  };

  it('lays the roster out in the columns the puzzle asked for', () => {
    render(3);
    expect(columnCount()).toBe(3);
    // 3 fixed slots + 2 gaps + the padding + the aside's own 1px right border.
    // The border is part of the sum on purpose: the aside is `border-box`, so
    // without it the scroll container's content box is 1px narrower than the
    // matrix and the horizontal scrollbar is back (it was, at 3+ columns).
    expect(aside().style.width).toBe(
      `${3 * PARTICIPANT_MIN_WIDTH +
        2 * PARTICIPANT_CELL_GAP +
        ROSTER_PANEL_PADDING * 2 +
        ROSTER_PANEL_BORDER_WIDTH}px`,
    );
  });

  it('fits the widest column count the editor offers, without scrolling', () => {
    render(ROSTER_COLS_MAX);
    expect(columnCount()).toBe(ROSTER_COLS_MAX);
    // The panel is exactly as wide as its own matrix + border — the inner box
    // of the scroll container equals the matrix's `max-content` width, so there
    // is nothing to scroll and no scrollbar can appear.
    expect(aside().style.width).toBe(
      `${ROSTER_COLS_MAX * PARTICIPANT_MIN_WIDTH +
        (ROSTER_COLS_MAX - 1) * PARTICIPANT_CELL_GAP +
        ROSTER_PANEL_PADDING * 2 +
        ROSTER_PANEL_BORDER_WIDTH}px`,
    );
  });

  it('clamps a column count the roster cannot fill', () => {
    render(9, 6);
    expect(columnCount()).toBe(6);
  });

  it('keeps 自动 on the adaptive layout and the historical width', () => {
    render(null);
    // 6 participants → the golden ratio picks 2 columns, as it always did.
    expect(columnCount()).toBe(2);
    expect(aside().style.width).toBe(`${ROSTER_PANEL_MIN_WIDTH}px`);
  });

  it('caps only a column count the editor can no longer ask for', () => {
    // 24 columns with 24 participants — wider than the field's maximum, so the
    // panel stays at the cap and the matrix scrolls inside it.
    render(24, 24);
    expect(columnCount()).toBe(24);
    expect(aside().style.width).toBe(`${ROSTER_PANEL_MAX_WIDTH}px`);
  });

  it('rounds the sequence badge with the card, so its corner stays inside the frame', () => {
    render(3);
    const card = container.querySelector<HTMLElement>('[data-slot-index="0"]');
    const badge = container.querySelector<HTMLElement>('[data-testid="slot-seq-0"]');
    // The badge is flush in the card's top-left corner (inset 0, no top / left
    // edge of its own), so its top-left has to follow the card's rounded
    // frame — a square corner there pokes outside the slot. Both radii come
    // from the same constant.
    expect(card?.style.borderRadius).toBe(`${PARTICIPANT_SLOT_RADIUS}px`);
    expect(badge?.style.borderRadius).toBe(PARTICIPANT_SEQ_BORDER_RADIUS);
    expect(
      PARTICIPANT_SEQ_BORDER_RADIUS.startsWith(`${PARTICIPANT_SLOT_RADIUS}px`),
    ).toBe(true);
  });

  it('renders every slot exactly once, whatever the column count', () => {
    for (const cols of [1, 2, 3, 6]) {
      render(cols);
      const rendered = Array.from(
        container.querySelectorAll('[data-slot-index]'),
      ).map((node) => node.getAttribute('data-slot-index'));
      expect(rendered).toEqual(['0', '1', '2', '3', '4', '5']);
      // The sequence badges still read 1..6 in roster order.
      for (const index of [0, 5]) {
        expect(
          container.querySelector(`[data-testid="slot-seq-${index}"]`)?.textContent,
        ).toBe(String(index + 1));
      }
      act(() => root.unmount());
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
  });

  it('the slot keeps its size in both modes', () => {
    render(3);
    const fixed = container.querySelector<HTMLElement>('[data-slot-index="0"]');
    expect(fixed?.style.width).toBe(`${PARTICIPANT_MIN_WIDTH}px`);
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    render(null);
    const adaptive = container.querySelector<HTMLElement>('[data-slot-index="0"]');
    expect(adaptive?.style.width).toBe(`${PARTICIPANT_MIN_WIDTH}px`);
  });
});
