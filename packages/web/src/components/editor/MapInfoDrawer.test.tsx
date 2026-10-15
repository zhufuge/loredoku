import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_STYLE } from '@murdoku/shared';
import type { MapStyle } from '@murdoku/shared';
import { MapInfoDrawer, type MapInfoDrawerHandle } from './MapInfoDrawer';
import { resolveMapStyle } from '@/lib/mapStyle';

/**
 * FEAT-E01 (docs/v0.3.9.md §3): the 「地图基本信息」drawer is a **form** — every
 * control writes a local draft and the map only changes when 保存 is pressed.
 * These are real render tests (jsdom + `react-dom/client`), because the whole
 * point of the fix is that editing no longer touches the store.
 */

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

describe('MapInfoDrawer (FEAT-E01)', () => {
  let container: HTMLDivElement;
  let root: Root;

  const style: MapStyle = resolveMapStyle(undefined);
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  const onRequestResize = vi.fn();
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
          characterSlots={[]}
          onRequestClose={onRequestClose}
          onCommit={onCommit}
          onRequestResize={onRequestResize}
        />,
      );
    });
  }

  beforeEach(() => {
    handle = null;
    onCommit.mockClear();
    onRequestClose.mockClear();
    onRequestResize.mockClear();
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

  it('画布尺寸 goes straight to the resize flow (its own confirmation)', () => {
    act(() => typeInto(input('map-info-grid-size'), '9'));
    expect(onRequestResize).toHaveBeenCalledWith(9);
    // It is not part of the draft.
    expect(handle?.isDirty()).toBe(false);
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
      '联动主题色',
    ]) {
      expect(text, label).toContain(label);
    }
    // The pre-v0.3.9 wording is gone.
    expect(text).not.toContain('边框 border');
    expect(text).not.toContain('当前鼠标所在框');
    expect(text).not.toContain('2~24');
  });

  it('FEAT-E04/SPEC-E01: the linkage palette edits stay in the draft', () => {
    const before = container.querySelectorAll('[aria-label$="名称"]').length;
    const addButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('新增颜色'),
    );
    act(() => addButton?.click());
    expect(container.querySelectorAll('[aria-label$="名称"]').length).toBe(before + 1);
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button:last-child')?.click();
    });
    expect((onCommit.mock.calls[0]![0] as MapStyle).linkageColors).toHaveLength(3);
  });
});
