import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_PLACED_OPACITY } from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * SPEC-H14（docs/v0.4.2.md §1.3）+ OPT-H06（§6）。
 *
 * 淡化作用在**参与者框整体**（外框 + 头像 + 序号 + 名称 + 线索 + 提示词），所以
 * `opacity` 挂在卡片根节点上 —— 只留一处，避免父子叠加成 `0.45 × 0.45`。
 *
 * 头像区只有**一层圆**（主题色圆盘），缩略图不带圆环，无图角色直接显示首字
 * 而不是一个白色内圆。
 */

describe('ParticipantPanel — 渲染级断言（SPEC-H14）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: { placedSlotIndices?: Set<number> }): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={[{ characterId: 1 }, { characterId: 2 }]}
          charactersById={new Map()}
          selectedSlotIndex={null}
          draggingIndex={null}
          onActivateClick={vi.fn()}
          {...props}
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

  const card = (index: number): HTMLElement =>
    container.querySelector<HTMLElement>(`[data-slot-index="${index}"]`) as HTMLElement;

  it('dims the whole card of a placed participant and leaves the others alone', () => {
    render({ placedSlotIndices: new Set([0]) });
    expect(card(0).style.opacity).toBe(String(GAME_PLACED_OPACITY));
    expect(card(1).style.opacity).toBe('');
  });

  it('renders no opacity at all when the prop is omitted (editor / preview)', () => {
    render({});
    expect(card(0).style.opacity).toBe('');
    expect(card(1).style.opacity).toBe('');
  });

  it('the avatar span itself stays at full opacity — the dimming lives on the card', () => {
    render({ placedSlotIndices: new Set([0]) });
    const avatar = container.querySelector<HTMLElement>('[data-testid="slot-avatar-0"]');
    expect(avatar).not.toBeNull();
    expect(avatar?.style.opacity).toBe('');
    // OPT-H06: the theme-colour disc is the only circle — it clips the thumbnail,
    // so a character without artwork shows its first character, not a white disc.
    expect(avatar?.getAttribute('class') ?? '').toContain('rounded-full');
    expect(avatar?.getAttribute('class') ?? '').toContain('overflow-hidden');
  });

  it('keeps the card interactive — dimming must not disable the click surface', () => {
    render({ placedSlotIndices: new Set([0]) });
    const placed = card(0).getAttribute('class') ?? '';
    const plain = card(1).getAttribute('class') ?? '';
    expect(placed).not.toContain('pointer-events-none');
    expect(placed).not.toContain('grabbing');
    // Same cursor affordance as an unplaced card: the roster stays clickable.
    expect(placed).toContain('cursor-grab');
    expect(plain).toContain('cursor-grab');
  });
});
