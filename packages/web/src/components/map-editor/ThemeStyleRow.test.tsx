import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MAP_STYLE, type MapStyle } from '@loredoku/shared';
import { ThemeStyleRow } from './ThemeStyleRow';

/**
 * v0.8.0（docs/v0.8.0.md §16.8）—— 「基本信息」抽屉底部那一行。
 *
 * 这个文件钉的是**两个方向**，因为方向就是这功能的全部：
 *
 * - `应用主题风格` → 改**本图**（写入抽屉草稿，落库仍等右上角「保存」）；
 * - `设为主题风格` → 改**主题**（本图成为缺省）。
 *
 * 以及 §16.8 里那条被改掉的判断：**常态也要有一行字**（无差异时不躲起来）。
 */

const themeRef: { data: unknown } = { data: undefined };
const mutateAsync = vi.fn(() => Promise.resolve());

vi.mock('@/hooks/useThemes', () => ({
  useThemeDetail: () => themeRef,
  useUpdateTheme: () => ({ mutateAsync, isPending: false }),
}));

function theme(style?: MapStyle): unknown {
  return {
    code: 'hlm',
    name: '红楼梦',
    description: null,
    data: { version: 1, ...(style ? { style } : {}) },
    counts: { assets: 49, maps: 8, characters: 32, puzzles: 8, games: 6 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const themeStyle: MapStyle = {
  ...DEFAULT_MAP_STYLE,
  gridSeparator: { width: 2, color: DEFAULT_MAP_STYLE.gridSeparator.color },
};

describe('ThemeStyleRow（§16.8）', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onApply = vi.fn();

  function render(style: MapStyle): void {
    act(() => {
      root.render(<ThemeStyleRow themeCode="hlm" style={style} onApplyThemeStyle={onApply} />);
    });
  }

  const text = (): string => document.body.textContent ?? '';

  const button = (label: string): HTMLButtonElement | undefined =>
    Array.from(document.querySelectorAll('button')).find((node) =>
      node.textContent?.includes(label),
    );

  beforeEach(() => {
    onApply.mockClear();
    mutateAsync.mockClear();
    themeRef.data = theme(themeStyle);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('常态也写出处 —— 作者要能确认「这张图吃的是主题风格」', () => {
    render(themeStyle);
    expect(text()).toContain('风格来自主题「红楼梦」');
    expect(text()).toContain('与主题一致');
  });

  it('有差异时说出项数，而且只数不同项', () => {
    render({ ...themeStyle, gridSeparator: { width: 5, color: themeStyle.gridSeparator.color } });
    expect(text()).toContain('与主题 1 项不同');
  });

  it('差异弹窗按分组列出不同的项（主题值 → 本图值）', () => {
    render({ ...themeStyle, gridSeparator: { width: 5, color: themeStyle.gridSeparator.color } });
    act(() => button('查看差异')?.click());

    expect(text()).toContain('网格分隔线线宽');
    expect(text()).toContain('2px');
    expect(text()).toContain('5px');
    // 相同的项不列 —— 二十几项全列出来没人看。
    expect(text()).not.toContain('标尺字号');
  });

  it('「应用主题风格」把主题那份交回给抽屉草稿（本图方向）', () => {
    render({ ...themeStyle, gridSeparator: { width: 5, color: themeStyle.gridSeparator.color } });
    act(() => button('查看差异')?.click());
    act(() => button('应用主题风格')?.click());

    expect(onApply).toHaveBeenCalledWith(themeStyle);
  });

  it('「设为主题风格」写主题的 data.style（主题方向，整份 data 回写）', () => {
    const own: MapStyle = { ...themeStyle, gridSeparator: { width: 5, color: '#123456' } };
    render(own);
    act(() => button('查看差异')?.click());
    act(() => button('设为主题风格')?.click());

    expect(mutateAsync).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 1, style: own }),
    });
  });

  it('主题还没有缺省风格时只说一句实话，并只给「设为主题风格」', () => {
    themeRef.data = theme();
    render(themeStyle);

    expect(text()).toContain('主题还没有初始样式');
    act(() => button('风格')?.click());

    expect(button('设为主题风格')).toBeDefined();
    // 「应用主题风格」那时无从取值。
    expect(button('应用主题风格')).toBeUndefined();
  });

  /**
   * v0.10.2：方格大小不属于主题设置 —— 它是这张图自己的尺寸，两张图天然会不一样。
   * 差异弹窗列它，等于把「一张图自己的事」报成「与主题风格不同」。
   */
  it('方格大小不参与比对 —— 不报差异、不列进弹窗', () => {
    render({ ...themeStyle, cellSize: 146 });
    expect(text()).toContain('与主题一致');

    act(() => button('风格')?.click());
    expect(text()).not.toContain('方格大小');
  });

  it('差异弹窗不因方格大小而整块列出来', () => {
    render({ ...themeStyle, cellSize: 168 });
    expect(text()).toContain('与主题一致');
  });

  it('「应用主题风格」不改本图的方格大小，只灌看得见的项', () => {
    const mine: MapStyle = { ...themeStyle, cellSize: 146, gridSeparator: { width: 5, color: themeStyle.gridSeparator.color } };
    render(mine);
    act(() => button('查看差异')?.click());
    act(() => button('应用主题风格')?.click());

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ cellSize: 146, gridSeparator: themeStyle.gridSeparator }),
    );
  });

  it('「设为主题风格」不把本图的方格大小写进主题', () => {
    render({ ...themeStyle, cellSize: 146 });
    act(() => button('风格')?.click());
    act(() => button('设为主题风格')?.click());

    expect(mutateAsync).toHaveBeenCalledWith({
      data: expect.objectContaining({
        style: expect.objectContaining({ cellSize: null }),
      }),
    });
  });
});
