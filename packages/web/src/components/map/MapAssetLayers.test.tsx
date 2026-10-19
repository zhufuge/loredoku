import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset } from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import { MapBackgroundLayer, MapItemLayer } from './MapAssetLayers';

/**
 * v0.5.1 FEAT-L01 / SPEC-L03 — 「在背景展示该色块」.
 *
 * A colour-block item fills its cell(s) with the colour on **both** item layers
 * (层 12 背景层 / 层 4 物品层), with no `<img>` anywhere. An ordinary image item
 * keeps rendering its `<img>` exactly as before.
 */

function item(id: number, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    code: `item_${id}`,
    name: `Asset ${id}`,
    type: 'item',
    widthCells: 1,
    heightCells: 1,
    blocking: true,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    imageMime: null,
    imageSize: null,
    imageWidth: null,
    imageHeight: null,
    bgColor: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const block = item(1, { bgColor: '#FF8800' });
const picture = item(2, { imageUrl: '/uploads/p.png', imageThumbUrl: '/uploads/p.png' });
const bare = item(3);

const assetsById = new Map<number, Asset>([
  [1, block],
  [2, picture],
  [3, bare],
]);

/**
 * Both item layers answer the same three questions about an item, so they share
 * one harness — only the cell key that carries the item differs.
 */
const layers = [
  {
    name: '层 12 · 背景层',
    layer: (cells: CellMap) => (
      <MapBackgroundLayer cells={cells} assetsById={assetsById} cellSize={100} />
    ),
    cells: (assetId: number) => new Map([['0,0', { background: { assetId } }]]),
  },
  {
    name: '层 4 · 物品层',
    layer: (cells: CellMap) => <MapItemLayer cells={cells} assetsById={assetsById} cellSize={100} />,
    cells: (assetId: number) => new Map([['0,0', { item: { assetId, w: 1, h: 1 } }]]),
  },
] as const;

describe.each(layers)('$name — 纯色块（v0.5.1 SPEC-L03 §3.1）', ({ layer, cells }) => {
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

  function paint(map: CellMap): void {
    act(() => {
      root.render(layer(map));
    });
  }

  it('fills the cell with the colour instead of an image', () => {
    paint(cells(1));
    const painted = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(painted?.dataset.colorBlock).toBe('#FF8800');
    expect(painted?.style.backgroundColor).toBe('rgb(255, 136, 0)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders an <img> for an image item', () => {
    paint(cells(2));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('renders nothing for an item with neither image nor colour', () => {
    paint(cells(3));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });
});

describe('层 4 · 物品层 — 多格色块（v0.5.1 SPEC-L03 §3.1）', () => {
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

  it('fills the whole footprint, not one cell', () => {
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId: 1, w: 2, h: 2 } }]])}
          assetsById={assetsById}
          cellSize={100}
        />,
      );
    });
    const painted = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(painted?.dataset.colorBlock).toBe('#FF8800');
    expect(painted?.style.backgroundColor).toBe('rgb(255, 136, 0)');
    expect(painted?.parentElement?.getAttribute('style')).toContain('width: 200px');
    expect(container.querySelector('img')).toBeNull();
  });
});
