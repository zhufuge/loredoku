import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant, EditorLayer } from '@loredoku/shared';
import { AssetPalette } from './AssetPalette';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * v0.6.1 (docs/v0.6.1.md §8.5): the tiles are **variants** — a chest with
 * 「关闭」 and 「打开」 offers two tiles, and searching 「打开」 finds it. The
 * background layer works the same way: a background asset may own several
 * variants, and each look is its own tile.
 *
 * v0.7.6: the tile no longer prints a footprint (a variant does not have one).
 * Several variants → the tile reads the variant name; a single variant → 「1 格」.
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

function asset(id: number, variants: AssetVariant[], overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    code: `a_${id}`,
    name: `资源 ${id}`,
    type: 'item',
    blocking: false,
    isActive: true,
    variants,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const chest = asset(1, [
  variant(11, 1, { name: '关闭' }),
  variant(12, 1, { name: '打开' }),
]);
const tree = asset(2, [variant(21, 2, { name: '默认' })]);
const grass = asset(3, [variant(31, 3, { name: '草地' }), variant(32, 3, { name: '沙地' })], {
  type: 'background',
  name: '地表',
});

describe('AssetPalette — 形态瓦片（v0.6.1 §8.5）', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(layer: EditorLayer, assets: Asset[], keyword?: string): void {
    act(() => {
      root.render(
        <AssetPalette
          assets={assets}
          isLoading={false}
          isError={false}
          activeLayer={layer}
          selectedAssetId={null}
          selectedVariantId={null}
          onSelect={vi.fn()}
        />,
      );
    });
    if (keyword !== undefined) {
      const input = container.querySelector('input');
      if (!input) throw new Error('search input not found');
      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(input),
        'value',
      )?.set;
      setter?.call(input, keyword);
      act(() => {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
  }

  function tiles(): HTMLButtonElement[] {
    // v0.10.2：搜索框自带一枚 × 清空按钮，它也是 `button` —— 只数瓦片。
    return [...container.querySelectorAll<HTMLButtonElement>('button')].filter(
      (node) => node.getAttribute('aria-label') !== '清空搜索',
    );
  }

  it('gives every variant its own tile on the item layer', () => {
    render('item', [chest, tree]);
    // chest 2 + tree 1
    expect(tiles()).toHaveLength(3);
  });

  it('labels a multi-variant asset with the variant name', () => {
    render('item', [chest]);
    const labels = tiles().map((tile) => tile.textContent ?? '');
    expect(labels[0]).toContain('关闭');
    expect(labels[0]).not.toContain('×');
    expect(labels[1]).toContain('打开');
    expect(labels[1]).not.toContain('×');
  });

  it('keeps a single-variant asset to one tile', () => {
    render('item', [tree]);
    expect(tiles()).toHaveLength(1);
    // 只有一个形态时带形态名是废话，改说「1 格」——占格恒 1 是现在唯一的事实。
    expect(tiles()[0]?.textContent).toContain('1 格');
    expect(tiles()[0]?.textContent).not.toContain('默认');
  });

  it('searches by variant name, not just the asset name', () => {
    render('item', [chest, tree], '打开');
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.textContent).toContain('资源 1');
  });

  it('gives every variant its own tile on the background layer too', () => {
    render('background', [grass, chest]);
    // Only the background asset qualifies, and it contributes one tile per variant.
    expect(tiles()).toHaveLength(2);
    expect(tiles()[0]?.textContent).toContain('草地');
    expect(tiles()[1]?.textContent).toContain('沙地');
    // 背景层的瓦片同样带形态名（v0.7.6 起不再有占格可印）。
    expect(tiles()[0]?.textContent).not.toContain('×');
  });

  it('searches the background layer by variant name', () => {
    render('background', [grass], '沙地');
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.textContent).toContain('沙地');
  });
});

/**
 * v0.7.7: 搜索框右侧的刷新。按钮是**可选**的 —— 调色板不认识 react-query，取数
 * 由调用方负责；不传 `onRefresh` 就没有按钮（上面 6 例都走这条路，所以 `tiles()`
 * 按 `button` 计数不受影响）。
 */
describe('AssetPalette — 刷新按钮（v0.7.7）', () => {
  let container: HTMLDivElement;
  let root: Root;
  const onRefresh = vi.fn();

  function render(props: { onRefresh?: () => void; refreshing?: boolean } = {}): void {
    act(() => {
      root.render(
        <AssetPalette
          assets={[chest]}
          isLoading={false}
          isError={false}
          activeLayer="item"
          selectedAssetId={null}
          selectedVariantId={null}
          onSelect={vi.fn()}
          refreshing={props.refreshing}
          onRefresh={props.onRefresh}
        />,
      );
    });
  }

  const refreshButton = (): HTMLButtonElement | null =>
    container.querySelector<HTMLButtonElement>('[aria-label="刷新资源"]');

  beforeEach(() => {
    onRefresh.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('is absent when the palette is used without a fetcher', () => {
    render();
    expect(refreshButton()).toBeNull();
  });

  it('sits right after the search box and calls back on click', () => {
    render({ onRefresh });
    const button = refreshButton();
    expect(button).not.toBeNull();
    const search = container.querySelector('input[placeholder="搜索资源"]');
    expect(search).not.toBeNull();
    expect(button?.previousElementSibling?.contains(search!)).toBe(true);
    act(() => button?.click());
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('spins and blocks a second click while a fetch is in flight', () => {
    render({ onRefresh, refreshing: true });
    const button = refreshButton();
    expect(button?.disabled).toBe(true);
    expect(button?.querySelector('svg')?.getAttribute('class')).toContain('animate-spin');
  });
});
