import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParticipantPanel } from './ParticipantPanel';

/**
 * v0.7.11：名册的**选中态**与游戏页的「不要标题」。
 *
 * 选中的是「玩家接下来要操作的那一位」，与「预览激活」（指针路过）是两件事，
 * 却都会在主色上出现。v0.7.14 起两者靠**粗细**（3px 连续边 / 2px 单环）区分，
 * 不再靠「中间一圈纸色缝隙」—— 那条缝正是用户说的「中间不要有空白」；卡片底色
 * 换成**参与者自己的主题色**、点中的一刻带一次 180ms 的鼓起。
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
    headerLeading?: ReactNode;
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
          headerLeading={props.headerLeading}
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

  /**
   * 「参与者 n/n」那一行。带 `headerLeading` 的时候它的 `textContent` 里会多出
   * 按钮的字，靠文本查不稳（v0.7.13 起组件挂了 `data-testid`）。
   */
  const headerRow = (): HTMLElement =>
    container.querySelector<HTMLElement>('[data-testid="participant-header"]') as HTMLElement;

  it('draws one continuous primary frame on the selected card — no paper gap', () => {
    render({ selectedSlotIndex: 0 });
    const ring = card(0).style.boxShadow;
    // v0.7.14：中间那圈纸色缝隙去掉了，只剩主色。
    expect(ring).not.toContain('hsl(var(--background))');
    expect(ring).toContain('hsl(var(--primary))');
    // 描边与外面的 2px 同色相接（1px + 2px = 3px 一整条）。
    expect(card(0).getAttribute('class') ?? '').toContain('border-primary');
    expect(card(1).style.boxShadow).toBe('');
  });

  it('separates 选中 from 预览 — by thickness, not by a paper gap', () => {
    render({ activeSlotIndex: 0 });
    // 预览是 2px 单环，而且卡片自己的描边不上色（所以只有 2px 宽）。
    expect(card(0).style.boxShadow).toBe('0 0 0 2px hsl(var(--primary))');
    expect(card(0).getAttribute('class') ?? '').not.toContain('border-primary');
  });

  it('tints the selected card and pops once when it becomes selected', () => {
    render({ selectedSlotIndex: 0 });
    const className = card(0).getAttribute('class') ?? '';
    expect(className).toContain('roster-select-pop');
    /*
     * v0.7.14：底色不再是主色的 10%，而是那张卡片**主人自己的**颜色 —— 由
     * `.participant-tint` 那层铺开（见下面的用例）。选中与悬停都算「点亮」，
     * 开关是根节点上的 `data-tint`。
     */
    expect(card(0).getAttribute('data-tint')).toBe('on');
    expect(card(1).getAttribute('data-tint')).toBeNull();
    expect(card(1).getAttribute('class') ?? '').not.toContain('roster-select-pop');
  });

  /*
   * v0.7.14：用户的原话是「不要两层高亮线」，后一句是「点击选中高亮时，外出蓝色
   * 高亮线和内部中间不要有空白」。
   *
   * 先前的做法是把卡片自己的 1px 描边收成透明，让外面 4px 处那道 2px 环单独说话；
   * 代价是卡片与外环之间留了 2px 纸色，读作「框浮在外面」。现在描边改回主色：
   * 1px 描边 + 2px 外扩同色相接，是一条 3px 的边，中间不留缝，也不是两条线。
   */
  it('选中只有一条边 —— 描边与外环同色相接，没有空白', () => {
    render({ selectedSlotIndex: 0 });
    const className = card(0).getAttribute('class') ?? '';
    expect(className).toContain('border-primary');
    expect(className).not.toContain('border-transparent');
    // 外环只剩 2px 主色 + 一层向下的投影；纸色那层已经删掉。
    expect(card(0).style.boxShadow).toContain('hsl(var(--primary))');
    expect(card(0).style.boxShadow).not.toContain('hsl(var(--background))');
  });

  /*
   * v0.7.14：那层颜色是**参与者自己的主题色**，从头像那枚圆往外长。
   *
   * 圆心必须落在头像正中（8px 内边距 + 94px 头像的一半 = 55px），否则颜色会从
   * 偏上的位置冒出来，「这层色属于这枚头像」就不成立了。白色主题退回主色：
   * 白上加白等于什么都没发生。
   */
  it('铺开的是参与者本人的主题色，白色退回主色', () => {
    act(() => {
      root.render(
        <ParticipantPanel
          slots={[
            { characterId: 1, themeColor: '#7E9A5E' },
            { characterId: 2, themeColor: '#FFFFFF' },
          ]}
          charactersById={new Map()}
          selectedSlotIndex={0}
          draggingIndex={null}
          readOnly
          onActivateClick={vi.fn()}
        />,
      );
    });
    const tinted = container.querySelector<HTMLElement>('[data-testid="slot-tint-0"]');
    const white = container.querySelector<HTMLElement>('[data-testid="slot-tint-1"]');
    expect(tinted?.style.getPropertyValue('--tint-color')).toBe('rgba(126, 154, 94, 0.16)');
    expect(white?.style.getPropertyValue('--tint-color')).toBe('hsl(var(--primary) / 0.16)');
    expect(tinted?.style.getPropertyValue('--tint-y')).toBe('55px');
  });

  /**
   * v0.7.14：主题色那层是**底色**，不是盖在卡片上的一层膜。
   *
   * 绝对定位的兄弟在绘制顺序里排在普通流内容之上 —— 少了 `isolate` + `z-index:-1`，
   * 那层颜色会糊在头像上（用户：「主题色铺开不要覆盖头像」）。这条钉的是结构：
   * 卡片建了 stacking context，色层是第一个子节点（于是在头像之前画，又被负层级
   * 压到内容下面）。CSS 那半在 jsdom 里算不出来，只能钉到这个程度。
   */
  it('主题色层是底色 —— 卡片建 stacking context，色层排在最前', () => {
    render({ selectedSlotIndex: 0 });
    const root = card(0);
    expect(root.className).toContain('isolate');
    const tint = root.querySelector('[data-testid="slot-tint-0"]');
    expect(tint).not.toBeNull();
    // 第一个子节点；头像、名字、线索都排在它后面。
    expect(root.firstElementChild).toBe(tint);
    // 头像本身是那枚不透明的圆，颜色仍是本人主题色。
    const avatar = root.querySelector<HTMLElement>('[data-testid="slot-avatar-0"]');
    expect(avatar?.style.backgroundColor).toBe('rgb(255, 255, 255)');
  });

  /**
   * v0.7.12（`/impeccable overdrive`）：选中要在一眼之内认出来。
   *
   * 与预览的区分只有粗细，扫视时仍要停下来数 —— 所以又加了
   * 两条**不同维度**的线索：卡片被抬起 2px（`translate`），序号徽标反色。
   * 徽标本来就是左上角最显眼的那一笔，反色之后「手上是哪位」不需要再判断。
   */
  /**
   * v0.7.14：徽标填色时，它和卡片描边必须合成**一条边**。
   *
   * 徽标贴在 padding box 的角上、用内圆角（5px），卡片描边是外圆角（6px）——
   * 两段弧同心紧挨着，各自抗锯齿，交界那一像素两边都只盖一半，纸白就漏成一道
   * 细弧（用户：「高亮环和序号间有白色区」）。1px 同色外扩把徽标的弧推到外弧上，
   * 抗锯齿只剩轮廓那一条。
   *
   * 只在填色时加：纸白徽标加这一层会盖住卡片自己的描边。
   */
  it('填色徽标加 1px 同色外扩，与描边合成一条边', () => {
    render({ selectedSlotIndex: 0 });
    const badge = container.querySelector<HTMLElement>('[data-testid="slot-seq-0"]');
    expect(badge?.style.boxShadow).toBe('0 0 0 1px hsl(var(--primary))');

    act(() => root.render(
      <ParticipantPanel
        slots={[{ characterId: 1 }]}
        charactersById={new Map()}
        selectedSlotIndex={null}
        activeSlotIndex={0}
        draggingIndex={null}
        readOnly
        onActivateClick={vi.fn()}
      />,
    ));
    const resting = container.querySelector<HTMLElement>('[data-testid="slot-seq-0"]');
    expect(resting?.style.boxShadow).toBe('');
  });

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

  /*
   * v0.7.13：这行标题的颜色曾经写死成 `#1F2937`（为纸底挑的 slate-800）——
   * 夜间落在夜墨 `28 12% 9%` 上只剩 1.22:1，等于看不见。
   *
   * 断言的是「跟着主题走」这件事，不是某个色值：色值在 `index.css` 的
   * `--foreground` 里，两套主题各一份。写死 inline `color` 会让
   * `text-foreground` 静默失效（内联优先），所以那一半也要一起断言。
   */
  it('标题的颜色跟着主题走，不写死', () => {
    render({});
    const header = headerRow();
    expect(header).toBeTruthy();
    expect(header?.className).toContain('text-foreground');
    expect(header?.style.color).toBe('');
  });

  /*
   * v0.7.13：谜题编辑页把「角色」列整列收掉之后，「展开角色列表」挂在这一行的
   * 左侧。它必须是**绝对定位**的：用 flex 分一格，标题就只在「面板宽 − 28px」
   * 里居中，往右偏 14px —— 这一行只有三个字加一个分数，偏一点点都看得出来。
   */
  it('headerLeading 挂在标题行左侧，标题仍居中', () => {
    render({ headerLeading: <button aria-label="展开角色列表">›</button> });
    const row = headerRow();
    const lead = row.querySelector('[aria-label="展开角色列表"]');
    expect(lead).not.toBeNull();
    // 按钮的容器是绝对定位的那一层，不参与标题的排布。
    expect(lead?.parentElement?.className).toContain('absolute');
    expect(row.className).toContain('relative');
    expect(row.className).toContain('text-center');
  });

  it('不传 headerLeading 时，标题行里没有多余的按钮', () => {
    render({});
    expect(headerRow().querySelector('[aria-label]')).toBeNull();
  });
});
