import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_STYLE, type Theme } from '@loredoku/shared';
import { ThemeOverviewPage } from './ThemeOverviewPage';

/**
 * v0.8.3：概览页只回答两件事 —— 「这个空间是什么」与「它按什么规矩长」。
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：这里只留**写回数据的契约** —— 缺省风格改成
 * `data.style`、难度分级改成 `data.difficultyLevels`（含两条边界：什么都没改就
 * 不带这个键、恢复内置五档是删键而不是写一份一样的数组），以及「还有东西的
 * 主题删不掉」。
 *
 * 五格计数、信息卡四行、页头有哪两个按钮、清单里列了哪几组、识别色怎么显示 ——
 * 全是文案与布局，界面还要改，钉在这里只会每天早上叫一次。
 */

const themeRef: Theme = {
  code: 'hlm',
  name: '红楼梦',
  description: '大观园里的推理。',
  data: { version: 1 },
  counts: { assets: 49, maps: 8, characters: 32, puzzles: 8, games: 6 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const workspaceRef: { value: unknown } = { value: null };
const deleteMutate = vi.fn(() => Promise.resolve());
const updateMutate = vi.fn((_payload: unknown) => Promise.resolve());
const uploadMarkMutate = vi.fn((_file: File) => Promise.resolve());
const removeMarkMutate = vi.fn(() => Promise.resolve());
/** v0.8.7 §7：三枚工具图标的上传参数是 `{ icon, file }`。 */
const uploadToolIconMutate = vi.fn((_payload: unknown) => Promise.resolve());
const removeToolIconMutate = vi.fn((_icon: unknown) => Promise.resolve());
/** v0.9.2 §2：计时环只有一张，上传收 `File`、移除不收参数。 */
const uploadRingMutate = vi.fn((_file: File) => Promise.resolve());
const removeRingMutate = vi.fn(() => Promise.resolve());
/** v0.9.3 §3：校验样式 —— 改颜色收一个 patch，圈图同标记那样上传 / 移除。 */
const updateCheckStyleMutate = vi.fn((_patch: unknown) => Promise.resolve());
const uploadCheckRingMutate = vi.fn((_file: File) => Promise.resolve());
const removeCheckRingMutate = vi.fn(() => Promise.resolve());

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));
vi.mock('@/hooks/useThemes', () => ({
  useUpdateTheme: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeleteTheme: () => ({ mutateAsync: deleteMutate, isPending: false }),
  useUploadThemeMark: () => ({ mutate: uploadMarkMutate, isPending: false }),
  useRemoveThemeMark: () => ({ mutate: removeMarkMutate, isPending: false }),
  /** v0.8.7 §7：工具按钮图标卡片的三枚各自上传 / 移除，这里只需要「没在忙」。 */
  useUploadThemeToolIcon: () => ({ mutate: uploadToolIconMutate, isPending: false }),
  useRemoveThemeToolIcon: () => ({ mutate: removeToolIconMutate, isPending: false, variables: undefined }),
  /** v0.9.2 §2：长按计时环那一张，只有上传 / 移除两个动作。 */
  useUploadThemeRing: () => ({ mutate: uploadRingMutate, isPending: false }),
  useRemoveThemeRing: () => ({ mutate: removeRingMutate, isPending: false }),
  /** v0.9.3 §3：两档颜色走同一个 mutate。 */
  useUpdateThemeCheckStyle: () => ({ mutate: updateCheckStyleMutate, isPending: false }),
}));

