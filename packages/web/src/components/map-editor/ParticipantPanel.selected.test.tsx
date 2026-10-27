import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * v0.7.11：名册的**选中态**与游戏页的「不要标题」。
 *
 * 选中的是「玩家接下来要操作的那一位」，与「预览激活」（指针路过）是两件事，
 * 却都会在主色上出现，所以差别不能只靠颜色深浅 —— 选中多一圈 2px 纸色缝隙
 * （双环），并且卡片底色转成主色的 10%，点中的一刻还带一次 180ms 的鼓起。
 *
 * 游戏页还会传 `hideHeader`：那一行「参与者 5/5」是编辑器的语法（这块面板是
 * 「参与者」这个资源本身），玩家端名册头上已经有「游戏名 + 尺寸」了。
 */

describe('ParticipantPanel — 选中态与隐藏标题（v0.7.11）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: {
    selectedSlotIndex?: number | null;
    activeSlotIndex?: number | null;
    hideHeader?: boolean;
    highlightedSlots?: Set<number>;
  }): void {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={[{ characterId: 1 }, { characterId: 2 }]}
          charactersById={new Map()}
          selectedSlotIndex={props.selectedSlotIndex ?? null}
          draggingIndex={null}
          activeSlotIndex={props.activeSlotIndex ?? null}
          highlightedSlots={props.highlightedSlots}
          hideHeader={props.hideHeader}
          readOnly
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

  const card = (index: number): HTMLElement =>
    container.querySelector<HTMLElement>(`[data-slot-index="${index}"]`) as HTMLElement;

  it('draws a double ring (paper gap + primary) on the selected card', () => {
    render({ selectedSlotIndex: 0 });
    const ring = card(0).style.boxShadow;
    expect(ring).toContain('hsl(var(--background))');
    expect(ring).toContain('hsl(var(--primary))');
    expect(card(1).style.boxShadow).toBe('');
  });

  it('separates 选中 from 预览 — the preview keeps the single 2px ring', () => {
    render({ activeSlotIndex: 0 });
    // 预览只有一圈，且没有那圈纸色缝隙。
    expect(card(0).style.boxShadow).toBe('0 0 0 2px hsl(var(--primary))');
  });

  it('tints the selected card and pops once when it becomes selected', () => {
    render({ selectedSlotIndex: 0 });
    const className = card(0).getAttribute('class') ?? '';
    expect(className).toContain('roster-select-pop');
    expect(className).toContain('bg-primary/10');
    expect(card(1).getAttribute('class') ?? '').not.toContain('roster-select-pop');
  });

  /**
   * v0.7.12（`/impeccable overdrive`）：选中要在一眼之内认出来。
   *
   * 双环与预览的区分只有「多一圈纸色缝隙」，扫视时仍要停下来数 —— 所以又加了
   * 两条**不同维度**的线索：卡片被抬起 2px（`translate`），序号徽标反色。
   * 徽标本来就是左上角最显眼的那一笔，反色之后「手上是哪位」不需要再判断。
   */
  it('lifts the selected card and inverts its sequence badge', () => {
    render({ selectedSlotIndex: 0 });

    expect(card(0).style.translate).toBe('0 -2px');
    expect(card(1).style.translate).toBe('');

    // 第三层阴影是**投影**（向下 14px / 负 spread），不是又一道环。
    expect(card(0).style.boxShadow).toContain('14px 22px -16px');

    const badge = container.querySelector<HTMLElement>('[data-testid="slot-seq-0"]');
    const other = container.querySelector<HTMLElement>('[data-testid="slot-seq-1"]');
    expect(badge?.getAttribute('style')).toContain('hsl(var(--primary))');
    expect(badge?.getAttribute('style')).toContain('hsl(var(--primary-foreground))');
    // 未选中的徽标保持原来的纸白底。
    expect(other?.getAttribute('style')).toContain('rgba(255, 255, 255, 0.85)');
  });

  /**
   * v0.7.12：把已经落子的参与者重新拿在手上（游戏页要给他搬家）时，卡片不该
   * 还是淡的 —— 淡掉的正是此刻最该看清的那一格。
   */
  it('keeps a placed-but-selected card at full strength', () => {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={[{ characterId: 1 }, { characterId: 2 }]}
          charactersById={new Map()}
          selectedSlotIndex={0}
          draggingIndex={null}
          readOnly
          placedSlotIndices={new Set([0, 1])}
        />,
      );
    });
    expect(card(0).style.opacity).toBe('');
  });

  it('renders no 「参与者 n/n」 header when hideHeader is set', () => {
    render({ hideHeader: true });
    expect(container.textContent ?? '').not.toContain('参与者 2/2');
  });

  it('still renders the header for the editor and the work preview', () => {
    render({});
    expect(container.textContent ?? '').toContain('参与者 2/2');
  });
});
