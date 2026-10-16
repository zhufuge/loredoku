import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIST_ROW_HEIGHT } from '@loredoku/shared';
import { VirtualList } from './virtual-list';

/**
 * v0.5.2 FEAT-M01 (docs/v0.5.2.md §1) — the whole point of the component is
 * that **it does not mount the whole list**. These tests assert that.
 *
 * jsdom reports `clientHeight = 0`, so the component falls back to its
 * configured `height` — the window is therefore `height / rowHeight + overscan`
 * rows and stays well under `count`.
 */
describe('VirtualList (FEAT-M01)', () => {
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

  function render(count: number, height = 320, rowHeight = LIST_ROW_HEIGHT): void {
    act(() => {
      root.render(
        <VirtualList
          count={count}
          height={height}
          rowHeight={rowHeight}
          overscan={2}
          renderRow={(index) => <span data-row={index}>row {index}</span>}
        />,
      );
    });
  }

  function rows(): number {
    return container.querySelectorAll('[data-row]').length;
  }

  it('renders only the visible window, not the whole list', () => {
    render(1000);
    // 320 / 64 = 5 visible + 2 overscan below (nothing above index 0).
    expect(rows()).toBe(7);
    expect(rows()).toBeLessThan(20);
  });

  it('keeps the scrollbar honest with a full-height spacer', () => {
    render(1000);
    const spacer = container.querySelector<HTMLDivElement>('[data-testid="virtual-list"] > div');
    expect(spacer?.style.height).toBe(`${1000 * LIST_ROW_HEIGHT}px`);
  });

  it('starts at index 0', () => {
    render(1000);
    expect(container.querySelector('[data-row]')?.getAttribute('data-row')).toBe('0');
  });

  it('moves the window when the viewport scrolls', () => {
    render(1000);
    const viewport = container.querySelector<HTMLDivElement>('[data-testid="virtual-list"]');
    expect(viewport).not.toBeNull();
    act(() => {
      viewport!.scrollTop = 64 * 100;
      viewport!.dispatchEvent(new Event('scroll', { bubbles: false }));
    });
    const first = container.querySelector('[data-row]')?.getAttribute('data-row');
    // Row 100 with 2 rows of overscan above it.
    expect(Number(first)).toBe(98);
    expect(rows()).toBe(9);
  });

  it('renders every row when the list is shorter than the window', () => {
    render(3);
    expect(rows()).toBe(3);
  });

  it('renders nothing for an empty list', () => {
    render(0);
    expect(rows()).toBe(0);
  });

  it('never walks past the end of the data', () => {
    render(10);
    const viewport = container.querySelector<HTMLDivElement>('[data-testid="virtual-list"]');
    act(() => {
      viewport!.scrollTop = 100000;
      viewport!.dispatchEvent(new Event('scroll', { bubbles: false }));
    });
    const indices = [...container.querySelectorAll('[data-row]')].map((node) =>
      Number(node.getAttribute('data-row')),
    );
    expect(Math.max(...indices)).toBe(9);
    expect(indices).toContain(9);
  });
});
