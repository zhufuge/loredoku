import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClampedText } from './ClampedText';

/**
 * v0.7.12：描述被截断时，触碰 / 悬停能看到全文。
 *
 * jsdom 不排版，所有尺寸恒为 0，所以「有没有溢出」在这里是**造**出来的：给
 * span 覆盖一对 `scrollHeight / clientHeight`，再让组件重新量一次。真正要钉的
 * 是三条逻辑 ——
 *
 * 1. 没溢出时不挂浮层（否则每个短描述都会弹出一片和原文一字不差的纸）；
 * 2. 溢出时打上 `data-clipped`，触摸抬手把全文浮层打开；
 * 3. 视口变大、文字不再溢出时，浮层跟着收掉。
 */

const LONG = '这是一段很长的描述，长到两行放不下，必须点一下才能读完剩下的部分。';

describe('ClampedText', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(text: string): void {
    act(() => {
      root.render(<ClampedText text={text} lines={2} />);
    });
  }

  /** Radix 的浮层挂在 body 上，`role="tooltip"` 是它的唯一标识。 */
  function tooltip(): HTMLElement | null {
    return document.querySelector<HTMLElement>('[role="tooltip"]');
  }

  function span(): HTMLElement {
    const node = container.querySelector<HTMLElement>('span');
    if (!node) throw new Error('文本没渲染出来');
    return node;
  }

  /** 造一次「被截断」：两行高 40，内容 72。 */
  function makeClipped(): void {
    Object.defineProperty(span(), 'clientHeight', { configurable: true, value: 40 });
    Object.defineProperty(span(), 'scrollHeight', { configurable: true, value: 72 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  }

  it('leaves a short description alone — no tooltip at all', () => {
    render('短描述');
    expect(span().getAttribute('data-clipped')).toBeNull();
  });

  it('marks an overflowing description as clipped', () => {
    render(LONG);
    makeClipped();
    expect(span().getAttribute('data-clipped')).toBe('true');
  });

  it('opens the full text on a touch release', () => {
    render(LONG);
    makeClipped();

    expect(tooltip()).toBeNull();

    act(() => {
      span().dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    });

    expect(tooltip()?.textContent).toBe(LONG);
  });

  it('drops the tooltip again when the text stops overflowing', () => {
    render(LONG);
    makeClipped();
    act(() => {
      span().dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    });
    expect(tooltip()).not.toBeNull();

    // 视口变宽 → 两行放得下 → 提示同时消失。
    Object.defineProperty(span(), 'scrollHeight', { configurable: true, value: 40 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(span().getAttribute('data-clipped')).toBeNull();
    expect(tooltip()).toBeNull();
  });
});
