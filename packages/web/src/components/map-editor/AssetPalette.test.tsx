import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetForm, EditorLayer } from '@loredoku/shared';
import { AssetPalette } from './AssetPalette';

/**
 * v0.6.1 (docs/v0.6.1.md §8.5): the tiles are **forms** — a chest with
 * 「关闭 1×1」 and 「打开 2×2」 offers two tiles, and searching 「打开」 finds it.
 * The background layer works the same way now: a background asset may own
 * several forms, and each look is its own tile.
 */

function form(id: number, assetId: number, overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    id,
    assetId,
    name: '默认',
    widthCells: 1,
    heightCells: 1,
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    imageMime: null,
    imageSize: null,
    imageWidth: null,
    imageHeight: null,
    bgColor: '#CCCCCC',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function asset(id: number, forms: AssetForm[], overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    code: `a_${id}`,
    name: `资源 ${id}`,
    type: 'item',
    blocking: false,
    isActive: true,
    forms,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const chest = asset(1, [
  form(11, 1, { name: '关闭', widthCells: 1, heightCells: 1 }),
  form(12, 1, { name: '打开', widthCells: 2, heightCells: 2 }),
]);
const tree = asset(2, [form(21, 2, { name: '默认', widthCells: 2, heightCells: 2 })]);
const grass = asset(3, [form(31, 3, { name: '草地' }), form(32, 3, { name: '沙地' })], {
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
          selectedFormId={null}
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
    return [...container.querySelectorAll<HTMLButtonElement>('button')];
  }

  it('gives every form its own tile on the item layer', () => {
    render('item', [chest, tree]);
    // chest 2 + tree 1
    expect(tiles()).toHaveLength(3);
  });

  it('labels a multi-form asset with the form name and footprint', () => {
    render('item', [chest]);
    const labels = tiles().map((tile) => tile.textContent ?? '');
    expect(labels[0]).toContain('关闭');
    expect(labels[0]).toContain('1×1');
    expect(labels[1]).toContain('打开');
    expect(labels[1]).toContain('2×2');
  });

  it('keeps a single-form asset to one tile showing its footprint', () => {
    render('item', [tree]);
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.textContent).toContain('2×2');
    // No redundant 「默认」 label when there is only one form.
    expect(tiles()[0]?.textContent).not.toContain('默认');
  });

  it('searches by form name, not just the asset name', () => {
    render('item', [chest, tree], '打开');
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.textContent).toContain('资源 1');
  });

  it('gives every form its own tile on the background layer too', () => {
    render('background', [grass, chest]);
    // Only the background asset qualifies, and it contributes one tile per form.
    expect(tiles()).toHaveLength(2);
    expect(tiles()[0]?.textContent).toContain('草地');
    expect(tiles()[1]?.textContent).toContain('沙地');
    // A background form's footprint is pinned at 1×1, and the tile says so.
    expect(tiles()[0]?.textContent).toContain('1×1');
  });

  it('searches the background layer by form name', () => {
    render('background', [grass], '沙地');
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]?.textContent).toContain('沙地');
  });
});
