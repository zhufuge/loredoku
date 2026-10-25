import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Asset, AssetForm } from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import { MapBackgroundLayer, MapItemLayer } from './MapAssetLayers';

/**
 * v0.5.1 FEAT-L01 / SPEC-L03 — 「在背景展示该色块」.
 *
 * A colour-block form fills its cell(s) with the colour on **both** item layers
 * (层 12 背景层 / 层 4 物品层), with no `<img>` anywhere. An ordinary image form
 * keeps rendering its `<img>` exactly as before.
 *
 * v0.6.1: the look lives on a form, and an item anchor names one — with the first
 * form as the fallback for v4 payloads and for forms deleted after publication.
 */

function form(id: number, overrides: Partial<AssetForm> = {}): AssetForm {
  return {
    id,
    assetId: id,
    name: `形态${id}`,
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
    bgColor: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function item(id: number, look: Partial<AssetForm> = {}, extra: AssetForm[] = []): Asset {
  return {
    id,
    code: `item_${id}`,
    name: `Asset ${id}`,
    type: 'item',
    blocking: true,
    isActive: true,
    forms: [form(id * 10, { assetId: id, ...look }), ...extra],
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

  it('still renders an <img> for an image form', () => {
    paint(cells(2));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('renders nothing for a form with neither image nor colour', () => {
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
 * v0.6.1 (docs/v0.6.1.md §6.2): the anchor names a form; the first form is the
 * fallback. One asset with two visibly different forms makes all three branches
 * observable.
 */
describe('层 4 · 物品层 — 形态回退（v0.6.1 §6.2）', () => {
  const closed = form(100, { assetId: 9, name: '关闭', bgColor: '#111111' });
  const open = form(101, { assetId: 9, name: '打开', bgColor: '#EEEEEE' });
  const chest: Asset = {
    id: 9,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: true,
    isActive: true,
    forms: [closed, open],
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

  function paint(formId?: number): void {
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId: 9, formId, w: 1, h: 1 } }]])}
          assetsById={byId}
          cellSize={100}
        />,
      );
    });
  }

  function paintedColour(): string | undefined {
    return container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock;
  }

  it('renders the form the anchor names', () => {
    paint(101);
    expect(paintedColour()).toBe('#EEEEEE');
  });

  it('falls back to the first form when the anchor carries no formId', () => {
    paint(undefined);
    expect(paintedColour()).toBe('#111111');
  });

  it('falls back to the first form when the named form is gone', () => {
    paint(999);
    expect(paintedColour()).toBe('#111111');
  });
});

/**
 * v0.6.1 (docs/v0.6.1.md §6.2): the background cell names a form too, now that a
 * background asset may own several. Same three branches, same fallback.
 */
describe('层 12 · 背景层 — 形态回退（v0.6.1 §6.2）', () => {
  const grass = form(200, { assetId: 19, name: '草地', bgColor: '#33AA33' });
  const sand = form(201, { assetId: 19, name: '沙地', bgColor: '#DDCC88' });
  const ground: Asset = {
    id: 19,
    code: 'ground',
    name: '地表',
    type: 'background',
    blocking: false,
    isActive: true,
    forms: [grass, sand],
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

  function paint(formId?: number): void {
    act(() => {
      root.render(
        <MapBackgroundLayer
          cells={new Map([['0,0', { background: { assetId: 19, formId } }]])}
          assetsById={byId}
          cellSize={100}
        />,
      );
    });
  }

  function paintedColour(): string | undefined {
    return container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock;
  }

  it('renders the form the background cell names', () => {
    paint(201);
    expect(paintedColour()).toBe('#DDCC88');
  });

  it('falls back to the first form when the cell carries no formId', () => {
    paint(undefined);
    expect(paintedColour()).toBe('#33AA33');
  });

  it('falls back to the first form when the named form is gone', () => {
    paint(999);
    expect(paintedColour()).toBe('#33AA33');
  });
});

/**
 * v0.7.5 (docs/v0.7.5.md §4): 物品的展示变换。盒子画在**展示矩形**上 ——
 * 放大围绕脚位中心、偏移按格走，可以整块跑到脚位之外；占格（w × h）不动，
 * 所以占格、擦除、碰撞的逻辑一行都不用改。
 */
describe('层 4 · 物品层 — 展示变换（v0.7.5）', () => {
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

  function paint(cells: CellMap): HTMLElement | null {
    act(() => {
      root.render(<MapItemLayer cells={cells} assetsById={assetsById} cellSize={100} />);
    });
    return container.querySelector<HTMLElement>('[data-color-block]')?.parentElement ?? null;
  }

  it('keeps the plain footprint rect when there is no transform', () => {
    const box = paint(new Map([['1,1', { item: { assetId: 1, w: 1, h: 1 } }]]));
    expect(box?.style.left).toBe('100px');
    expect(box?.style.top).toBe('100px');
    expect(box?.style.width).toBe('100px');
    expect(box?.style.height).toBe('100px');
  });

  it('grows around the footprint centre and shifts by whole cells', () => {
    const box = paint(
      new Map([['1,1', { item: { assetId: 1, w: 1, h: 1, scale: 2, offsetX: 1 } }]]),
    );
    // 中心 150 + 偏移 100 = 250，减去半宽 100。
    expect(box?.style.left).toBe('150px');
    expect(box?.style.top).toBe('50px');
    expect(box?.style.width).toBe('200px');
    expect(box?.style.height).toBe('200px');
  });

  it('lets a shrunk item sit inside its cell without moving it', () => {
    const box = paint(new Map([['2,0', { item: { assetId: 1, w: 1, h: 1, scale: 0.5 } }]]));
    expect(box?.style.left).toBe('225px');
    expect(box?.style.width).toBe('50px');
  });
});
