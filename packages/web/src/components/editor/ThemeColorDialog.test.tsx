import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_THEME_COLOR, THEME_COLOR_PALETTE } from '@loredoku/shared';
import { ThemeColorDialog } from './ThemeColorDialog';
import { readSource } from '@/testing/source';

/**
 * FEAT-H08（docs/v0.4.2.md §8）：主题色弹窗是**受控**组件 —— 抽屉只展示当前选中，
 * 选色（15 色板 / 自定义 hex）在这里完成，且只把结果交回抽屉，自己绝不写 store。
 */

const raw = readSource('components/editor/ThemeColorDialog.tsx');

const source = raw;

/** FIX-O15 asserts the **absence** of things, so comments must not count. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

describe('ThemeColorDialog — 源码契约（FEAT-H08 §8.2）', () => {
  it('is controlled: value in, onConfirm out, no store access', () => {
    expect(source).toContain('value: string;');
    expect(source).toContain('onConfirm: (color: string) => void;');
    expect(source).toContain('onOpenChange: (open: boolean) => void;');
    // It never imports the store — the drawer's 保存 is still the only writer.
    expect(source).not.toContain('editorStore');
    expect(source).not.toContain('useEditorStore');
  });

  it('re-seeds its draft on every open so a cancelled edit cannot leak', () => {
    expect(source).toContain('if (!open) return;');
    expect(source).toContain('setDraft(value);');
    expect(source).toContain('setHexDraft(value);');
  });

  it('offers the shared palette and a custom hex field with validation', () => {
    // v0.5.3 FEAT-N09: the swatch grid moved into the shared `ColorPalette`.
    expect(source).toContain("from '@/components/ui/color-palette'");
    expect(source).toContain('<ColorPalette');
    expect(source).toContain('normalizeHexColor(hexDraft)');
    expect(source).toContain('aria-label="自定义主题色"');
  });

  it('puts the colour picker **before** the hex field, with no 应用 button', () => {
    // FIX-O15 (docs/v0.5.4.md §7.2).
    expect(code).toContain("from '@/components/ui/color-input'");
    expect(code).toContain('<ColorInput');
    // The picker replaces both the 应用 button and the trailing preview row.
    expect(code.indexOf('<ColorInput')).toBeLessThan(code.indexOf('aria-label="自定义主题色"'));
    expect(code).not.toContain('theme-color-preview');
  });
});

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
