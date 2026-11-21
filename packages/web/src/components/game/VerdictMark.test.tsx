import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VerdictMark } from './VerdictMark';

/**
 * v0.11.3（docs/v0.11.3.md §5）：iOS Safari 的 CSS `zoom` 不可靠（比例不生效、`translate` 仍按绝对像素），所以比例改落在字号上、块内尺寸用 em；大字档的印绝对定位、不参与横向排版。
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

  /* 大字档的印脱离文档流（`absolute left-full`）挂在字列右缘外，行里只剩字列 —— `justify-center` 居中的才是字列本身。印若留在行内（`-ml-[0.55em]`），行宽是「字列 + 印 − 叠压」，字会被推到中心右边。 */
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
