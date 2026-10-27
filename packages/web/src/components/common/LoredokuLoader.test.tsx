import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InlineLoading,
  LoadingBlock,
  LoadingScreen,
  LoredokuLoader,
  LoredokuTick,
} from './LoredokuLoader';

/**
 * v0.7.12：加载态的品牌字标。
 *
 * 这里钉的是**结构与语义**（八个字母、错开的节拍、屏幕阅读器读到什么、尺寸
 * 落在哪个类上），不钉观感 —— 观感在 `index.css` 的 `@keyframes` 里，那一层
 * 由构建产物核对（`docs/v0.7.12.md` §5 的验收清单）。
 *
 * 尺寸类名那条断言不是形式主义：`loredoku-word--${size}` 这种模板串会让
 * Tailwind 把三档 `font-size` 整段裁掉，而构建与类型检查都不会报错。
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('LOREDOKU 加载字标（v0.7.12）', () => {
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

  function render(node: JSX.Element): void {
    act(() => root.render(node));
  }

  it('拼出 LOREDOKU 八个字母，并按索引错开节拍', () => {
    render(<LoredokuLoader />);
    const letters = Array.from(container.querySelectorAll('.loredoku-word__l'));
    expect(letters).toHaveLength(8);
    expect(letters.map((node) => node.textContent).join('')).toBe('LOREDOKU');
    expect(letters.map((node) => node.getAttribute('style'))).toEqual(
      Array.from({ length: 8 }, (_, index) => `--i: ${index};`),
    );
  });

  it('R-E-D 三个字母上品牌朱墨，其余仍是灰字', () => {
    render(<LoredokuLoader />);
    const red = Array.from(container.querySelectorAll('.loredoku-word__l.loredoku-ink-red'));
    expect(red.map((node) => node.textContent).join('')).toBe('RED');
    // 颜色本身在 `index.css`（明暗两套），这里钉的是**哪三个字母**被点名。
    expect(container.querySelectorAll('.loredoku-ink-red')).toHaveLength(3);
  });

  it('翻牌格跟着按钮的 currentColor，不染朱墨', () => {
    render(<LoredokuTick />);
    expect(container.querySelectorAll('.loredoku-ink-red')).toHaveLength(0);
  });

  it('对屏幕阅读器只说「加载中」，八个字母是装饰', () => {
    render(<LoredokuLoader />);
    const status = container.querySelector('[role="status"]');
    expect(status?.getAttribute('aria-label')).toBe('加载中');
    expect(
      Array.from(container.querySelectorAll('.loredoku-word__l')).every(
        (node) => node.getAttribute('aria-hidden') === 'true',
      ),
    ).toBe(true);
  });

  it('三档尺寸各自落在字面量类名上', () => {
    const sizeOf = (size: 'sm' | 'md' | 'lg'): string => {
      act(() => root.render(<LoredokuLoader size={size} />));
      return container.querySelector('[role="status"]')?.className ?? '';
    };
    expect(sizeOf('sm')).toContain('loredoku-word--sm');
    expect(sizeOf('md')).toContain('loredoku-word--md');
    expect(sizeOf('lg')).toContain('loredoku-word--lg');
  });

  it('四个出口都挂「迟到淡入」，翻牌格不挂（它和按钮文案同时出现）', () => {
    const roots: Array<[JSX.Element, string]> = [
      [<LoredokuLoader />, '[role="status"]'],
      [<LoadingBlock caption="正在加载…" />, 'div'],
      [<InlineLoading caption="正在加载…" />, '[role="status"]'],
      [<LoadingScreen />, 'div'],
    ];
    for (const [node, selector] of roots) {
      act(() => root.render(node));
      expect(container.querySelector(selector)?.className).toContain('load-delayed');
    }

    act(() => root.render(<LoredokuTick />));
    expect(container.querySelector('.loredoku-tick')?.className).not.toContain('load-delayed');
  });

  it('翻牌格：同一串字，但不自报状态（旁边的文案已经说完了）', () => {
    render(<LoredokuTick />);
    const tick = container.querySelector('.loredoku-tick');
    expect(tick?.getAttribute('aria-hidden')).toBe('true');
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(tick?.textContent).toBe('LOREDOKU');
  });

  it('行内状态把翻牌格与一句话排在一起', () => {
    render(<InlineLoading caption="正在加载部署…" />);
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain('正在加载部署…');
    expect(status?.querySelector('.loredoku-tick')).not.toBeNull();
  });

  it('整块：字标 + 说明，说明可以省', () => {
    render(<LoadingBlock caption="正在加载版本记录…" />);
    expect(container.textContent).toContain('LOREDOKU');
    expect(container.textContent).toContain('正在加载版本记录…');

    act(() => root.render(<LoadingBlock />));
    expect(container.textContent).toContain('LOREDOKU');
    expect(container.querySelector('p')).toBeNull();
  });

  it('整屏：撑满视口高度，用最大一档字标', () => {
    render(<LoadingScreen caption="正在加载游戏…" />);
    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain('h-screen');
    expect(container.querySelector('.loredoku-word')?.className).toContain('loredoku-word--lg');
    expect(container.textContent).toContain('正在加载游戏…');
  });

  /**
   * 两道门的接力（v0.7.12 §10）：分包那一屏刚亮起来，页面自己的数据门紧接着
   * 挂载 —— 第二道门不该再迟到一次（中间会空出一次闪烁）。
   *
   * 这里把假时钟**往回拨一分钟**再跑：跑完之后模块里记的「上次亮起时刻」停在
   * 一分钟前，切回真时钟时差距远大于 800ms，后面的用例不受影响（不改回拨的话，
   * 时间戳会落在未来，同一文件里后跑的用例都会被判成「刚亮过」）。
   */
  it('接力：上一件刚亮起来，第二道门直接出现、不再迟到', () => {
    vi.useFakeTimers({ now: Date.now() - 60_000 });
    try {
      render(<LoadingScreen caption="正在加载画布…" />);
      expect(container.querySelector('.load-delayed')).not.toBeNull();

      // 过了门槛 → 字标真的亮起来，模块记下这一刻。
      act(() => vi.advanceTimersByTime(250));

      // 分包到位、页面挂载：数据门的字标接着上一件。
      render(<LoredokuLoader />);
      expect(container.querySelector('.load-delayed')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
