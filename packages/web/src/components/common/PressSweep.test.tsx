import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PressSweep } from './PressSweep';

/**
 * v0.9.2 §5：清除按钮的扇形扫描。
 *
 * 这里钉的不是「长什么样」，而是两件**会让手势失灵**的事：
 *
 * 1. 进度刻度由页面给（时长与 `GAME_LONG_PRESS_MS` 同源，切点走那条注册成
 *    `<angle>` 的属性、从 12 点开始）—— 各写一个魔法数就会「扫满了却没执行」
 *    或「执行了还没扫满」；换个起点，「顺时针还剩多少」这套读法就不成立。
 * 2. `seq` 变了必须重建节点。同一枚按钮连按两次，动画得从头播；不重建的话
 *    第二次按住会看到一块已经填满的方块，等于没有反馈。
 */
describe('PressSweep', () => {
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

  function render(props: { seq?: string; durationMs?: number }): HTMLElement {
    act(() => {
      root.render(<PressSweep durationMs={props.durationMs ?? 340} seq={props.seq ?? 'clear-1'} />);
    });
    const node = container.querySelector<HTMLElement>('.press-sweep');
    if (!node) throw new Error('扇形没渲染出来');
    return node;
  }

  it('时长与切点都从属性来：conic 从 12 点钟方向开始扫', () => {
    const node = render({ durationMs: 340 });

    expect(node.style.getPropertyValue('--press-sweep-duration')).toBe('340ms');
    const background = node.style.background;
    // 起点就是渐变的默认起点（12 点）。**不能**出现 `from` —— 那是 SVG 圆形
    // 路径那一套（0° 在 3 点钟），照抄过来会把起点挪到 9 点钟去。
    expect(background).toContain('conic-gradient(');
    expect(background).not.toContain('from ');
    // 切点是那条注册成 <angle> 的变量 —— 换成一个固定角度，动画就没了。
    expect(background).toContain('var(--press-sweep-angle');
  });

  it('seq 变了就重建节点 —— 连按两次要重新扫', () => {
    const first = render({ seq: 'clear-1' });
    act(() => {
      root.render(<PressSweep durationMs={340} seq="clear-2" />);
    });
    const second = container.querySelector<HTMLElement>('.press-sweep');
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
  });
});
