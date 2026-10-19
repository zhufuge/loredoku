import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BG_COLOR } from '@loredoku/shared';
import { AppearanceField } from './AppearanceField';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — the shared 「外观」 control.
 *
 * The two modes must be mutually exclusive: 「纯色块」 shows a colour picker and
 * hides the uploader, 「图片」 shows the uploader and hides the picker.
 */

describe('AppearanceField — 渲染行为（v0.5.1）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let mode: 'image' | 'color';
  let bgColor: string;

  function render(): void {
    act(() => {
      root.render(
        <AppearanceField
          mode={mode}
          onModeChange={(next) => {
            mode = next;
          }}
          bgColor={bgColor}
          onBgColorChange={(next) => {
            bgColor = next;
          }}
        >
          <span data-testid="uploader">上传区</span>
        </AppearanceField>,
      );
    });
  }

  beforeEach(() => {
    mode = 'image';
    bgColor = DEFAULT_BG_COLOR;
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const option = (value: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`button[data-appearance-mode="${value}"]`);

  it('renders both options and marks the active one', () => {
    expect(option('image')?.getAttribute('aria-checked')).toBe('true');
    expect(option('color')?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows the uploader — and no picker — in image mode', () => {
    expect(document.querySelector('[data-testid="uploader"]')).not.toBeNull();
    expect(document.querySelector('input[type="color"]')).toBeNull();
  });

  it('shows the picker — and no uploader — after switching to 纯色块', () => {
    act(() => option('color')?.click());
    render();

    expect(document.querySelector('input[type="color"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="uploader"]')).toBeNull();
  });

  it('starts at white', () => {
    act(() => option('color')?.click());
    render();
    expect(document.querySelector<HTMLInputElement>('input[type="color"]')?.value).toBe(
      DEFAULT_BG_COLOR.toLowerCase(),
    );
  });

  it('reports the picked colour upper-cased', () => {
    const onBgColorChange = vi.fn();
    act(() => {
      root.render(
        <AppearanceField
          mode="color"
          onModeChange={() => undefined}
          bgColor="#aabbcc"
          onBgColorChange={onBgColorChange}
        />,
      );
    });
    const input = document.querySelector<HTMLInputElement>('input[type="color"]');
    expect(input?.value).toBe('#aabbcc');
    // React tracks the value setter, so a plain assignment is invisible to it —
    // go through the prototype descriptor the way the browser would.
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    act(() => {
      setter?.call(input, '#112233');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onBgColorChange).toHaveBeenCalledWith('#112233'.toUpperCase());
  });
});
