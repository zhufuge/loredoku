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
 * 现在比例落在**字号**上，块内所有尺寸都是 em。这里钉两件事：
 * 1. 比例真的作用到字号上（`fontSize` 随 scale 变）；
 * 2. 不再出现 `zoom`（这是 iOS 上失效的那条路径）。
 *
 * 不断言具体 rem 数字之外的排版细节（尺寸 / 颜色不算行为），只断言
 * 「比例生效的方向」与「失效那条路径没被用回来」。
 */
describe('VerdictMark — 比例落在字号上（v0.11.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function mount(scale: number): HTMLElement {
    act(() => {
      root.render(
        <VerdictMark stampUrl="/stamp.webp" large scale={scale} stampOffset={{ x: 8, y: 40 }} />,
      );
    });
    const mark = container.querySelector<HTMLElement>('[data-testid="verdict-mark"]');
    if (!mark) throw new Error('verdict-mark 没渲染出来');
    return mark;
  }

  function stampSize(): { width: string; height: string } {
    const stamp = container.querySelector<HTMLImageElement>('[data-testid="verdict-stamp"]');
    if (!stamp) throw new Error('印章没渲染出来');
    return { width: stamp.style.width, height: stamp.style.height };
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

  it('印章边长也跟着比例走 —— 否则缩了字之后印比字还大', () => {
    mount(1);
    const full = stampSize();
    mount(0.5);
    const half = stampSize();

    expect(Number.parseFloat(half.width)).toBeCloseTo(Number.parseFloat(full.width) / 2, 5);
    expect(Number.parseFloat(half.height)).toBeCloseTo(Number.parseFloat(full.height) / 2, 5);
  });

  it('异常比例（0 / NaN）退回 1，不让整块消失', () => {
    for (const bad of [0, Number.NaN]) {
      const mark = mount(bad);
      expect(Number.parseFloat(mark.style.fontSize)).toBeGreaterThan(0);
    }
  });
});
