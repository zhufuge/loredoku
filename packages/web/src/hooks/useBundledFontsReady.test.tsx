import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetBundledFontsReadyForTest,
  useBundledFontsReady,
} from './useBundledFontsReady';

/**
 * v0.11.3（docs/v0.11.3.md §2）—— 列表页等字体就绪的那根开关。
 *
 * jsdom 没有真正的字体下载：`document.fonts.load()` 返回的 promise 永远不 settle。
 * 所以这里替掉 `loadBundledFonts`，由用例自己决定「字体什么时候能画」。
 */
const fontsRef: {
  settle: ((ok: boolean) => void) | null;
  calls: number;
} = { settle: null, calls: 0 };

vi.mock('@/lib/fonts', () => ({
  loadBundledFonts: () => {
    fontsRef.calls += 1;
    return new Promise<void>((resolve, reject) => {
      fontsRef.settle = (ok) => (ok ? resolve() : reject(new Error('字体下载失败')));
    });
  },
}));

function Harness(): JSX.Element {
  const ready = useBundledFontsReady();
  return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
}

describe('useBundledFontsReady — 字体能画了没有（v0.11.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const ready = (): string =>
    container.querySelector('[data-testid="ready"]')?.textContent ?? '';

  function render(): void {
    act(() => {
      root.render(<Harness />);
    });
  }

  beforeEach(() => {
    resetBundledFontsReadyForTest();
    fontsRef.settle = null;
    fontsRef.calls = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('字体没到之前是 false，到了才翻成 true', async () => {
    render();
    expect(ready()).toBe('no');

    await act(async () => {
      fontsRef.settle?.(true);
    });
    expect(ready()).toBe('yes');
  });

  it('失败也算就绪 —— 字体取不到该退回系统楷体，不该把玩家卡在加载页', async () => {
    render();
    expect(ready()).toBe('no');

    await act(async () => {
      fontsRef.settle?.(false);
    });
    expect(ready()).toBe('yes');
  });

  it('只等一次：第二棵树不再重新拉字体，第一帧就是就绪', async () => {
    render();
    await act(async () => {
      fontsRef.settle?.(true);
    });
    expect(ready()).toBe('yes');
    expect(fontsRef.calls).toBe(1);

    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    render();
    expect(ready()).toBe('yes');
    expect(fontsRef.calls).toBe(1);
  });
});
