import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LINKAGE_COLORS } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';
import { PuzzleInfoDrawer, type PuzzleInfoDrawerHandle } from './PuzzleInfoDrawer';

/**
 * SPEC-K05 (docs/v0.5.0.md §4.2): the puzzle's 「基本信息」 is exactly two
 * blocks — 描述 and 联动主题色 — and it is a **form** (draft → 保存), the same
 * contract `MapInfoDrawer` follows (v0.3.9 FEAT-E01).
 *
 * The whole point of the spec is what is **not** here, so the first two cases
 * are reverse assertions against the map drawer's field names.
 */

const drawerSource =
  (import.meta.glob('./PuzzleInfoDrawer.tsx', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>)['./PuzzleInfoDrawer.tsx'] ?? '';

/** Strips `/* … *\/` doc comments so prose may name the fields it excludes. */
function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('PuzzleInfoDrawer (SPEC-K05)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: PuzzleInfoDrawerHandle | null;

  const palette: MapLinkageColor[] = DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  const slots: Array<CharacterSlotEntry | null> = [
    {
      characterId: 7,
      themeColor: '#FFFFFF',
      clue: '我不在中央',
      linkages: [{ type: 'region', id: 'rg_1', effect: 'highlight', color: palette[0]!.key }],
    },
    null,
  ];

  function render(): void {
    act(() => {
      root.render(
        <PuzzleInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          description="旧描述"
          linkageColors={palette}
          characterSlots={slots}
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

  const textarea = (): HTMLTextAreaElement =>
    container.querySelector<HTMLTextAreaElement>('textarea') as HTMLTextAreaElement;

  const save = (): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;

  it('SPEC-K05: only 描述 and 联动主题色 are present', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('描述');
    expect(text).toContain('联动主题色');
    // The map drawer's own blocks are gone for good.
    for (const gone of ['画布', '方格大小', '画布外框', '网格分隔线', '区域标签', '标尺']) {
      expect(text, gone).not.toContain(gone);
    }
  });

  it('SPEC-K05: the source carries none of the map style fields', () => {
    const code = stripBlockComments(drawerSource);
    for (const field of [
      'cellSize',
      'canvasFrame',
      'gridSeparator',
      'mouseCursorBox',
      'operationCursorBox',
      'regionLabel',
      'regionOutline',
      'regionHighlight',
      'ruler',
      'MapInfoDrawer',
    ]) {
      expect(code, field).not.toContain(field);
    }
  });

  it('editing the description marks the form dirty without touching the store', () => {
    expect(handle?.isDirty()).toBe(false);
    act(() => setValue(textarea(), '新的描述'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle?.isDirty()).toBe(true);
  });

  it('保存 commits description + palette + roster in one call', () => {
    act(() => setValue(textarea(), '新的描述'));
    act(() => save().click());
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as {
      description: string;
      linkageColors: MapLinkageColor[];
      characterSlots: Array<CharacterSlotEntry | null>;
    };
    expect(committed.description).toBe('新的描述');
    expect(committed.linkageColors).toEqual(palette);
    expect(committed.characterSlots).toEqual(slots);
  });

  it('取消 asks the page to close and never commits', () => {
    act(() => setValue(textarea(), '新的描述'));
    act(() => {
      container.querySelector<HTMLButtonElement>('footer button')?.click();
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it('the palette cannot drop below the 2-entry minimum', () => {
    const guarded = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.title.includes('至少保留'),
    );
    expect(guarded).toHaveLength(2);
    expect(guarded.every((button) => button.disabled)).toBe(true);
  });

  it('SPEC-K05: renaming a key re-points every linkage that used it', () => {
    const keyInput = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[aria-label="颜色标识"]'),
    )[0]!;
    act(() => setValue(keyInput, 'crimson'));
    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as {
      linkageColors: MapLinkageColor[];
      characterSlots: Array<CharacterSlotEntry | null>;
    };
    expect(committed.linkageColors[0]!.key).toBe('crimson');
    expect(committed.characterSlots[0]!.linkages?.[0]).toMatchObject({ color: 'crimson' });
  });

  it('the imperative handle drives save / discard for deferred switches', () => {
    act(() => setValue(textarea(), '新的描述'));
    expect(handle?.isDirty()).toBe(true);
    act(() => handle?.discard());
    expect(handle?.isDirty()).toBe(false);
    act(() => handle?.save());
    // Nothing left to save → it just asks the page to close.
    expect(onCommit).not.toHaveBeenCalled();
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });
});
