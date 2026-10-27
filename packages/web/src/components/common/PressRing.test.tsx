import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PressRing } from './PressRing';

/**
 * v0.7.11：长按进度环的几何契约。
 *
 * 这个组件只有三件事能被测出来，也只需要测这三件：
 *   1. 弧的总长 = 周长（`stroke-dasharray`）—— 决定它是不是「一整圈」；
 *   2. 时长从内联变量来（`--press-ring-duration`）—— 决定环画满与动作发生
 *      是不是同一刻，页面上改了 `GAME_LONG_PRESS_MS` 这里必须跟着走；
 *   3. 起点在 12 点（`rotate(-90 …)`）—— 倒计时从正上方开始读才像钟面。
 *
 * 动画本身（`stroke-dashoffset` 从周长走到 0）由 CSS 关键帧完成，jsdom 不跑
 * 动画，断言的是「交给 CSS 的初始值对不对」。
 */

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

function render(props: Parameters<typeof PressRing>[0]): void {
  act(() => root.render(<PressRing {...props} />));
}

function arc(): SVGCircleElement {
  const node = container.querySelector<SVGCircleElement>('.press-ring-arc');
  if (!node) throw new Error('进度弧没渲染出来');
  return node;
}

describe('PressRing — 长按进度环（v0.7.11）', () => {
  it('弧的总长等于整个周长，起点在 12 点', () => {
    render({ size: 100, durationMs: 500, seq: 1 });
    const circumference = 2 * Math.PI * 100 * 0.38;
    expect(Number(arc().getAttribute('stroke-dasharray'))).toBeCloseTo(circumference, 5);
    // 一开始整条都藏着，动画把它推到 0 —— 弧于是从无到有地长出来。
    expect(Number(arc().getAttribute('stroke-dashoffset'))).toBeCloseTo(circumference, 5);
    expect(arc().getAttribute('transform')).toBe('rotate(-90 50 50)');
    expect(arc().getAttribute('stroke-linecap')).toBe('round');
  });

  it('时长写在变量里，页面改长按阈值时环跟着走', () => {
    render({ size: 80, durationMs: 750, seq: 1 });
    expect(arc().style.getPropertyValue('--press-ring-duration')).toBe('750ms');
    expect(arc().style.getPropertyValue('--press-ring-length')).toBe(
      String(2 * Math.PI * 80 * 0.38),
    );
  });

  it('只画底轨时才出现第二圈圆', () => {
    render({ size: 80, durationMs: 500, seq: 1 });
    expect(container.querySelectorAll('circle')).toHaveLength(1);

    render({ size: 80, durationMs: 500, seq: 1, trackColor: 'rgba(0,0,0,0.4)' });
    const widths = Array.from(container.querySelectorAll('circle')).map((node) =>
      Number(node.getAttribute('stroke-width')),
    );
    expect(widths).toHaveLength(2);
    // 底轨比弧宽 2px：白色弧压在深色垫上，两侧各露 1px 当描边。
    expect(Math.max(...widths) - Math.min(...widths)).toBe(2);
  });

  it('seq 变了就换一根新的弧 —— 同一格连按两次也要从头画', () => {
    render({ size: 80, durationMs: 500, seq: 1 });
    const first = arc();

    render({ size: 80, durationMs: 500, seq: 1 });
    expect(arc()).toBe(first);

    render({ size: 80, durationMs: 500, seq: 2 });
    expect(arc()).not.toBe(first);
  });

  it('是 aria-hidden 的纯装饰 —— 环不抢焦点、不进可访问树', () => {
    render({ size: 80, durationMs: 500, seq: 1 });
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
