import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME_COLOR, THEME_COLOR_PALETTE } from '@loredoku/shared';
import { ThemeColorDialog } from './ThemeColorDialog';

/**
 * FEAT-H08（docs/v0.4.2.md §8）：主题色弹窗是**受控**组件 —— 抽屉只展示当前选中，
 * 选色（15 色板 / 自定义 hex）在这里完成，且只把结果交回抽屉，自己绝不写 store。
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

  // Radix portals the panel to `document.body`, so queries go through `document`.
  // v0.5.3 FEAT-N09: the swatches come from the shared palette (「颜色 …」).
  const swatch = (color: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`button[aria-label="颜色 ${color}"]`);

  const buttonByText = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === label,
    );

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
    const hex = document.querySelector<HTMLInputElement>('input[aria-label="自定义主题色"]');
    expect(hex?.value).toBe('#123456');
  });

  it('renders the whole palette', () => {
    render(DEFAULT_THEME_COLOR);
    expect(document.querySelectorAll('button[aria-label^="颜色 "]').length).toBe(
      THEME_COLOR_PALETTE.length,
    );
  });

  it('picking a swatch updates the preview and only 确定 hands the colour back', () => {
    const target = THEME_COLOR_PALETTE[3] as string;
    render(DEFAULT_THEME_COLOR);
    act(() => swatch(target)?.click());
    // Nothing is written until 确定.
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => buttonByText('确定')?.click());
    expect(onConfirm).toHaveBeenCalledWith(target);
  });

  it('取消 closes without handing anything back', () => {
    render('#ABCDEF');
    act(() => buttonByText('取消')?.click());
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
