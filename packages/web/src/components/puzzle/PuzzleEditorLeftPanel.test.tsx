import { act, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, CharacterSlotEntry } from '@loredoku/shared';
import {
  PuzzleEditorLeftPanel,
  RosterExpandButton,
  type PuzzleEditorLeftPanelHandle,
} from './PuzzleEditorLeftPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * v0.6.3 fix: a full roster collapses the 角色 panel **by default** — every
 * 加入 button is disabled at that point, so the list has nothing left to offer
 * and the canvas deserves the width. It is a default, not a lock: the first
 * manual 展开 / 收起 takes over for the rest of the session.
 *
 * v0.7.13: 收起 = **整列不渲染**。原来那条 40px 的竖排细条（一个箭头 + 竖排
 * 「角色」）被删掉了，箭头搬到参与者面板的标题行上。所以这一组用例里
 * 「是否收起」的观察点从「细条在不在」换成了「容器里有没有 `aside`」，
 * 展开动作也从「点细条里的箭头」换成了 `ref.expand()`。
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
    color: null,
    displayName: null,
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
    color: null,
    displayName: null,
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
  let panelRef: { current: PuzzleEditorLeftPanelHandle | null };
  let onCollapsedChange: ReturnType<typeof vi.fn>;

  function render(slots: Array<CharacterSlotEntry | null>): void {
    act(() => {
      root.render(
        <PuzzleEditorLeftPanel
          ref={panelRef}
          onCollapsedChange={onCollapsedChange}
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
    panelRef = createRef<PuzzleEditorLeftPanelHandle>();
    onCollapsedChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const aside = (): HTMLElement | null => container.querySelector('aside');
  const collapseButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="收起角色列表"]');

  it('stays expanded while the roster still has room', () => {
    render(roster(1));
    expect(aside()).not.toBeNull();
    expect(collapseButton()).not.toBeNull();
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
  });

  it('collapses by default once every slot is taken', () => {
    render(roster(2));
    // v0.7.13: 整列不渲染 —— 不是「留一条细条」，是这块地方整个还给画布。
    expect(aside()).toBeNull();
    // 页面靠这个回调决定要不要在参与者标题行上挂那颗箭头。
    expect(onCollapsedChange).toHaveBeenLastCalledWith(true);
  });

  it('collapses when the last slot is filled mid-session', () => {
    render(roster(1));
    expect(aside()).not.toBeNull();
    render(roster(2));
    expect(aside()).toBeNull();
  });

  it('leaves the state alone once the user has taken over', () => {
    render(roster(2));
    expect(aside()).toBeNull();
    // v0.7.13: 箭头长在参与者标题行上，通过 ref 叫回来（与点它等价）。
    act(() => {
      panelRef.current?.expand();
    });
    expect(collapseButton()).not.toBeNull();
    expect(onCollapsedChange).toHaveBeenLastCalledWith(false);
    // Empty a slot and fill it again — the manual 展开 stands.
    render(roster(1));
    render(roster(2));
    expect(collapseButton()).not.toBeNull();
    expect(aside()).not.toBeNull();
  });

  it('keeps a manual collapse across roster changes', () => {
    render(roster(1));
    act(() => {
      collapseButton()?.click();
    });
    expect(aside()).toBeNull();
    render(roster(0));
    expect(aside()).toBeNull();
  });
});

/**
 * v0.7.13：收起之后那颗箭头已经不在这个组件里了，它由参与者面板的标题行渲染。
 * 这里只验它自己：标签、折叠语义、点击回传。
 */
describe('RosterExpandButton（v0.7.13）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('announces 「展开角色列表」 and calls back', () => {
    const onClick = vi.fn();
    act(() => {
      root.render(<RosterExpandButton onClick={onClick} />);
    });
    const button = container.querySelector<HTMLButtonElement>('button');
    expect(button?.getAttribute('aria-label')).toBe('展开角色列表');
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    act(() => button?.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

/**
 * v0.7.7: 角色面板头部的刷新按钮。角色列表是共享查询，角色页刚加过角色时
 * 不用整页重载（重载会丢撤销栈与视口）。
 *
 * 收起后整个面板不渲染，刷新按钮自然也不在 —— 而收起出现的时机（参与者已满）
 * 本来也没法再加入角色。
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

  it('is gone with the whole column once the panel collapses', () => {
    render(roster(2));
    // v0.7.13: 不是「按钮藏起来」，是这一列根本不渲染。
    expect(container.firstElementChild).toBeNull();
  });

  it('spins and blocks a second click while a fetch is in flight', () => {
    render(roster(1), true);
    const button = refreshButton();
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });
});
