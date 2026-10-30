import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset, AssetVariant } from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import { MapBackgroundLayer, MapItemLayer } from './MapAssetLayers';

/**
 * v0.5.1 FEAT-L01 / SPEC-L03 — 「在背景展示该色块」.
 *
 * A colour-block variant fills its cell(s) with the colour on **both** item layers
 * (层 12 背景层 / 层 4 物品层), with no `<img>` anywhere. An ordinary image variant
 * keeps rendering its `<img>` exactly as before.
 *
 * v0.6.1: the look lives on a variant, and an item anchor names one — with the first
 * variant as the fallback for v4 payloads and for variants deleted after publication.
 *
 * v0.8.3 精简（docs/v0.8.3.md §16）：删掉「展示变换」与「名称提示」两组 —— 前者是
 * 盒子怎么长、后者是浮层落在哪、什么时候出现，都是几何与观感。留下的是**回退
 * 规则**：锚点没写 variantId、或写了一个已经不存在的 id 时，画第一个形态。那条
 * 规则错了，玩家的物品会整块消失。
 */

function variant(id: number, overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id,
    assetId: id,
    name: `形态${id}`,
    sortOrder: 0,
    fitMode: 'cover',
    imagePath: null,
    imageUrl: null,
    imageThumbUrl: null,
    bgColor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(id: number, look: Partial<AssetVariant> = {}, extra: AssetVariant[] = []): Asset {
  return {
    id,
    code: `item_${id}`,
    name: `Asset ${id}`,
    type: 'item',
    blocking: true,
    isActive: true,
    variants: [variant(id * 10, { assetId: id, ...look }), ...extra],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
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

  it('still renders an <img> for an image variant', () => {
    paint(cells(2));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('renders nothing for a variant with neither image nor colour', () => {
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

/**
 * v0.6.1 (docs/v0.6.1.md §6.2): the anchor names a variant; the first variant is the
 * fallback. One asset with two visibly different variants makes all three branches
 * observable.
 */
describe('层 4 · 物品层 — 形态回退（v0.6.1 §6.2）', () => {
  const closed = variant(100, { assetId: 9, name: '关闭', bgColor: '#111111' });
  const open = variant(101, { assetId: 9, name: '打开', bgColor: '#EEEEEE' });
  const chest: Asset = {
    id: 9,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: true,
    isActive: true,
    variants: [closed, open],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const byId = new Map<number, Asset>([[9, chest]]);

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

  function paint(variantId?: number): void {
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId: 9, variantId, w: 1, h: 1 } }]])}
          assetsById={byId}
          cellSize={100}
        />,
      );
    });
  }

  function paintedColour(): string | undefined {
    return container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock;
  }

  it('renders the variant the anchor names', () => {
    paint(101);
    expect(paintedColour()).toBe('#EEEEEE');
  });

  it('falls back to the first variant when the anchor carries no variantId', () => {
    paint(undefined);
    expect(paintedColour()).toBe('#111111');
  });

  it('falls back to the first variant when the named variant is gone', () => {
    paint(999);
    expect(paintedColour()).toBe('#111111');
  });
});

/**
 * v0.6.1 (docs/v0.6.1.md §6.2): the background cell names a variant too, now that a
 * background asset may own several. Same three branches, same fallback.
 */
describe('层 12 · 背景层 — 形态回退（v0.6.1 §6.2）', () => {
  const grass = variant(200, { assetId: 19, name: '草地', bgColor: '#33AA33' });
  const sand = variant(201, { assetId: 19, name: '沙地', bgColor: '#DDCC88' });
  const ground: Asset = {
    id: 19,
    code: 'ground',
    name: '地表',
    type: 'background',
    blocking: false,
    isActive: true,
    variants: [grass, sand],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const byId = new Map<number, Asset>([[19, ground]]);

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

  function paint(variantId?: number): void {
    act(() => {
      root.render(
        <MapBackgroundLayer
          cells={new Map([['0,0', { background: { assetId: 19, variantId } }]])}
          assetsById={byId}
          cellSize={100}
        />,
      );
    });
  }

  function paintedColour(): string | undefined {
    return container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock;
  }

  it('renders the variant the background cell names', () => {
    paint(201);
    expect(paintedColour()).toBe('#DDCC88');
  });

  it('falls back to the first variant when the cell carries no variantId', () => {
    paint(undefined);
    expect(paintedColour()).toBe('#33AA33');
  });

  it('falls back to the first variant when the named variant is gone', () => {
    paint(999);
    expect(paintedColour()).toBe('#33AA33');
  });
});
