import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LINKAGE_COLORS, fileUrlFromPath } from '@loredoku/shared';
import type {
  CharacterSlotEntry,
  UploadedImage,
  MapLinkageColor,
} from '@loredoku/shared';
import { PuzzleInfoDrawer, type PuzzleInfoDrawerHandle } from './PuzzleInfoDrawer';

/**
 * SPEC-K05 (docs/v0.5.0.md §4.2): the puzzle's 「基本信息」 holds what the
 * puzzle owns — 名称 / 封面（v0.7.3）、描述、联动主题色 and (v0.6.3 §3)
 * 参与者布局 — and it is a **form** (draft → 保存), the same contract
 * `MapInfoDrawer` follows.
 */

function setValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    'value',
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

/** 其余用例不碰上传控件；给一个空实现把 props 补齐。 */
const noopUploadMark = vi.fn(async () => null);
/** v0.8.7 §7：三枚工具图标的上传同样是别处的活儿。 */
const noopUploadToolIcon = vi.fn(async () => null);

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
  function render(
    rosterCols: number | null = null,
    options: { name?: string; coverUrl?: string | null } = {},
  ): void {
    act(() => {
      root.render(
        <PuzzleInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          name={options.name ?? '午夜花园'}
          description="旧描述"
          clues={[]}
          ending=""
          linkageColors={palette}
          characterSlots={slots}
          rosterCols={rosterCols}
          mark={null}
          themeMark={null}
          toolIcons={null}
          themeToolIcons={null}
          onUploadToolIcon={noopUploadToolIcon}
          onUploadMark={noopUploadMark}
          coverUrl={options.coverUrl ?? null}
          coverFile={null}
          coverRemoved={false}
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

  it('SPEC-K05: holds 基本 / 参与者布局 / 联动主题色 and nothing from the map drawer', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('描述');
    expect(text).toContain('联动主题色');
    expect(text).toContain('参与者布局');
    // v0.7.3 §2: 名称与封面搬进来了。
    expect(text).toContain('名称');
    expect(text).toContain('封面');
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

/**
 * v0.7.3 §2：名称与封面搬进「基本信息」。名称进草稿（一个撤销步、随保存落库）；
 * 封面只交 `{ file, removed }` —— 上传是页面的第二步。
 */
describe('PuzzleInfoDrawer 基本块（v0.7.3 §2）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: PuzzleInfoDrawerHandle | null;

  const palette: MapLinkageColor[] = DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  const slots: Array<CharacterSlotEntry | null> = [{ characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] }];

  function render(options: { name?: string; coverUrl?: string | null } = {}): void {
    act(() => {
      root.render(
        <PuzzleInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          name={options.name ?? '午夜花园'}
          description="旧描述"
          clues={[]}
          ending=""
          linkageColors={palette}
          characterSlots={slots}
          rosterCols={null}
          mark={null}
          themeMark={null}
          toolIcons={null}
          themeToolIcons={null}
          onUploadToolIcon={noopUploadToolIcon}
          onUploadMark={noopUploadMark}
          coverUrl={options.coverUrl ?? null}
          coverFile={null}
          coverRemoved={false}
          onRequestClose={onRequestClose}
          onCommit={onCommit}
        />,
      );
    });
  }

  const nameInput = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>('#puzzle-info-name') as HTMLInputElement;
  const save = (): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;
  const coverInput = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>(
      'input[type="file"]:not(#puzzle-info-mark)',
    ) as HTMLInputElement;

  function pickCover(file: File): void {
    const input = coverInput();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  beforeEach(() => {
    handle = null;
    onCommit.mockClear();
    onRequestClose.mockClear();
    // jsdom 没有 URL.createObjectURL —— 封面预览会在这里炸掉整棵树。
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('carries the name and the cover picker', () => {
    const text = container.textContent ?? '';
    expect(text).toContain('名称');
    expect(text).toContain('封面');
    expect(nameInput().value).toBe('午夜花园');
    expect(coverInput()).not.toBeNull();
  });

  it('commits the name together with the rest', () => {
    act(() => setValue(nameInput(), '新名字'));
    expect(handle?.isDirty()).toBe(true);
    act(() => save().click());
    expect(onCommit).toHaveBeenCalledTimes(1);
    const committed = onCommit.mock.calls[0]![0] as {
      name: string;
      description: string;
      coverFile: File | null;
    };
    expect(committed.name).toBe('新名字');
    expect(committed.description).toBe('旧描述');
    expect(committed.coverFile).toBeNull();
  });

  it('refuses to commit without a name', () => {
    act(() => setValue(nameInput(), '   '));
    expect(save().disabled).toBe(true);
    expect(handle?.save()).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    // 页面据此把用户留在抽屉里补完，而不是顺手切走。
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it('hands a picked file over with the rest of the draft', () => {
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    pickCover(file);
    expect(handle?.isDirty()).toBe(true);
    act(() => save().click());
    expect((onCommit.mock.calls[0]![0] as { coverFile: File | null }).coverFile).toBe(file);
  });

  it('reports the stored cover being removed, and can take it back', () => {
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render({ coverUrl: '/files/puzzle-1.png' });

    const remove = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '移除',
    );
    act(() => remove?.click());
    expect(handle?.isDirty()).toBe(true);

    const restore = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === '恢复封面',
    );
    act(() => restore?.click());
    expect(handle?.isDirty()).toBe(false);
  });

  it('discard restores the committed name', () => {
    act(() => setValue(nameInput(), '新名字'));
    act(() => handle?.discard());
    expect(nameInput().value).toBe('午夜花园');
    expect(handle?.isDirty()).toBe(false);
  });
});

/**
 * v0.7.14（docs/v0.7.14.md §2）：题面 —— 全局线索（多条）与结束语。
 *
 * 钉的是**落库后的形状**：空行绝不进数据（否则游戏页会渲染出一行空白），
 * 顺序不能被打乱，结束语要 trim。增长上限在数据侧（`PUZZLE_CLUES_MAX_COUNT`），
 * 界面上表现为「新增」按不动而不是弹一句错。
 */
describe('PuzzleInfoDrawer 题面（v0.7.14）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: PuzzleInfoDrawerHandle | null;

  const palette: MapLinkageColor[] = DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  const slots: Array<CharacterSlotEntry | null> = [
    { characterId: 7, themeColor: '#FFFFFF', clue: '我不在中央', linkages: [] },
  ];

  function render(committed: { clues?: string[]; ending?: string } = {}): void {
    act(() => {
      root.render(
        <PuzzleInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          name="午夜花园"
          description="旧描述"
          clues={committed.clues ?? []}
          ending={committed.ending ?? ''}
          linkageColors={palette}
          characterSlots={slots}
          rosterCols={null}
          mark={null}
          themeMark={null}
          toolIcons={null}
          themeToolIcons={null}
          onUploadToolIcon={noopUploadToolIcon}
          onUploadMark={noopUploadMark}
          coverUrl={null}
          coverFile={null}
          coverRemoved={false}
          onRequestClose={onRequestClose}
          onCommit={onCommit}
        />,
      );
    });
  }

  function rerender(committed: { clues?: string[]; ending?: string } = {}): void {
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(committed);
  }

  const clueInputs = (): HTMLInputElement[] =>
    Array.from(container.querySelectorAll<HTMLInputElement>('input[aria-label^="第 "]'));
  const endingInput = (): HTMLTextAreaElement =>
    container.querySelector<HTMLTextAreaElement>('#puzzle-info-ending') as HTMLTextAreaElement;
  const addButton = (): HTMLButtonElement =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '新增线索',
    ) as HTMLButtonElement;
  const removeButtons = (): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.title === '删除该条线索',
    );
  const save = (): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;

  beforeEach(() => {
    handle = null;
    onCommit.mockClear();
    onRequestClose.mockClear();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render({ clues: ['同一行里没有重复编号', '阴影里没有编号'], ending: '灯灭了，花园还在。' });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('seeds the committed clues and ending', () => {
    expect(clueInputs().map((input) => input.value)).toEqual([
      '同一行里没有重复编号',
      '阴影里没有编号',
    ]);
    expect(endingInput().value).toBe('灯灭了，花园还在。');
    expect(handle?.isDirty()).toBe(false);
  });

  it('adds a row, and the committed list keeps the order', () => {
    act(() => addButton().click());
    expect(clueInputs()).toHaveLength(3);
    act(() => setValue(clueInputs()[2]!, '每条斜线上的编号都不同'));
    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as { clues: string[]; ending: string };
    expect(committed.clues).toEqual([
      '同一行里没有重复编号',
      '阴影里没有编号',
      '每条斜线上的编号都不同',
    ]);
    // 没动过的结束语原样带过去。
    expect(committed.ending).toBe('灯灭了，花园还在。');
  });

  it('removes the row that was clicked, not the last one', () => {
    act(() => removeButtons()[0]?.click());
    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as { clues: string[] };
    expect(committed.clues).toEqual(['阴影里没有编号']);
  });

  it('a freshly added but empty row is not an edit', () => {
    act(() => addButton().click());
    // 归一化之后两边都是同样两条 —— 不该凭空多出一个撤销步。
    expect(handle?.isDirty()).toBe(false);
    expect(save().disabled).toBe(true);
  });

  it('commits clues trimmed, and drops rows left blank', () => {
    act(() => addButton().click());
    act(() => setValue(clueInputs()[2]!, '   '));
    act(() => setValue(clueInputs()[0]!, '  改过的第一条  '));
    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as { clues: string[] };
    expect(committed.clues).toEqual(['改过的第一条', '阴影里没有编号']);
  });

  it('stops at the eight-clue ceiling instead of failing on save', () => {
    rerender({ clues: Array.from({ length: 8 }, (_, index) => `线索 ${index + 1}`), ending: '' });
    expect(clueInputs()).toHaveLength(8);
    expect(addButton().disabled).toBe(true);
    expect(addButton().title).toContain('最多 8 条');
  });

  it('trims the ending before it leaves the drawer', () => {
    act(() => setValue(endingInput(), '  灯灭了，花园还在。  '));
    expect(handle?.isDirty()).toBe(false);
    act(() => setValue(endingInput(), '  灯灭了。  '));
    act(() => save().click());
    expect((onCommit.mock.calls[0]![0] as { ending: string }).ending).toBe('灯灭了。');
  });
});

/**
 * v0.8.6 §4：标记 —— 玩家在游戏页标记排除项时显示的那枚符号。
 *
 * 抽屉负责「选图 → 立即上传 → 把返回的 path 写进本地草稿」这一段，与名称 / 描述
 * 同一个「保存」/ 撤销步；「移除」把草稿清回默认的 `×`（提交 `null`）。上传失败
 * 保留原值并给出提示，绝不静默。
 */
describe('PuzzleInfoDrawer 标记（v0.8.6 §4）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let handle: PuzzleInfoDrawerHandle | null;

  const palette: MapLinkageColor[] = DEFAULT_LINKAGE_COLORS.map((entry) => ({ ...entry }));
  const onCommit = vi.fn();
  const onRequestClose = vi.fn();
  const onUploadMark = vi.fn();
  const slots: Array<CharacterSlotEntry | null> = [
    { characterId: 7, themeColor: '#FFFFFF', clue: '', linkages: [] },
  ];
  const uploaded = {
    path: 'puzzles/1/forbidden-symbol/a.webp',
    url: '/api/files/puzzles/1/forbidden-symbol/a.webp',
  };

  function render(
    committed: UploadedImage | null = null,
    theme: UploadedImage | null = null,
  ): void {
    act(() => {
      root.render(
        <PuzzleInfoDrawer
          ref={(instance) => {
            handle = instance;
          }}
          open
          name="午夜花园"
          description="旧描述"
          clues={[]}
          ending=""
          linkageColors={palette}
          characterSlots={slots}
          rosterCols={null}
          mark={committed}
          themeMark={theme}
          toolIcons={null}
          themeToolIcons={null}
          onUploadToolIcon={noopUploadToolIcon}
          onUploadMark={onUploadMark}
          coverUrl={null}
          coverFile={null}
          coverRemoved={false}
          onRequestClose={onRequestClose}
          onCommit={onCommit}
        />,
      );
    });
  }

  /** 重新挂一棵干净的树（带着已提交的值），用于「有图」起始态。 */
  function remount(
    committed: UploadedImage | null,
    theme: UploadedImage | null = null,
  ): void {
    act(() => root.unmount());
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render(committed, theme);
  }

  function renderCommitted(
    committed: UploadedImage,
    theme: UploadedImage | null = null,
  ): void {
    remount(committed, theme);
  }

  const save = (): HTMLButtonElement =>
    container.querySelector<HTMLButtonElement>('footer button:last-child') as HTMLButtonElement;
  const fileInput = (): HTMLInputElement =>
    container.querySelector<HTMLInputElement>('#puzzle-info-mark') as HTMLInputElement;
  const preview = (): HTMLImageElement | null =>
    container.querySelector<HTMLImageElement>('[data-testid="mark-preview"]');
  const removeButton = (): HTMLButtonElement =>
    Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '移除',
    ) as HTMLButtonElement;
  const uploadError = (): HTMLElement | null =>
    container.querySelector<HTMLElement>('[role="alert"]');

  async function pickFile(file: File): Promise<void> {
    const input = fileInput();
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  beforeEach(() => {
    handle = null;
    onCommit.mockClear();
    onRequestClose.mockClear();
    onUploadMark.mockReset();
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('默认没有图：预览是 × 占位，也没调用上传', () => {
    expect(preview()).toBeNull();
    expect(onUploadMark).not.toHaveBeenCalled();
    expect(handle?.isDirty()).toBe(false);
  });

  it('有图时按 path 拼站内地址渲染预览', () => {
    const committed = { path: 'puzzles/1/forbidden-symbol/stored.webp' };
    renderCommitted(committed);
    expect(preview()?.getAttribute('src')).toBe(fileUrlFromPath(committed.path));
    // 已提交的值就是当前值：打开即不脏。
    expect(handle?.isDirty()).toBe(false);
  });

  /**
   * v0.8.7 §4：这一题没配就跟随主题 —— 预览必须画主题那张，否则作者在抽屉里看到
   * `×`、玩家在游戏页看到一张图。说明文字也要点明它从哪来。
   */
  it('这一题没配、主题配了：预览画主题那张，说明写着「跟随主题」', () => {
    const themeSymbol = { path: 'themes/3/forbidden-symbol/theme.webp' };
    remount(null, themeSymbol);

    const image = preview();
    expect(image?.getAttribute('src')).toBe(fileUrlFromPath(themeSymbol.path));
    expect(image?.getAttribute('data-source')).toBe('theme');
    // 跟随不是「已提交的值」—— 打开即不脏，也不能被当成这一题自己的配置。
    expect(handle?.isDirty()).toBe(false);
    expect(container.textContent).toContain('没有单独配置');
  });

  it('自己配了就用自己那张（覆盖主题），移除后回到跟随', () => {
    const own = { path: 'puzzles/1/forbidden-symbol/own.webp' };
    const themeSymbol = { path: 'themes/3/forbidden-symbol/theme.webp' };
    renderCommitted(own, themeSymbol);
    expect(preview()?.getAttribute('data-source')).toBe('puzzle');

    act(() => removeButton().click());
    // 草稿清了 → 预览回到主题那张，「移除」也随之不可再点。
    expect(preview()?.getAttribute('src')).toBe(fileUrlFromPath(themeSymbol.path));
    expect(preview()?.getAttribute('data-source')).toBe('theme');
    expect(removeButton().disabled).toBe(true);
  });

  it('选一张图 → 立即上传 → 保存时提交 { path }', async () => {
    onUploadMark.mockResolvedValue(uploaded);
    const file = new File(['x'], 'symbol.webp', { type: 'image/webp' });

    await pickFile(file);

    expect(onUploadMark).toHaveBeenCalledTimes(1);
    expect(onUploadMark).toHaveBeenCalledWith(file);
    // 上传成功只写抽屉草稿；点保存之前不碰页面。
    expect(onCommit).not.toHaveBeenCalled();
    expect(handle?.isDirty()).toBe(true);

    act(() => save().click());
    const committed = onCommit.mock.calls[0]![0] as {
      mark: UploadedImage | null;
    };
    expect(committed.mark).toEqual({ path: uploaded.path });
  });

  it('「移除」把草稿清回默认 ×，提交 null', () => {
    const committed = { path: 'puzzles/1/forbidden-symbol/stored.webp' };
    renderCommitted(committed);

    act(() => removeButton().click());
    expect(preview()).toBeNull();
    expect(handle?.isDirty()).toBe(true);
    act(() => save().click());
    const next = onCommit.mock.calls[0]![0] as {
      mark: UploadedImage | null;
    };
    expect(next.mark).toBeNull();
  });

  it('上传失败（回调返回 null）保留原值并给出错误提示', async () => {
    const committed = { path: 'puzzles/1/forbidden-symbol/stored.webp' };
    renderCommitted(committed);
    onUploadMark.mockResolvedValue(null);

    await pickFile(new File(['x'], 'symbol.webp', { type: 'image/webp' }));

    // 值没变：草稿仍等于已提交的那张，所以不算一次编辑。
    expect(handle?.isDirty()).toBe(false);
    expect(preview()?.getAttribute('src')).toBe(fileUrlFromPath(committed.path));
    // 失败不静默。
    expect(uploadError()).not.toBeNull();
    expect(save().disabled).toBe(true);
  });
});
