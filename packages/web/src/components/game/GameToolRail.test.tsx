import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameToolRail } from './GameToolRail';

/**
 * v0.11.3（docs/v0.11.3.md §3）—— 竖屏下长按清除按钮，指针事件不该跑到棋盘那边。
 *
 * 为什么钉这件事：竖屏时这一栏从「右列」变成「底部横条」，与棋盘同在一个 flex 列。
 * 清除按钮要按住 800ms 才算清空，这 800ms 里浏览器一路派发事件；只要有一个漏出
 * 按钮、冒泡到棋盘的 `onPointerDown`，玩家就会在「长按清空」的同时在格子上下了一手。
 *
 * 判据是「外层有没有收到事件」，不是断言某一行代码 —— 这才能挡住以后有人把
 * `stopPropagation` 挪掉、或者换成别的写法又忘了截。
 */
describe('GameToolRail — 长按清除不外传（v0.11.3）', () => {
  let host: HTMLDivElement;
  let container: HTMLDivElement;
  let root: Root;
  let leaked: string[];

  /**
   * 外层包一层 `host` 再挂监听：React 18 把合成事件的监听器装在**根容器**上，
   * 监听器若与根容器同一个节点，`stopPropagation()` 拦不住它（同一节点上的
   * 其它监听器不受影响，那是 `stopImmediatePropagation` 的职责）。挂到根容器的
   * 父节点，才是真实的「再往上冒泡」。
   */
  function mount(props: Partial<Parameters<typeof GameToolRail>[0]> = {}): void {
    host = document.createElement('div');
    container = document.createElement('div');
    host.appendChild(container);
    for (const type of ['pointerdown', 'pointerup', 'pointerleave'] as const) {
      host.addEventListener(type, () => leaked.push(type));
    }
    document.body.appendChild(host);
    root = createRoot(container);
    act(() => {
      root.render(<GameToolRail {...baseProps} {...props} />);
    });
  }

  const baseProps = {
    toolsLocked: false,
    mode: { kind: 'idle' as const },
    checking: false,
    canUndoNow: false,
    readyToSubmit: false,
    clearPress: null,
    zoom: 1,
    showRulers: false,
    toolIcons: {},
    markImageUrl: null,
    onToggleForbidden: () => undefined,
    onStartClearPress: () => undefined,
    onEndClearPress: () => undefined,
    onUndo: () => undefined,
    onSubmit: () => undefined,
    onZoomBy: () => undefined,
    onResetView: () => undefined,
    onToggleRulers: () => undefined,
    onOpenHelp: () => undefined,
  };

  function clearButton(): HTMLButtonElement {
    const node = Array.from(container.querySelectorAll('button')).find((button) =>
      button.getAttribute('title')?.startsWith('清除放置'),
    );
    if (!node) throw new Error('清除按钮没渲染出来');
    return node;
  }

  beforeEach(() => {
    leaked = [];
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('按下 / 抬起都被按钮截住，外层一个都没收到', () => {
    mount();
    const button = clearButton();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });

    expect(leaked).toEqual([]);
  });

  /**
   * 指针移出也要收尾（长按到一半滑出去不能一直转），但这一条**不查冒泡**：
   * 原生的 `pointerleave` 本身就不冒泡，截与不截都到不了外层；React 的
   * `onPointerLeave` 是从会冒泡的 `pointerout` 推出来的，所以这里派发 `pointerout`。
   */
  it('指针移出按钮 → 长按收尾', () => {
    const end = vi.fn();
    mount({ onStartClearPress: vi.fn(), onEndClearPress: end });
    const button = clearButton();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      button.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });

    expect(end).toHaveBeenCalled();
  });

  it('同样的手势换个按钮仍然照常冒泡 —— 截住的只是清除这一枚', () => {
    mount();
    const other = container.querySelector<HTMLButtonElement>('button[title="标记"]');
    if (!other) throw new Error('标记按钮没渲染出来');

    act(() => {
      other.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });

    expect(leaked).toEqual(['pointerdown']);
  });

  it('按下与抬起都真的传给了外面的回调，不是被吞掉了', () => {
    const start = vi.fn();
    const end = vi.fn();
    mount({ onStartClearPress: start, onEndClearPress: end });

    const button = clearButton();
    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(end).not.toHaveBeenCalled();

    act(() => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, button: 0 }));
    });
    expect(end).toHaveBeenCalledTimes(1);
  });

  /**
   * 玩法说明那枚问号。
   *
   * 钉两件事：它在这一栏里**排在最后**（用户说的是「最下方」），点它把回调
   * 传出去。位置用「在整栏里是不是最后一个按钮」判断 —— 不去数 class 里的
   * `mt-auto` 之类，那些是排版手段，不是这件事。
   */
  it('玩法说明那枚问号排在最下面，点了把回调传出去', () => {
    const open = vi.fn();
    mount({ onOpenHelp: open });
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
    const help = buttons.find((button) => button.getAttribute('aria-label') === '玩法说明');
    if (!help) throw new Error('玩法说明按钮没渲染出来');

    expect(buttons[buttons.length - 1]).toBe(help);

    act(() => help.click());
    expect(open).toHaveBeenCalledTimes(1);
  });
});
