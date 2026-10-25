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
    bgColor: null,
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
    bgColor: null,
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
          charactersRefreshing={false}
          onRefreshCharacters={vi.fn()}
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

/**
 * v0.7.7: 角色面板头部的刷新按钮。角色列表是共享查询，角色页刚加过角色时
 * 不用整页重载（重载会丢撤销栈与视口）。
 *
 * 收起态没有按钮是有意的：40px 细条放不下第二个 28px 按钮，而细条出现的时机
 * （参与者已满）本来也没法再加入角色。
 */
describe('PuzzleEditorLeftPanel — 刷新按钮（v0.7.7）', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRefreshCharacters = vi.fn();

  function render(slots: Array<CharacterSlotEntry | null>, refreshing = false): void {
    act(() => {
      root.render(
        <PuzzleEditorLeftPanel
          characters={CHARACTERS}
          charactersLoading={false}
          charactersError={false}
          charactersRefreshing={refreshing}
          onRefreshCharacters={onRefreshCharacters}
          characterSlots={slots}
          selectedCharacterId={null}
          onAssignSlot={vi.fn()}
          onSelectCharacter={vi.fn()}
        />,
      );
    });
  }

  const refreshButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="刷新角色"]');

  beforeEach(() => {
    onRefreshCharacters.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('sits next to 收起 and calls back on click', () => {
    render(roster(1));
    const button = refreshButton();
    expect(button).not.toBeNull();
    act(() => button?.click());
    expect(onRefreshCharacters).toHaveBeenCalledTimes(1);
  });

  it('is not rendered in the collapsed rail', () => {
    render(roster(2));
    expect(refreshButton()).toBeNull();
  });

  it('spins and blocks a second click while a fetch is in flight', () => {
    render(roster(1), true);
    const button = refreshButton();
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });
});
