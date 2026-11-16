import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HIGHLIGHT_BLUE, type Character, type CharacterSlotEntry } from '@loredoku/shared';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * v0.10.11（m20424）：被联动指着的参与者，反馈从「头像放大一档」换成「一层淡金
 * 从那道 2px 金框向头像蔓延」。
 *
 * 页面那一层把 `resolveHighlight` 解析出的 `{ slotIndex, color }` 收成两个 prop
 * 传进来（`highlightedSlots` / `highlightColors`），这里只钉**面板拿到这两个 prop
 * 之后画什么**：金框还在、淡金那层的开关 `data-link-tint` 与它的颜色（`--link-color`
 * 由联动色解析，透明度与主题色同档 0.16）、以及头像不再放大。蔓延的几何（圆心、
 * 孔的半径）是 CSS，在 jsdom 里没有布局可读，按「界面外观不写断言」交给真浏览器。
 */

const CHARACTERS: Character[] = [
  {
    id: 11,
    code: 'a',
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
    id: 12,
    code: 'b',
    name: '阿璧',
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
];

const SLOTS: Array<CharacterSlotEntry | null> = [
  { characterId: 11, themeColor: '#FFCC00', clue: '不在花丛旁' },
  { characterId: 12, themeColor: '#AA0000', clue: '不在水榭旁' },
];

// React 18 的 act 需要这个开关，否则每次由 effect 触发的更新都会打印一条警告。
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('ParticipantPanel — 联动指向的淡金（v0.10.11）', () => {
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

  function render(
    highlightedSlots: Set<number>,
    highlightColors: Map<number, string>,
  ): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={SLOTS}
          charactersById={new Map(CHARACTERS.map((character) => [character.id, character]))}
          selectedSlotIndex={null}
          draggingIndex={null}
          highlightedSlots={highlightedSlots}
          highlightColors={highlightColors}
        />,
      );
    });
  }

  function card(index: number): HTMLElement {
    const node = container.querySelector<HTMLElement>(`[data-slot-index="${index}"]`);
    if (!node) throw new Error(`名册第 ${index} 张卡没渲染出来`);
    return node;
  }

  it('被指着的卡挂上 data-link-tint，没被指着的卡不挂', () => {
    render(new Set([1]), new Map([[1, HIGHLIGHT_BLUE]]));

    expect(card(1).getAttribute('data-link-tint')).toBe('on');
    expect(card(0).getAttribute('data-link-tint')).toBeNull();
    // 触碰态是另一条轴：这里既没悬停也没选中，两卡都不该亮。
    expect(card(0).getAttribute('data-tint')).toBeNull();
    expect(card(1).getAttribute('data-tint')).toBeNull();
  });

  it('那道 2px 金框还在，颜色跟着联动色走', () => {
    render(new Set([1]), new Map([[1, '#AA0000']]));

    expect(card(1).style.boxShadow).toContain('2px #AA0000');
  });

  it('淡金那层的颜色由联动色解析，透明度与主题色同档', () => {
    render(new Set([1]), new Map([[1, '#AA0000']]));

    const tint = card(1).querySelector<HTMLElement>('.participant-link-tint');
    expect(tint).not.toBeNull();
    expect(tint?.style.getPropertyValue('--link-color')).toBe('rgba(170, 0, 0, 0.16)');
    // 圆心与主题色那层同一枚：金色蔓延的终点必须落在头像边缘。
    expect(tint?.style.getPropertyValue('--tint-y')).toBe('55px');
  });

  it('联动色缺省时淡金落回联动蓝，而不是这张卡自己的主题色', () => {
    render(new Set([1]), new Map());

    const tint = card(1).querySelector<HTMLElement>('.participant-link-tint');
    expect(tint?.style.getPropertyValue('--link-color')).toBe('rgba(144, 202, 249, 0.16)');
  });

  it('头像不再放大：整张面板里找不到 scale(1.08)', () => {
    render(new Set([1]), new Map([[1, HIGHLIGHT_BLUE]]));

    // v0.10.11 之前被指着的头像是 `transform: scale(1.08)`，读成「这位自己
    // 要干嘛」；联动说的是「别人指着他」，脸自己不动。
    expect(container.querySelector('[style*="scale(1.08)"]')).toBeNull();
  });

  it('撤掉高亮后，淡金仍是上一次的联动色（退场不能换成缺省蓝）', () => {
    render(new Set([1]), new Map([[1, '#AA0000']]));

    const tint = () => card(1).querySelector<HTMLElement>('.participant-link-tint');
    expect(tint()?.style.getPropertyValue('--link-color')).toBe('rgba(170, 0, 0, 0.16)');

    // `--link-hole` 撤回要跑完整条退场动画，这一帧 `highlightColors` 已经空了：
    // 没有记忆的话颜色立刻翻回缺省蓝，退场就变了色（v0.10.12）。
    render(new Set(), new Map());

    expect(card(1).getAttribute('data-link-tint')).toBeNull();
    expect(tint()?.style.getPropertyValue('--link-color')).toBe('rgba(170, 0, 0, 0.16)');

    //下一次换一支联动色，记忆跟着更新，不是永远钉在第一支上。
    render(new Set([1]), new Map([[1, '#F1AB44']]));

    expect(tint()?.style.getPropertyValue('--link-color')).toBe('rgba(241, 171, 68, 0.16)');
  });

  it('从没被指过的卡，淡金仍是缺省蓝', () => {
    render(new Set([0]), new Map([[0, '#AA0000']]));

    const tint = () => card(1).querySelector<HTMLElement>('.participant-link-tint');
    expect(tint()?.style.getPropertyValue('--link-color')).toBe('rgba(144, 202, 249, 0.16)');
  });
});
