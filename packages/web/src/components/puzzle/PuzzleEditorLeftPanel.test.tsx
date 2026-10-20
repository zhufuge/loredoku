import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import { PuzzleEditorLeftPanel } from './PuzzleEditorLeftPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * v0.6.3 fix: a full roster collapses the 角色 panel **by default** — every
 * 加入 button is disabled at that point, so the list has nothing left to offer
 * and the canvas deserves the width. It is a default, not a lock: the first
 * manual 展开 / 收起 takes over for the rest of the session.
 */

const CHARACTERS: Character[] = [
  {
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
  },
  {
    id: 2,
    code: 'cloud',
    name: '云郎',
    gender: 'male',
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
  },
];

/** A two-slot roster; `filled` counts how many of them are taken. */
function roster(filled: number): Array<CharacterSlotEntry | null> {
  return Array.from({ length: 2 }, (_, index) =>
    index < filled ? { characterId: index + 1, clue: '' } : null,
  );
}

describe('PuzzleEditorLeftPanel — 参与者满时默认收起（v0.6.3 fix）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(slots: Array<CharacterSlotEntry | null>): void {
    act(() => {
      root.render(
        <PuzzleEditorLeftPanel
          characters={CHARACTERS}
          charactersLoading={false}
          charactersError={false}
          characterSlots={slots}
          selectedCharacterId={null}
          onAssignSlot={vi.fn()}
          onSelectCharacter={vi.fn()}
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

  const expandButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="展开角色列表"]');
  const collapseButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="收起角色列表"]');

  it('stays expanded while the roster still has room', () => {
    render(roster(1));
    expect(collapseButton()).not.toBeNull();
    expect(expandButton()).toBeNull();
  });

  it('collapses by default once every slot is taken', () => {
    render(roster(2));
    expect(expandButton()).not.toBeNull();
    expect(collapseButton()).toBeNull();
  });

  it('collapses when the last slot is filled mid-session', () => {
    render(roster(1));
    expect(collapseButton()).not.toBeNull();
    render(roster(2));
    expect(expandButton()).not.toBeNull();
  });

  it('leaves the state alone once the user has taken over', () => {
    render(roster(2));
    expect(expandButton()).not.toBeNull();
    act(() => {
      expandButton()?.click();
    });
    expect(collapseButton()).not.toBeNull();
    // Empty a slot and fill it again — the manual 展开 stands.
    render(roster(1));
    render(roster(2));
    expect(collapseButton()).not.toBeNull();
    expect(expandButton()).toBeNull();
  });

  it('keeps a manual collapse across roster changes', () => {
    render(roster(1));
    act(() => {
      collapseButton()?.click();
    });
    expect(expandButton()).not.toBeNull();
    render(roster(0));
    expect(expandButton()).not.toBeNull();
  });
});
