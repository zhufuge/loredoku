import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ColorField } from './color-input';

/**
 * v0.8.3：统一取色控件。
 *
 * 这一版把几种长相收成一种：色块（原生取色器）+ hex 输入框。钉三件事：
 *
 * 1. 只有这两件 —— v0.8.3 收尾时按用户要求去掉了调色板，谁再往这里塞一份固定
 *    色板，界面上就会重新出现「十几种预设」那套东西；
 * 2. hex 是草稿：非法中间态留在框里，失焦时才回滚到当前值；
 * 3. 取色器给的色即时提交。
 */

describe('ColorField（v0.8.3 统一取色控件）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(props: Partial<Parameters<typeof ColorField>[0]> = {}): void {
    act(() => {
      root.render(
        <ColorField label="识别色" value="#326385" commit={() => undefined} {...props} />,
      );
    });
  }

  const hex = (): HTMLInputElement | null =>
    document.querySelector('input[aria-label="识别色（hex）"]');

  const setHex = (input: HTMLInputElement, value: string): void => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('两件套：色块与 hex 输入框，且没有调色板', () => {
    render();
    expect(document.querySelector('input[type="color"]')).not.toBeNull();
    expect(hex()?.value).toBe('#326385');
    // 调色板已按用户要求去掉 —— 这里没有第二个按钮来展开什么。
    expect(document.querySelector('[data-testid="color-palette"]')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('取色器给的色即时提交 —— 它给的一定是完整颜色', () => {
    const commit = vi.fn();
    render({ commit });

    const picker = document.querySelector<HTMLInputElement>('input[type="color"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(picker, '#B93A32');
      picker?.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(commit).toHaveBeenCalledWith('#B93A32');
    expect(hex()?.value).toBe('#B93A32');
  });

  it('hex 是草稿：打一半不提交，失焦时才提交', () => {
    const commit = vi.fn();
    render({ commit });

    const input = hex() as HTMLInputElement;
    setHex(input, '#ff00');
    expect(commit).not.toHaveBeenCalled();
    // 非法中间态留在框里，不是被实时改掉。
    expect(input.value).toBe('#ff00');

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '#B93A32');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(commit).toHaveBeenCalledWith('#B93A32');
  });

  it('提交不合法的值 → 回滚到当前值，而不是写进主题', () => {
    const commit = vi.fn();
    render({ commit, value: '#326385' });

    const input = hex() as HTMLInputElement;
    setHex(input, '不是颜色');
    act(() => input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

    expect(commit).not.toHaveBeenCalled();
    expect(input.value).toBe('#326385');
  });
});