describe('ThemeOverviewPage（v0.8.3）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';
  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find(
      (node) =>
        node.textContent?.trim() === label ||
        node.textContent?.trim().includes(label) === true ||
        node.getAttribute('aria-label')?.includes(label) === true,
    );

  function render(theme: Theme = themeRef): void {
    workspaceRef.value = {
      theme,
      themes: [theme],
      themeCode: theme.code,
      href: (module: string) => `/hlm/${module}`,
    };
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/hlm/overview']}>
          <ThemeOverviewPage />
        </MemoryRouter>,
      );
    });
  }

  /** 改一个输入框的值。React 认原型上的 setter，直接赋值它看不见。 */
  function type(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  beforeEach(() => {
    deleteMutate.mockClear();
    updateMutate.mockClear();
    uploadMarkMutate.mockClear();
    removeMarkMutate.mockClear();
    uploadToolIconMutate.mockClear();
    removeToolIconMutate.mockClear();
    uploadRingMutate.mockClear();
    removeRingMutate.mockClear();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('编辑地图初始样式：改一项线宽，保存写回 data.style（其余键原样带着）', () => {
    render();
    act(() => button('编辑地图初始样式')?.click());

    const width = document.querySelector<HTMLInputElement>('#theme-style-gridSeparator\\.width');
    expect(width).not.toBeNull();
    type(width as HTMLInputElement, '4');
    act(() => button('保存')?.click());

    expect(updateMutate).toHaveBeenCalledTimes(1);
    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { version: number; style: { gridSeparator: { width: number } } };
    };
    expect(payload.data.version).toBe(1);
    expect(payload.data.style.gridSeparator.width).toBe(4);
  });

  it('编辑难度分级：加一档后保存，写回 data.difficultyLevels', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('添加一档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ level: number; label: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(6);
    // 档位数字接在最大一档后面 —— 不补空档，那个数字可能还被某条部署指着。
    expect(payload.data.difficultyLevels?.[5]).toEqual({ level: 6, label: '第 6 档' });
  });

  /**
   * 颜色是**可选**的：选了才写进 `data`。而「改了色」必须让它不再等于内置五档 ——
   * 否则 `isBuiltIn` 会把 `difficultyLevels` 删掉，保存后颜色跟着没了，界面上就是
   * 「改了色但没生效」（同一个坑 v0.8.3 在名字上踩过一次）。
   */
  it('改一档的颜色：hex 提交后写回带 color 的那一档', () => {
    render();
    act(() => button('编辑难度分级')?.click());

    const hex = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[aria-label="第 1 档颜色（hex）"]',
    ) as HTMLInputElement;
    expect(hex).not.toBeNull();
    type(hex, '#7c3aed');
    act(() => {
      hex.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ level: number; label: string; color?: string }> };
    };
    expect(payload.data.difficultyLevels?.[0]?.color).toBe('#7C3AED');
    expect(payload.data.difficultyLevels?.[1]?.color).toBeUndefined();
  });

  /**
   * v0.8.6 §1：方格大小从清单里拿掉了，「恢复默认」就不能再顺手把它拨回 `null`。
   * 作者看不见那一项，也改不到它 —— 那它就不该被改掉。
   */
  it('恢复默认只动清单上的字段，方格大小原样写回', () => {
    render({
      ...themeRef,
      data: {
        version: 1,
        style: {
          ...DEFAULT_MAP_STYLE,
          cellSize: 48,
          gridSeparator: { width: 9, color: '#000000' },
        },
      },
    });
    act(() => button('编辑地图初始样式')?.click());
    act(() => button('恢复默认')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { style: { cellSize: number | null; gridSeparator: { width: number } } };
    };
    expect(payload.data.style.cellSize).toBe(48);
    expect(payload.data.style.gridSeparator).toEqual(DEFAULT_MAP_STYLE.gridSeparator);
  });

  /**
   * 回归：改名字**不改 key**，所以第一版那道 `isBuiltIn` 判断（只比 key）把这次
   * 编辑当成了「还是内置五档」，`difficultyLevels` 被删掉 → 保存后名字又变回去。
   * 作者看到的就是「保存不生效」。名字恰恰是这一屏唯一能自定义的东西之一。
   */
  it('只改名字也要写回 —— 名字正是要存的东西', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    const input = document.querySelector<HTMLInputElement>(
      '[role="dialog"] input[aria-label="第 1 档名称"]',
    ) as HTMLInputElement;
    type(input, '入门');
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as {
      data: { difficultyLevels?: Array<{ level: number; label: string; color?: string }> };
    };
    expect(payload.data.difficultyLevels).toHaveLength(5);
    expect(payload.data.difficultyLevels?.[0]).toEqual({ level: 1, label: '入门' });
  });

  it('什么都没改就保存，不带 difficultyLevels —— 等同「没配过」', () => {
    render();
    act(() => button('编辑难度分级')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  /**
   * 「恢复内置五档」不是写一份和内置一模一样的数组 —— 它把 `difficultyLevels`
   * 这个键**删掉**，回到「没配过」。以后内置改了，这类主题跟着改。
   */
  it('恢复内置五档后保存，payload 里没有 difficultyLevels 这个键', () => {
    render({
      ...themeRef,
      data: { version: 1, difficultyLevels: [{ level: 1, label: '热身' }] },
    });
    act(() => button('编辑难度分级')?.click());
    act(() => button('恢复内置五档')?.click());
    act(() => button('保存')?.click());

    const payload = updateMutate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect('difficultyLevels' in payload.data).toBe(false);
  });

  /**
   * v0.9.5：**操作提示**这一张卡把五项并到一起（标记 / 清除 / 回退 / 提交 / 圆环）。
   *
   * 这几条钉的是数据契约而不是排版：哪一项配了、页面就拿那项的地址去画，
   * 点上传 / 移除就直接发请求（即时保存，没有「编辑 → 保存」那一层）。
   */
  it('五项都在同一张卡里：标记、清除、回退、提交、圆环', () => {
    render();

    // 每一行都挂着自己的 testid —— 行名就是数据键。
    for (const key of ['mark', 'clear', 'undo', 'submit', 'ring']) {
      expect(document.querySelector(`[data-testid="marks-row-${key}"]`)).not.toBeNull();
    }
  });

  it('配了标记：渲染那张图的站内地址，不给「上传」按钮但给「移除」', () => {
    render({
      ...themeRef,
      data: { version: 1, mark: { path: 'themes/3/mark/mark.webp' } },
    });

    const image = document.querySelector<HTMLImageElement>('img[alt="标记"]');
    expect(image?.getAttribute('src')).toBe('/api/files/themes/3/mark/mark.webp');
    const row = document.querySelector('[data-testid="marks-row-mark"]');
    expect(row?.textContent).not.toContain('上传');
    expect(row?.textContent).toContain('移除');
  });

  it('没配标记：给上传入口，选好文件立刻上传（不需要再点保存）', () => {
    render();
    const row = document.querySelector('[data-testid="marks-row-mark"]');
    expect(row?.textContent).toContain('上传');
    expect(document.querySelector('img[alt="标记"]')).toBeNull();

    // 第一个隐藏 file input 是标记那一项（顺序：mark → 三枚图标 → ring）。
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['mark'], 'mark.webp', { type: 'image/webp' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(uploadMarkMutate).toHaveBeenCalledTimes(1);
    expect(uploadMarkMutate.mock.calls[0]?.[0]).toBe(file);
    // 上传不等于「编辑后保存」：页面不该顺带调用主题更新。
    expect(updateMutate).not.toHaveBeenCalled();
    expect(removeMarkMutate).not.toHaveBeenCalled();
  });

  /**
   * v0.9.2 §2；v0.9.5：**那一圈** —— 长按计时环与提交校验圈共用一张图。
   *
   * 这一条同时守住合并本身：配一次，两个消费点都读它；页面里只有一个圆环入口。
   */
  it('圆环：配一次两处共用，移除直接发请求', () => {
    render();
    expect(button('上传')).toBeDefined();
    expect(document.querySelector('img[alt="圆环"]')).toBeNull();

    render({
      ...themeRef,
      data: { version: 1, ring: { image: { path: 'themes/3/ring/ring.webp' } } },
    });

    const image = document.querySelector<HTMLImageElement>('img[alt="圆环"]');
    expect(image?.getAttribute('src')).toBe('/api/files/themes/3/ring/ring.webp');

    // 只有一行「圆环」—— 合并之后不该再出现第二个圆环入口。
    expect(document.querySelectorAll('[data-testid="marks-row-ring"]')).toHaveLength(1);

    const row = document.querySelector('[data-testid="marks-row-ring"]');
    const remove = Array.from(row?.querySelectorAll('button') ?? []).find(
      (node) => node.textContent?.includes('移除') === true,
    );
    act(() => remove?.click());
    expect(removeRingMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate).not.toHaveBeenCalled();
  });

  /** 校验的颜色还在（圈图搬走了，颜色是它自己的那一半）。 */
  it('两档校验颜色仍在，改一项只发一个 patch', () => {
    render({
      ...themeRef,
      data: { version: 1, checkStyle: { passColor: '#123456', failColor: '#654321' } },
    });

    expect(document.querySelector('[aria-label*="校验通过色"]')).not.toBeNull();
    expect(document.querySelector('[aria-label*="校验未通过色"]')).not.toBeNull();
  });

  it('主题里还有东西时「删除」不可点 —— 先把数量说清楚再拦', () => {
    render();
    act(() => button('删除主题')?.click());

    expect(text()).toContain('主题下还有 49 个资源');
    const confirm = Array.from(document.querySelectorAll('button')).find(
      (node) => node.textContent?.trim() === '删除',
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });
});
