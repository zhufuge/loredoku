import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@loredoku/shared';
import { ThemesPage } from './ThemesPage';

/**
 * v0.8.2：系统配置 · 主题。
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：只留两条会咬人的 ——
 *
 * 1. 取数失败 ≠ 没有主题（错误态给重试，不劝人「先建一个」）；
 * 2. 新建弹窗里名字与编码各管各的（编码必填，提交的是手写的那串）。
 *
 * 「当前」徽标、识别色色带、卡片上的计数怎么排 —— 都是外观，界面还要改。
 */

const themesRef: {
  data: Theme[] | undefined;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
} = { data: undefined, isLoading: false, isError: false, error: null, refetch: () => undefined };

/** 新建主题的载荷留在这里，由各条用例自己看（默认什么都不做）。 */
const createRef: { fn: (payload: unknown) => Promise<void> } = {
  fn: () => Promise.resolve(),
};

vi.mock('@/hooks/useThemes', () => ({
  useThemes: () => themesRef,
  useCreateTheme: () => ({
    mutateAsync: (payload: unknown) => createRef.fn(payload),
    isPending: false,
  }),
}));

function theme(code: string, name: string, overrides: Partial<Theme> = {}): Theme {
  return {
    code,
    name,
    description: `${name}的描述`,
    data: { version: 1 },
    counts: { assets: 51, maps: 8, characters: 32, puzzles: 8, games: 6 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ThemesPage（v0.8.2）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const text = (): string => document.body.textContent ?? '';

  function render(): void {
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings/themes']}>
          <ThemesPage />
        </MemoryRouter>,
      );
    });
  }

  beforeEach(() => {
    themesRef.data = [theme('default', '默认'), theme('hlm', '红楼梦')];
    themesRef.isLoading = false;
    themesRef.isError = false;
    themesRef.error = null;
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('取数失败不是空态：给的是重试，不是「先建一个」', () => {
    themesRef.data = undefined;
    themesRef.isError = true;
    themesRef.error = new Error('数据库连不上');
    render();

    expect(text()).toContain('数据库连不上');
    expect(text()).not.toContain('还没有主题');
  });
});

/**
 * v0.8.3（docs/v0.8.3.md §14）：**名字与编码各管各的**。
 *
 * 上一版把名字小写化之后填进编码框：英文名看起来省事，中文名推出来是空串，于是
 * 同一个输入框在一半情况下「自己长出内容」。而编码是进地址与资源包的那个字符串，
 * 它该由作者定 —— 名字改了它也不会跟着改（创建后不可改）。
 */
describe('新建主题：名称不带动编码（v0.8.3 §14）', () => {
  let container: HTMLDivElement;
  let root: Root;

  const field = (id: string): HTMLInputElement | null =>
    document.querySelector<HTMLInputElement>(`#${id}`);
  const buttons = (): HTMLButtonElement[] => Array.from(document.querySelectorAll('button'));
  const createButton = (): HTMLButtonElement | undefined =>
    buttons().find((node) => node.textContent?.trim() === '创建');

  /** React 的 value tracker 会吞掉直接赋值，要走原型上的 setter。 */
  function type(input: HTMLInputElement | null, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(input, value);
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  beforeEach(() => {
    themesRef.data = [theme('default', '默认'), theme('hlm', '红楼梦')];
    themesRef.isLoading = false;
    themesRef.isError = false;
    themesRef.error = null;
    createRef.fn = () => Promise.resolve();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/settings/themes']}>
          <ThemesPage />
        </MemoryRouter>,
      );
    });
    // 打开弹窗 —— 这一组都在弹窗里操作。
    act(() => {
      buttons()
        .find((node) => node.textContent?.includes('新建主题'))
        ?.click();
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
  });

  it('输入名称时编码框不动', () => {
    type(field('theme-name'), 'hongloumeng');

    expect(field('theme-name')?.value).toBe('hongloumeng');
    expect(field('theme-code')?.value).toBe('');
  });

  it('编码是必填：只写名字时「创建」按不动', () => {
    type(field('theme-name'), '红楼梦');
    expect(createButton()?.disabled).toBe(true);

    type(field('theme-code'), 'hlm');
    expect(createButton()?.disabled).toBe(false);
  });

  it('提交的是作者自己写的编码，不是名字的转写', async () => {
    const payloads: unknown[] = [];
    createRef.fn = (payload) => {
      payloads.push(payload);
      return Promise.resolve();
    };

    type(field('theme-name'), '唐草');
    type(field('theme-code'), 'tang-chao');
    await act(async () => {
      createButton()?.click();
    });

    expect(payloads).toEqual([{ code: 'tang-chao', name: '唐草', description: null }]);
  });
});
