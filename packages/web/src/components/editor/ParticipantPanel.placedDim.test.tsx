import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_PLACED_OPACITY } from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * SPEC-H14（docs/v0.4.2.md §1.3）+ OPT-H06（§6）。
 *
 * v0.4.1（SPEC-G05）把淡化挂在**头像 `span`** 上；v0.4.2 要求「参与者框整体变淡：
 * 外框 + 头像 + 序号 + 名称 + 线索 + 提示词」。实现上就是把 `opacity` 从子节点
 * **上提到卡片根节点**——只留一处，避免父子叠加成 `0.45 × 0.45`。
 *
 * 另一半是 OPT-H06：头像区只留**一层圆**（主题色圆盘），缩略图不再自带圆环，
 * 无图角色直接显示首字而不是一个白色内圆。
 */

const source =
  ((import.meta.glob('./ParticipantPanel.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./ParticipantPanel.tsx'] ?? '').replace(/\r\n/g, '\n');

describe('ParticipantPanel — 整框淡化（SPEC-H14 §1.3）', () => {
  it('accepts the placed slot indices as an optional prop', () => {
    expect(source).toContain('placedSlotIndices?: Set<number>;');
    expect(source).toContain('placedSlotIndices,');
  });

  it('derives "placed" from the index the board reports', () => {
    expect(source).toContain('const isPlaced = placedSlotIndices?.has(index) ?? false;');
  });

  it('puts the opacity on the card root, using the shared constant', () => {
    expect(source).toContain('opacity: isPlaced ? GAME_PLACED_OPACITY : undefined,');
    // The root is the node carrying `data-slot-index`.
    const rootIndex = source.indexOf('data-slot-index={index}');
    const opacityIndex = source.indexOf('opacity: isPlaced ? GAME_PLACED_OPACITY : undefined,');
    expect(rootIndex).toBeGreaterThan(-1);
    expect(opacityIndex).toBeGreaterThan(rootIndex);
  });

  it('renders the dimming exactly once — no child multiplies it', () => {
    expect(source.split('GAME_PLACED_OPACITY').length - 1).toBe(2); // import + usage
    expect(source.split('opacity: isPlaced').length - 1).toBe(1);
  });

  it('the avatar span no longer carries the opacity (OPT-H06 keeps it a plain disc)', () => {
    const avatarOpen = source.indexOf('data-testid={`slot-avatar-${index}`}');
    const avatarClose = source.indexOf('</span>', avatarOpen);
    expect(avatarOpen).toBeGreaterThan(-1);
    const avatarBlock = source.slice(avatarOpen, avatarClose);
    expect(avatarBlock).not.toContain('opacity');
    // OPT-H06: one circle only — the theme-colour disc clips, the thumbnail does not.
    expect(avatarBlock).toContain('overflow-hidden rounded-full');
    expect(avatarBlock).toContain('shape="plain"');
    expect(avatarBlock).toContain('bordered={false}');
  });

  it('defaults to no dimming for callers that do not pass the prop (editor / preview)', () => {
    expect(source).toContain('placedSlotIndices?: Set<number>;');
    expect(source).toContain('?? false;');
  });
});

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
