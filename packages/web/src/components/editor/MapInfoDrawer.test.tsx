import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_STYLE } from '@loredoku/shared';
import type { MapStyle } from '@loredoku/shared';
import { MapInfoDrawer, type MapInfoDrawerHandle } from './MapInfoDrawer';
import { resolveMapStyle } from '@/lib/mapStyle';
import { readSource } from '@/testing/source';

/**
 * FEAT-E01 (docs/v0.3.9.md §3): the 「地图基本信息」drawer is a **form** — every
 * control writes a local draft and the map only changes when 保存 is pressed.
 * These are real render tests (jsdom + `react-dom/client`), because the whole
 * point of the fix is that editing no longer touches the store.
 *
 * v0.3.10: FIX-F01 (the canvas size joins the draft), FIX-F02 (every change
 * writes through), FIX-F04 / SPEC-F01 (source-level assertions).
 */

/** The drawer source, read as raw text for the architectural assertions. */
const drawerSource = readSource('components/editor/MapInfoDrawer.tsx');

function setValue(element: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
}

/** Mirrors what a browser does: type, then leave the field. */
function typeInto(element: HTMLInputElement | null, value: string): void {
  if (!element) throw new Error('input not found');
  setValue(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}

/** FIX-F02: typing only — the field keeps focus, nothing is flushed yet. */
function changeOnly(element: HTMLInputElement | null, value: string): void {
  if (!element) throw new Error('input not found');
  setValue(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('MapInfoDrawer (FEAT-E01)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const style: MapStyle = resolveMapStyle(undefined);
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  let handle: MapInfoDrawerHandle | null;

  function render(): void {
    act(() => {
      root.render(
        <MapInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          gridSize={6}
          autoCellSize={120}
          style={style}
          onRequestClose={onRequestClose}
          onCommit={onCommit}
        />,
      );
    });
  }

  beforeEach(() => {
    handle = null;
    onCommit.mockClear();
    onRequestClose.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const input = (id: string): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(`#${id}`) as HTMLInputElement;

  const clickSave = (): void => {
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
  };

  it('FEAT-E01: editing a field does NOT touch the map', () => {
    expect(handle?.isDirty()).toBe(false);
    act(() => typeInto(input('map-info-grid-separator-width'), '9'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle?.isDirty()).toBe(true);
  });

  it('FEAT-E01: 保存 commits the whole draft once', () => {
    act(() => typeInto(input('map-info-grid-separator-width'), '9'));
    act(() => typeInto(input('map-info-grid-separator-color'), '#112233'));
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as MapStyle;
    expect(committed.gridSeparator).toEqual({ width: 9, color: '#112233' });
    // Untouched fields survive the round-trip unchanged.
    expect(committed.canvasFrame).toEqual(DEFAULT_MAP_STYLE.canvasFrame);
  });

  it('保存 is disabled until something changes', () => {
    const save = (): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    act(() => typeInto(input('map-info-frame-width'), '8'));
    expect(save().disabled).toBe(false);
  });

  it('FEAT-E01: 取消 asks the parent to close and never commits', () => {
    act(() => typeInto(input('map-info-frame-width'), '8'));
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button')?.click();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('FEAT-E01: the × in the header behaves like 取消', () => {
    act(() => {
      container.querySelector<HTMLButtonElement>('header button')?.click();
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('the imperative handle drives save / discard for deferred switches', () => {
    act(() => typeInto(input('map-info-frame-width'), '8'));
    expect(handle?.isDirty()).toBe(true);
    act(() => handle?.discard());
    expect(handle?.isDirty()).toBe(false);
    act(() => handle?.save());
    // Nothing left to save → it just asks the parent to close.
    expect(onCommit).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('the handle reports clean immediately after save (no stale dirty flag)', () => {
    act(() => typeInto(input('map-info-frame-width'), '8'));
    act(() => handle?.save());
    expect(onCommit).toHaveBeenCalledTimes(1);
    // `style` has not re-rendered yet, so this is what the deferred switch reads.
    expect(handle?.isDirty()).toBe(false);
  });

  it('FEAT-D03: 方格大小 is part of the draft', () => {
    act(() => typeInto(input('map-info-cell-size'), '150'));
    expect(handle?.isDirty()).toBe(true);
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
    expect((onCommit.mock.calls[0]![0] as MapStyle).cellSize).toBe(150);
  });

  it('FEAT-D03: 恢复自适应 clears the override and the form goes clean again', () => {
    act(() => typeInto(input('map-info-cell-size'), '150'));
    expect(handle?.isDirty()).toBe(true);
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title^="恢复自适应"]')?.click();
    });
    // Back to the committed value → nothing left to save.
    expect(handle?.isDirty()).toBe(false);
    expect(
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.disabled,
    ).toBe(true);
  });

  it('FEAT-D03: 方格大小 clamps to 90 ~ 240', () => {
    act(() => typeInto(input('map-info-cell-size'), '500'));
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
    expect((onCommit.mock.calls[0]![0] as MapStyle).cellSize).toBe(240);
  });

  it('画布尺寸 belongs to the same draft (FIX-F01)', () => {
    act(() => typeInto(input('map-info-grid-size'), '9'));
    expect(handle?.isDirty()).toBe(true);
    expect(
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.disabled,
    ).toBe(false);
    clickSave();
    // The second argument carries the canvas size — one commit, both fields.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]![1]).toBe(9);
  });

  it('FIX-F01: 保存 persists the style and the canvas size together', () => {
    act(() => typeInto(input('map-info-grid-separator-width'), '9'));
    act(() => typeInto(input('map-info-grid-size'), '10'));
    clickSave();
    const committed = onCommit.mock.calls[0]![0] as MapStyle;
    expect(committed.gridSeparator.width).toBe(9);
    expect(onCommit.mock.calls[0]![1]).toBe(10);
  });

  it('FIX-F01: discard rolls the canvas size back', () => {
    act(() => typeInto(input('map-info-grid-size'), '9'));
    expect(handle?.isDirty()).toBe(true);
    act(() => handle?.discard());
    expect(handle?.isDirty()).toBe(false);
    expect(input('map-info-grid-size').value).toBe('6');
  });

  it('FIX-F02: a change alone (no blur) writes the draft', () => {
    const save = (): HTMLButtonElement =>
      container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    act(() => changeOnly(input('map-info-grid-separator-width'), '7'));
    expect(handle?.isDirty()).toBe(true);
    expect(save().disabled).toBe(false);
    clickSave();
    expect((onCommit.mock.calls[0]![0] as MapStyle).gridSeparator.width).toBe(7);
  });

  it('FIX-F02: clicking the stepper writes through without blur or Enter', () => {
    // The stepper fires a plain `input` event, exactly like `changeOnly`.
    act(() => changeOnly(input('map-info-frame-width'), '5'));
    expect(handle?.isDirty()).toBe(true);
    expect(input('map-info-frame-width').value).toBe('5');
  });

  it('FIX-F02: non-numeric input stays uncommitted until blur', () => {
    act(() => changeOnly(input('map-info-frame-width'), 'abc'));
    expect(handle?.isDirty()).toBe(false);
    act(() => {
      input('map-info-frame-width').dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    // Blur rolls the text back to the committed value.
    expect(input('map-info-frame-width').value).toBe(String(style.canvasFrame.width));
    expect(handle?.isDirty()).toBe(false);
  });

  it('FIX-F02: out-of-range values converge in real time', () => {
    act(() => changeOnly(input('map-info-grid-separator-width'), '99'));
    clickSave();
    // MAP_STYLE_LINE_WIDTH_MAX is 12 — the commit carries the clamped value.
    expect((onCommit.mock.calls[0]![0] as MapStyle).gridSeparator.width).toBe(12);
  });

  it('FIX-F02: the canvas size clamps to 2 ~ 24 while typing', () => {
    act(() => changeOnly(input('map-info-grid-size'), '99'));
    clickSave();
    expect(onCommit.mock.calls[0]![1]).toBe(24);
  });

  it('FIX-F04: no bare colour input — every swatch is the shared ColorInput', () => {
    expect(drawerSource).not.toMatch(/type="color"/);
    expect(drawerSource).toContain("from '@/components/ui/color-input'");
    expect(drawerSource.match(/<ColorInput/g)?.length ?? 0).toBeGreaterThan(0);
  });

  it('SPEC-F01: hints are circular icons, never a title on the label', () => {
    expect(drawerSource).not.toMatch(/<Label[^>]*\stitle=/);
    expect(drawerSource).toContain('HelpCircle');
  });

  it('FEAT-E02: the ruler group edits text size and the text→board gap', () => {
    act(() => typeInto(input('map-info-ruler-font'), '22'));
    act(() => typeInto(input('map-info-ruler-gap'), '12'));
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
    expect((onCommit.mock.calls[0]![0] as MapStyle).ruler).toEqual({ fontSize: 22, gap: 12 });
  });

  it('SPEC-E01: uses the规范 layer names', () => {
    const text = container.textContent ?? '';
    for (const label of [
      '画布外框',
      '网格分隔线',
      '鼠标光标框',
      '操作光标框',
      '区域轮廓线',
      '区域高亮线',
      '区域标签',
      '标尺',
    ]) {
      expect(text, label).toContain(label);
    }
  });

  /**
   */
  it('SPEC-K12: the map drawer carries no linkage palette', () => {
    expect(drawerSource).not.toContain('linkageColors');
    expect(drawerSource).not.toContain('characterSlots');
  });
});
