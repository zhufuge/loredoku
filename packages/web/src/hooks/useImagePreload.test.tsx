import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useImagePreload } from './useImagePreload';

/**
 * jsdom 里 `<img>` 永远不派发 load（实测：赋值 src 后 `complete` 一直是 false，
 * 300ms 内 onload / onerror 都不来），所以这里替掉全局 `Image`，由用例自己决定
 * 什么时候「加载完」。
 */
class FakeImage {
  static instances: FakeImage[] = [];

  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    FakeImage.instances.push(this);
  }

  static take(): FakeImage[] {
    const list = FakeImage.instances;
    FakeImage.instances = [];
    return list;
  }
}

function Harness({ urls }: { urls: (string | null | undefined)[] }): JSX.Element {
  const ready = useImagePreload(urls);
  return <span data-testid="ready">{ready ? 'yes' : 'no'}</span>;
}

describe('useImagePreload — 页面等着的那几张图（v0.11.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const ready = (): string =>
    container.querySelector('[data-testid="ready"]')?.textContent ?? '';

  function render(urls: (string | null | undefined)[]): void {
    act(() => {
      root.render(<Harness urls={urls} />);
    });
  }

  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    FakeImage.instances = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    FakeImage.instances = [];
  });

  it('没有图要等：立刻就算就绪', () => {
    render([]);
    expect(ready()).toBe('yes');
    render([null, undefined, '']);
    expect(ready()).toBe('yes');
  });

  it('一张没加载完就还不算就绪，全部到齐才翻', () => {
    render(['/a.webp', '/b.webp']);
    expect(ready()).toBe('no');

    const images = FakeImage.take();
    expect(images).toHaveLength(2);

    act(() => images[0]?.onload?.());
    expect(ready()).toBe('no');

    act(() => images[1]?.onload?.());
    expect(ready()).toBe('yes');
  });

  it('加载失败也算「不必再等」—— 一张 404 的图不该把页面永远卡在 loading', () => {
    render(['/missing.webp']);
    expect(ready()).toBe('no');

    const [image] = FakeImage.take();
    act(() => image?.onerror?.());
    expect(ready()).toBe('yes');
  });

  it('重复地址只请求一次', () => {
    render(['/same.webp', '/same.webp', null]);
    expect(FakeImage.take()).toHaveLength(1);
  });

  it('地址换了要重新等 —— 上一轮的就绪不能顶替这一轮', () => {
    render(['/a.webp']);
    const [first] = FakeImage.take();
    act(() => first?.onload?.());
    expect(ready()).toBe('yes');

    render(['/b.webp']);
    expect(ready()).toBe('no');
    const [second] = FakeImage.take();
    act(() => second?.onload?.());
    expect(ready()).toBe('yes');
  });

  it('每次渲染都传新数组也不会反复重新加载', () => {
    render(['/a.webp']);
    const [first] = FakeImage.take();
    act(() => first?.onload?.());
    expect(ready()).toBe('yes');

    render(['/a.webp']);
    expect(FakeImage.take()).toHaveLength(0);
    expect(ready()).toBe('yes');
  });
});