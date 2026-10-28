import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * v0.6.4 (docs/v0.6.4.md §2): the top-left badge shows the configured
 * 编号展示 when the participant has one, and the sequence number otherwise.
 *
 * The number is derived from the slot's position, so it is only ever the
 * fallback — the panel never writes it back into the entry, which is what
 * makes "拖动改变位置时序号会更新，但不覆盖映射" true by construction.
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
  color: null,
  displayName: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('ParticipantPanel — 编号展示（v0.6.4 §2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(slots: Array<CharacterSlotEntry | null>): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={slots}
          charactersById={new Map([[1, CHARACTER]])}
          cols={3}
          selectedSlotIndex={null}
          draggingIndex={null}
          onActivateClick={vi.fn()}
        />,
      );
    });
  }

  const badge = (index: number): string | null | undefined =>
    container.querySelector(`[data-testid="slot-seq-${index}"]`)?.textContent;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the sequence number for a participant without a configured text', () => {
    render([{ characterId: 1, clue: '' }, null, { characterId: 1, clue: '' }]);
    expect(badge(0)).toBe('1');
    expect(badge(2)).toBe('3');
  });

  it('shows the configured text instead of the number', () => {
    render([
      { characterId: 1, clue: '', displayNumber: '甲' },
      null,
      { characterId: 1, clue: '', displayNumber: 'K1' },
    ]);
    expect(badge(0)).toBe('甲');
    expect(badge(2)).toBe('K1');
  });

  it('treats a blank configured text as absent', () => {
    render([{ characterId: 1, clue: '', displayNumber: '  ' }, null, null]);
    expect(badge(0)).toBe('1');
  });

  it('keeps the configured text when the roster is rearranged — the number moves, the label stays', () => {
    // The same entry in a different slot: the badge still reads the label,
    // while an unconfigured neighbour reads its own sequence number.
    render([null, null, { characterId: 1, clue: '', displayNumber: '甲' }]);
    expect(badge(2)).toBe('甲');
    render([{ characterId: 1, clue: '', displayNumber: '甲' }, null, null]);
    expect(badge(0)).toBe('甲');
  });
});
