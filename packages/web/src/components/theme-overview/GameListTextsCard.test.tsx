import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { GameListTextsCard } from './GameListTextsCard';

/** 游戏列表页那两行字（「N 关可玩」/「已通过 N 关」）是主题配置。 这一层钉三件事：没配过时输入框里摆的是内置那句、失焦就存、少了 `{n}` 不许存（那句会失去关数 —— 服务端也会拒，但在输入框旁边说清楚比弹一条「保存失败」有用）。 */
const mutate = vi.fn();
const toastError = vi.fn();

vi.mock('@/hooks/useThemes', () => ({
  useUpdateTheme: () => ({ mutate, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (message: string) => toastError(message) } }));

function theme(data: Partial<Theme['data']> = {}): Theme {
  return { id: 1, code: 'hlm', name: '红楼梦', description: null, data } as unknown as Theme;
}

describe('GameListTextsCard（v0.11.6）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(value: Theme): void {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<GameListTextsCard theme={value} />);
    });
  }

  const inputs = (): HTMLInputElement[] =>
    Array.from(container.querySelectorAll('input'));

  /** 改一个输入框再让它失焦 —— 与真人「打完字点别处」同一条路。 */
  function type(index: number, text: string): void {
    const input = inputs()[index];
    if (!input) throw new Error(`第 ${index} 个输入框不在`);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, text);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // React 的 `onBlur` 挂的是 `focusout`（它要冒泡），所以先聚焦再失焦。
    act(() => {
      input.focus();
      input.blur();
    });
  }

  beforeEach(() => {
    mutate.mockClear();
    toastError.mockClear();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('没配过时输入框里摆的是内置那两句，并给出预览', () => {
    render(theme());

    expect(inputs()[0]?.value).toBe('{n} 关可玩');
    expect(inputs()[1]?.value).toBe('已通过 {n} 关');
    expect(container.textContent).toContain('预览：6 关可玩');
  });

  it('配过就摆配的那句', () => {
    render(theme({ gameList: { playable: '共 {n} 回', passed: '已了 {n} 桩' } }));

    expect(inputs()[0]?.value).toBe('共 {n} 回');
    expect(inputs()[1]?.value).toBe('已了 {n} 桩');
  });

  it('改完失焦就存，另一句原样带上', () => {
    render(theme({ gameList: { passed: '已了 {n} 桩' } }));

    type(0, '共 {n} 回');

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toEqual({
      data: { gameList: { passed: '已了 {n} 桩', playable: '共 {n} 回' } },
    });
  });

  it('少了 {n} 就不发请求，并在旁边说清楚为什么', () => {
    render(theme());

    type(0, '共若干回');

    expect(mutate).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith('文案里要留一个 {n}，它会换成关数');
  });

  it('清空 = 用回内置那句（空串也照发）', () => {
    render(theme({ gameList: { playable: '共 {n} 回' } }));

    type(0, '');

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]?.[0]).toEqual({ data: { gameList: { playable: '' } } });
  });

  it('没改动就失焦，不发请求', () => {
    // 存着的就是输入框里那一句 —— 失焦不该白发一次请求（点来点去很频繁）。
    render(theme({ gameList: { playable: '{n} 关可玩' } }));

    type(0, '{n} 关可玩');

    expect(mutate).not.toHaveBeenCalled();
  });

  it('把内置那句原样敲进去算改动：它从此是显式配置', () => {
    render(theme());

    type(0, '{n} 关可玩');

    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
