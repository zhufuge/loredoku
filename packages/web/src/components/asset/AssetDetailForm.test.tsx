import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant } from '@loredoku/shared';
import { AssetDetailForm } from './AssetDetailForm';

/**
 * v0.6.1 (docs/v0.6.1.md §8.4): the detail pane splits into 资源区 and 形态区.
 * These are render-only assertions — what differs between an asset with one
 * variant, an asset with several, and a background:
 *
 * - one card per variant;
 * - 添加形态 / 删除 are offered to both types;
 * - 删除 disabled on the last variant;
 * - no footprint inputs on any card (v0.7.6 removed them from the data too).
 */

function variant(id: number, assetId: number, overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id,
    assetId,
    name: '默认',
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    bgColor: '#CCCCCC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(variants: AssetVariant[], overrides: Partial<Asset> = {}): Asset {
  return {
    id: 1,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: false,
    isActive: true,
    variants,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('AssetDetailForm — 形态管理区（v0.6.1 §8.4）', () => {
  let container: HTMLDivElement;
  let root: Root;
  let queryClient: QueryClient;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    queryClient.clear();
  });

  function render(value: Asset): void {
    act(() => {
      root.render(
        <QueryClientProvider client={queryClient}>
          <AssetDetailForm asset={value} onRequestDelete={vi.fn()} />
        </QueryClientProvider>,
      );
    });
  }

  function buttons(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('button')];
  }

  function buttonByText(text: string): HTMLButtonElement | undefined {
    return buttons().find((button) => (button.textContent ?? '').includes(text));
  }

  it('renders one card per variant', () => {
    render(asset([variant(11, 1, { name: '关闭' }), variant(12, 1, { name: '打开' })]));
    expect(container.textContent).toContain('形态 · 关闭');
    expect(container.textContent).toContain('形态 · 打开');
    expect(buttons().filter((button) => (button.textContent ?? '') === '保存形态')).toHaveLength(2);
  });

  it('offers 添加形态 to a background asset as well', () => {
    render(asset([variant(11, 1)], { type: 'background', blocking: false }));
    expect(buttonByText('添加形态')).toBeDefined();
  });

  it('disables 删除 on the last variant and enables it once there are two', () => {
    render(asset([variant(11, 1)]));
    expect(buttonByText('删除')?.disabled).toBe(true);

    act(() => root.unmount());
    root = createRoot(container);
    render(asset([variant(11, 1), variant(12, 1, { name: '打开' })]));
    expect(buttonByText('删除')?.disabled).toBe(false);
  });

  it('has no footprint inputs and no layer subtitle any more (v0.7.6 / v0.7.7)', () => {
    render(asset([variant(11, 1)], { type: 'background', blocking: false }));
    expect(container.textContent).not.toContain('占格宽');
    expect(container.textContent).not.toContain('占格高');
    // v0.7.7: 层类型在页面顶部说一次就够了，卡片上不再重复。
    expect(container.textContent).not.toContain('背景层：每格铺满');
    expect(container.textContent).not.toContain('物品层：放置后占');
  });

  it('folds a variant card down to its title (v0.7.7)', () => {
    render(asset([variant(11, 1, { name: '关闭' })]));
    expect(container.querySelector('[aria-label="收起形态"]')).not.toBeNull();
    expect(container.textContent).toContain('形态名称');

    act(() => container.querySelector<HTMLButtonElement>('[aria-label="收起形态"]')?.click());

    // 收起态只剩标题：表单字段与保存都不在。
    expect(container.textContent).toContain('形态 · 关闭');
    expect(container.textContent).not.toContain('形态名称');
    expect(buttonByText('保存形态')).toBeUndefined();
    expect(container.querySelector('[aria-label="展开形态"]')).not.toBeNull();
  });

  /**
   * v0.7.13 fix：启用 / 停用、增删形态都会让资源重取（`updatedAt` 变），
   * 表单不该跟着回滚 —— 否则「改完名字点了停用，名字自己变回去」。
   */
  it('keeps an unsaved rename when the asset refreshes', () => {
    render(asset([variant(11, 1)]));
    const input = container.querySelector<HTMLInputElement>('input');
    // React 的 value tracker 会吞掉直接赋值，要走原型上的 setter。
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, '改名之后');
    act(() => input?.dispatchEvent(new Event('input', { bubbles: true })));

    render(asset([variant(11, 1)], { updatedAt: '2026-01-02T00:00:00.000Z' }));

    expect(container.querySelector<HTMLInputElement>('input')?.value).toBe('改名之后');
  });
});
