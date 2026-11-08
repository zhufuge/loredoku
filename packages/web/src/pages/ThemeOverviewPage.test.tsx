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
const uploadForbiddenMutate = vi.fn((_file: File) => Promise.resolve());
const removeForbiddenMutate = vi.fn(() => Promise.resolve());

vi.mock('@/components/layout/WorkspaceContext', () => ({
  useWorkspace: () => workspaceRef.value,
}));
vi.mock('@/hooks/useThemes', () => ({
  useUpdateTheme: () => ({ mutateAsync: updateMutate, isPending: false }),
  useDeleteTheme: () => ({ mutateAsync: deleteMutate, isPending: false }),
  useUploadThemeForbiddenSymbol: () => ({ mutate: uploadForbiddenMutate, isPending: false }),
  useRemoveThemeForbiddenSymbol: () => ({ mutate: removeForbiddenMutate, isPending: false }),
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
    uploadForbiddenMutate.mockClear();
    removeForbiddenMutate.mockClear();
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
   * v0.8.6 §4：主题级的「禁止符号」缺省。数据里只存 `storage/uploads` 下的相对
   * 路径，页面用 `fileUrlFromPath` 拼成站内地址 —— 存绝对地址换个端口就指到别人的
   * 服务器。有缺省时预览那张图；没有时新建谜题仍是默认的 `×`，只给上传入口。
   */
  it('主题配了禁止符号：渲染那张图的站内地址，不给「上传图片」按钮', () => {
    render({
      ...themeRef,
      data: {
        version: 1,
        forbiddenSymbol: { path: 'themes/3/forbidden-symbol/mark.webp' },
      },
    });

    const image = document.querySelector<HTMLImageElement>('img[alt="禁止符号"]');
    expect(image?.getAttribute('src')).toBe('/api/files/themes/3/forbidden-symbol/mark.webp');
    expect(button('上传图片')).toBeUndefined();
    expect(button('移除')).toBeDefined();
  });

  it('主题没配禁止符号：给上传入口，选好文件立刻上传（即时保存，不需要再点保存）', () => {
    render();
    expect(button('上传图片')).toBeDefined();
    expect(document.querySelector('img[alt="禁止符号"]')).toBeNull();

    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['symbol'], 'mark.webp', { type: 'image/webp' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    act(() => {
      input?.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(uploadForbiddenMutate).toHaveBeenCalledTimes(1);
    expect(uploadForbiddenMutate.mock.calls[0]?.[0]).toBe(file);
    // 上传不等于「编辑后保存」：页面不该顺带调用主题更新。
    expect(updateMutate).not.toHaveBeenCalled();
    expect(removeForbiddenMutate).not.toHaveBeenCalled();
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
