import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LINKAGE_COLORS,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  type Character,
  type CharacterSlotEntry,
} from '@loredoku/shared';
import { ParticipantDrawer } from './ParticipantDrawer';

/**
 * v0.6.4 (docs/v0.6.4.md §2): the 编号展示 field in the 参与者信息 drawer.
 *
 * Render-level assertions on the three things that matter: the field is seeded
 * from the stored entry (and empty when there is none), and 保存 is the only
 * path that carries the text into the store — the same rule every other module
 * in this drawer follows.
 */

const CHARACTER: Character = {
  id: 8,
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

const SLOT: CharacterSlotEntry = {
  characterId: 8,
  themeColor: '#FFCC00',
  clue: '不在花丛旁',
  linkages: [],
};

// React 18 的 act 需要这个开关，否则 Radix 的 portal 一动就打印一条警告。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ParticipantDrawer — 编号展示（v0.6.4 §2）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let onSave: ReturnType<typeof vi.fn>;

  function render(slot: CharacterSlotEntry | null, slotIndex = 0): void {
    onSave = vi.fn();
    act(() => {
      root.render(
        <ParticipantDrawer
          open
          onClose={vi.fn()}
          slotIndex={slotIndex}
          slots={[slot, null]}
          character={CHARACTER}
          charactersById={new Map([[8, CHARACTER]])}
          placedItems={[]}
          regions={[]}
          gridSize={6}
          linkageColors={[...DEFAULT_LINKAGE_COLORS]}
          onSave={onSave}
        />,
      );
    });
  }

  const input = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>('[data-testid="display-number-input"]') as HTMLInputElement;

  /** Fires a save through the footer button, the only path into the store. */
  function save(): void {
    const button = Array.from(container.querySelectorAll('button')).find(
      (node) => node.textContent === '保存',
    );
    act(() => {
      button?.click();
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

  it('seeds the field from the stored entry', () => {
    render({ ...SLOT, displayNumber: '甲' });
    expect(input().value).toBe('甲');
  });

  it('starts empty — with the sequence number as the placeholder — when unconfigured', () => {
    render(SLOT);
    expect(input().value).toBe('');
    expect(input().getAttribute('placeholder')).toBe('序号 1');
  });

  it('carries the typed text into the save patch', () => {
    render(SLOT);
    act(() => {
      // React tracks the value setter; assign directly and dispatch input.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input(), 'K1');
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
    save();
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[1]).toMatchObject({ displayNumber: 'K1' });
  });

  it('carries a cleared field as an empty string — the store then drops it', () => {
    render({ ...SLOT, displayNumber: '甲' });
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )?.set;
      setter?.call(input(), '');
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
    save();
    expect(onSave.mock.calls[0]?.[1]).toMatchObject({ displayNumber: '' });
  });

  it('bounds the field to the shared maximum', () => {
    render(SLOT);
    expect(input().getAttribute('maxlength')).toBe(String(PARTICIPANT_DISPLAY_NUMBER_MAX));
  });

  it('leaves the field out of the empty state (no slot selected)', () => {
    render(null);
    expect(container.querySelector('[data-testid="display-number-input"]')).toBeNull();
  });
});
