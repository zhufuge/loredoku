import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VerdictMark } from './VerdictMark';

/**
 * v0.11.3（docs/v0.11.3.md §5）—— iOS 上「定案」字变大、印章右偏。
 *
 * 根因是外层用 CSS `zoom` 承载比例。iOS Safari 对这个属性 unreliable：
 * 比例没生效，而 `translate` 那点位移仍是绝对像素 —— 于是字按 1 倍画出来
 * （相对已经缩小的棋盘就显得「变大」），印被那点位移推到右边。
 *
 * 现在比例落在**字号**上，块内所有尺寸都是 em。这里钉三件事：
 * 1. 比例真的作用到字号上（`fontSize` 随 scale 变）；
 * 2. 不再出现 `zoom`（这是 iOS 上失效的那条路径）；
 * 3. 大字档的印**不参与横向排版**（绝对定位），「定案」才能真的居中。
 *
 * 不断言具体字号数字之外的排版细节（尺寸 / 颜色不算行为），只断言
 * 「比例生效的方向」「失效那条路径没被用回来」「印在不在行内」。
 */
describe('VerdictMark — 比例落在字号上（v0.11.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(scale: number, large = true): HTMLElement {
    act(() => {
      root.render(
        <VerdictMark
          stampUrl="/stamp.webp"
          large={large}
          scale={scale}
          stampOffset={{ x: 8, y: 40 }}
        />,
      );
    });
    const mark = container.querySelector<HTMLElement>('[data-testid="verdict-mark"]');
    if (!mark) throw new Error('verdict-mark 没渲染出来');
    return mark;
  }

  function stamp(): HTMLImageElement {
    const node = container.querySelector<HTMLImageElement>('[data-testid="verdict-stamp"]');
    if (!node) throw new Error('印章没渲染出来');
    return node;
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

  /** iOS 上失效的那条路径有没有被用回来 —— jsdom 认不出 `zoom`，只查声明里有没有。 */
  function hasZoom(mark: HTMLElement): boolean {
    return /zoom\s*:/i.test(mark.getAttribute('style') ?? '');
  }

  it('比例 1 时用基准字号，且不掺 zoom', () => {
    const mark = mount(1);
    expect(hasZoom(mark)).toBe(false);
    expect(Number.parseFloat(mark.style.fontSize)).toBeGreaterThan(0);
  });

  it('缩小比例 → 字号跟着变小，而不是靠 zoom 整体缩放', () => {
    const full = Number.parseFloat(mount(1).style.fontSize);
    const halfMark = mount(0.5);
    const half = Number.parseFloat(halfMark.style.fontSize);

    expect(hasZoom(halfMark)).toBe(false);
    expect(half).toBeLessThan(full);
    // 比例是线性落在字号上的：0.5 倍就是一半（浮点留一点余量）。
    expect(half).toBeCloseTo(full / 2, 5);
  });

  it('异常比例（0 / NaN）退回 1，不让整块消失', () => {
    for (const bad of [0, Number.NaN]) {
      const mark = mount(bad);
      expect(Number.parseFloat(mark.style.fontSize)).toBeGreaterThan(0);
    }
  });

  /*
   * v0.11.3（补）：用户「游戏内『定案』两字没有居中」。
   *
   * 大字档的印原先在行内（`-ml-[0.55em]`），行宽因此是「字列 + 印 − 叠压」，
   * `justify-center` 居中的是这一整行 —— 字被推到中心右边。修法是让印脱离
   * 文档流（`absolute left-full`）挂在字列右缘外，行里只剩字列。
   */
  it('大字档的印脱离文档流 —— 否则居中对象变成「字列 + 印」', () => {
    mount(1);
    const image = stamp();
    // 定位走的是 Tailwind 类（`absolute` / `relative`），不是内联 style。
    expect(image.className).toContain('absolute');
    // 挂在字列右缘外：左缘贴着字列右缘，再往回咬一点点。
    expect(image.className).toContain('left-full');
    expect(image.style.marginLeft).toBe('');
  });

  it('大字档的印宽按 em 给 —— 字号已经是比例，不必再乘一次', () => {
    mount(1);
    const full = stamp();
    mount(0.5);
    const half = stamp();

    // em 是相对容器字号求值的，两档写的是同一个数；尺寸靠字号缩。
    expect(full.style.width).toBe('1.1em');
    expect(half.style.width).toBe('1.1em');
    expect(full.style.maxWidth).toBe('none');
  });

  it('卡片档仍走行内叠压（它要撑满封面），边长按 rem 乘比例', () => {
    mount(1, false);
    const fullClass = stamp().className;
    // React 复用同一个 `<img>` 节点，所以取字符串快照，别留元素引用。
    const fullWidth = stamp().style.width;
    const fullHeight = stamp().style.height;

    expect(fullClass).toContain('-ml-[0.55em]');
    expect(fullClass).not.toContain('left-full');

    mount(0.5, false);
    const halfWidth = stamp().style.width;
    const halfHeight = stamp().style.height;

    expect(Number.parseFloat(halfWidth)).toBeCloseTo(Number.parseFloat(fullWidth) / 2, 5);
    expect(Number.parseFloat(halfHeight)).toBeCloseTo(Number.parseFloat(fullHeight) / 2, 5);
  });
});
