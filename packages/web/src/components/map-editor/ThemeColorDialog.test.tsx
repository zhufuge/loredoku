import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME_COLOR } from '@loredoku/shared';
import { ThemeColorDialog } from './ThemeColorDialog';

/**
 * FEAT-H08（docs/v0.4.2.md §8）：主题色弹窗是**受控**组件 —— 抽屉只展示当前选中，
 * 选色在这里完成，且只把结果交回抽屉，自己绝不写 store。
 *
 * v0.8.3：色板去掉了，选色只走统一取色控件（色块 + hex）。
 */

describe('ThemeColorDialog — 渲染行为（FEAT-H08）', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  function render(value: string): void {
    act(() => {
      root.render(
        <ThemeColorDialog open value={value} onOpenChange={onOpenChange} onConfirm={onConfirm} />,
      );
    });
  }

  const buttonByText = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label,
    );

  const hex = (): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>('input[aria-label="主题色（hex）"]');

  beforeEach(() => {
    onConfirm.mockClear();
    onOpenChange.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('shows the current colour in the picker and in the hex field', () => {
    // FIX-O15: the picker *is* the preview now.
    render('#123456');
    const picker = document.querySelector<HTMLInputElement>('input[type="color"]');
    expect(picker?.value).toBe('#123456');
    // v0.8.3：hex 框的标签跟着统一取色控件走 —— 「<字段名>（hex）」。
    expect(hex()?.value).toBe('#123456');
  });

  it('不再渲染调色板（v0.8.3：色板整体去掉）', () => {
    render(DEFAULT_THEME_COLOR);
    expect(document.querySelector('[data-testid="color-palette"]')).toBeNull();
    expect(document.querySelectorAll('button[aria-label^="颜色 "]')).toHaveLength(0);
  });

  it('typing a hex updates the preview and only 确定 hands the colour back', () => {
    render(DEFAULT_THEME_COLOR);
    const input = hex() as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, '#123456');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });

    // Nothing is written until 确定.
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => buttonByText('确定')?.click());
    expect(onConfirm).toHaveBeenCalledWith('#123456');
  });

  it('取消 closes without handing anything back', () => {
    render('#ABCDEF');
    act(() => buttonByText('取消')?.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
