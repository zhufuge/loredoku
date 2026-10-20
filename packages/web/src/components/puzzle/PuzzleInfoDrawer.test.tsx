import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LINKAGE_COLORS } from '@loredoku/shared';
import type { CharacterSlotEntry, MapLinkageColor } from '@loredoku/shared';
import { PuzzleInfoDrawer, type PuzzleInfoDrawerHandle } from './PuzzleInfoDrawer';

/**
 * SPEC-K05 (docs/v0.5.0.md §4.2): the puzzle's 「基本信息」 holds what the
 * puzzle owns — 描述, 联动主题色 and (v0.6.3 §3) 参与者布局 — and it is a
 * **form** (draft → 保存), the same contract `MapInfoDrawer` follows.
 */

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
  /**
   * Seven slots — one past the column maximum, so a clamp to 6 can be told
   * apart from a clamp to the roster size (which would allow 7).
   */
  const slots: Array<CharacterSlotEntry | null> = [
    {
      characterId: 7,
      themeColor: '#FFFFFF',
      clue: '我不在中央',
      linkages: [{ type: 'region', id: 'rg_1', effect: 'highlight', color: palette[0]!.key }],
    },
    null,
    null,
    null,
    null,
    null,
    null,
  ];

  /** v0.6.3 §3: the column count is a prop, so the fixture can drive it. */
  function render(rosterCols: number | null = null): void {
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
          rosterCols={rosterCols}
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

  /** v0.6.3 §3: the column field and the live × 行数 readout. */
  const colsInput = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(
      'input[aria-label="参与者列数"]',
    ) as HTMLInputElement;

  const layoutPreview = (): string =>
    container.querySelector('[data-testid="roster-layout-preview"]')?.textContent ?? '';

  it('SPEC-K05: only 描述 / 联动主题色 / 参与者布局 are present', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('描述');
    expect(text).toContain('联动主题色');
    expect(text).toContain('参与者布局');
    // The map drawer's own blocks are gone for good.
    for (const gone of ['画布', '方格大小', '画布外框', '网格分隔线', '区域标签', '标尺']) {
      expect(text, gone).not.toContain(gone);
    }
    // v0.6.3: the roster block is the bare control — no 列数 label (the field
    // carries the number) and no participant-count hint under it.
    expect(text).not.toContain('列数');
    expect(text).not.toContain('位参与者');
    expect(text).not.toContain('保存后参与者面板按此排列');
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

  // ---- v0.6.3 §3: 参与者布局 ----
  it('v0.6.3 §3.2: shows the automatic layout until a column count is typed', () => {
    // 7 participants → the golden-ratio layout is 2 × 4.
    expect(layoutPreview()).toContain('2 × 4');
    expect(layoutPreview()).toContain('自动');
    act(() => setValue(colsInput(), '3'));
    // The field carries the column count, so the readout is just the rows.
    expect(layoutPreview()).toContain('× 3');
    expect(layoutPreview()).not.toContain('自动');
  });

  it('v0.6.3 §3.2: clamps to the column maximum, then to the roster, and empties back to 自动', () => {
    // 99 → 6, not 7: the field's own maximum bites before the roster size.
    act(() => setValue(colsInput(), '99'));
    expect(layoutPreview()).toContain('× 2');
    expect(colsInput().value).toBe('6');
    act(() => setValue(colsInput(), '0'));
    expect(layoutPreview()).toContain('× 7');
    act(() => setValue(colsInput(), ''));
    expect(layoutPreview()).toContain('自动');
  });

  it('v0.6.3 §3.2: the column count is drafted, then committed with the rest', () => {
    expect(handle?.isDirty()).toBe(false);
    act(() => setValue(colsInput(), '3'));
    // Nothing reaches the store before 保存.
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle?.isDirty()).toBe(true);
    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as { rosterCols: number | null };
    expect(committed.rosterCols).toBe(3);
  });

  it('v0.6.3 §3.2: 取消 leaves the drafted column count behind', () => {
    act(() => setValue(colsInput(), '3'));
    act(() => handle?.discard());
    expect(colsInput().value).toBe('');
    expect(handle?.isDirty()).toBe(false);
  });

  it('v0.6.3 §3.2: a stored column count seeds the field on mount', () => {
    // The draft is seeded when the drawer opens, not when the prop changes —
    // the same contract 描述 and 联动主题色 follow, so switching tabs with
    // unsaved edits never loses them silently.
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(3);
    expect(colsInput().value).toBe('3');
    expect(layoutPreview()).toContain('× 3');
    expect(handle?.isDirty()).toBe(false);
  });
});
