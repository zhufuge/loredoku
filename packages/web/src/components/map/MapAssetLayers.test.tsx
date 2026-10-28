import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/**
 * v0.7.13 (docs/v0.7.13.md §2) — 悬停 1s 报出物品名称。
 *
 * 三件事要分开验：**等够 1s 才出现**（快扫过不弹）、**换了物品就立刻收**（名字
 * 不能错挂在邻居头上）、**贴着画布边也不被切**（第一行翻到下方，最左/最右列贴边）。
 */
describe('层 4 · 物品层 — 名称提示（v0.7.13 §2）', () => {
  const lamp: Asset = { ...item(7, { imageUrl: '/uploads/lamp.png' }), name: '油灯' };
  const barrel: Asset = { ...item(8, { imageUrl: '/uploads/barrel.png' }), name: '木桶' };
  const byId = new Map<number, Asset>([
    [7, lamp],
    [8, barrel],
  ]);

  /** 6×6 的画布，两件物品分置左右，中间留空。 */
  const cells: CellMap = new Map([
    ['1,1', { item: { assetId: 7, w: 1, h: 1 } }],
    ['3,1', { item: { assetId: 8, w: 1, h: 1 } }],
  ]);

  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  function paint(
    options: {
      hover?: { x: number; y: number } | null;
      gridSize?: number;
      showNameOnHover?: boolean;
      map?: CellMap;
    } = {},
  ): void {
    act(() => {
      root.render(
        <MapItemLayer
          cells={options.map ?? cells}
          assetsById={byId}
          cellSize={100}
          gridSize={options.gridSize ?? 6}
          hover={options.hover ?? null}
          showNameOnHover={options.showNameOnHover}
        />,
      );
    });
  }

  function wait(ms: number): void {
    act(() => {
      vi.advanceTimersByTime(ms);
    });
  }

  function tip(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[data-testid="item-name-tip"]');
  }

  it('stays silent until a full second has passed', () => {
    paint({ hover: { x: 1, y: 1 } });
    expect(tip()).toBeNull();
    wait(999);
    expect(tip()).toBeNull();
    wait(1);
    expect(tip()?.textContent).toBe('油灯');
  });

  it('reports the item under the pointer, not its neighbour', () => {
    paint({ hover: { x: 3, y: 1 } });
    wait(1000);
    expect(tip()?.textContent).toBe('木桶');
  });

  it('drops the old name the moment the pointer moves to another item', () => {
    paint({ hover: { x: 1, y: 1 } });
    wait(1000);
    expect(tip()?.textContent).toBe('油灯');

    paint({ hover: { x: 3, y: 1 } });
    // 不推进时间：上一件的名字必须当场消失，不能挂在新物品头上蹭一秒。
    expect(tip()).toBeNull();
    wait(1000);
    expect(tip()?.textContent).toBe('木桶');
  });

  it('does not restart from a stale timer after leaving and coming back', () => {
    paint({ hover: { x: 1, y: 1 } });
    wait(800);
    paint({ hover: null });
    wait(500);
    expect(tip()).toBeNull();
    // 回来要重新数满 1s，不是把上次剩下的 200ms 接着用。
    paint({ hover: { x: 1, y: 1 } });
    wait(800);
    expect(tip()).toBeNull();
    wait(200);
    expect(tip()?.textContent).toBe('油灯');
  });

  it('says nothing over an empty cell', () => {
    paint({ hover: { x: 2, y: 2 } });
    wait(3000);
    expect(tip()).toBeNull();
  });

  it('can be switched off', () => {
    paint({ hover: { x: 1, y: 1 }, showNameOnHover: false });
    wait(3000);
    expect(tip()).toBeNull();
  });

  it('floats above the item, and below it on the top row', () => {
    paint({ hover: { x: 1, y: 1 } });
    wait(1000);
    expect(tip()?.style.bottom).toBe('calc(100% + 6px)');
    expect(tip()?.style.top).toBe('');

    paint({ hover: { x: 1, y: 0 }, map: new Map([['1,0', { item: { assetId: 7, w: 1, h: 1 } }]]) });
    wait(1000);
    expect(tip()?.style.top).toBe('calc(100% + 6px)');
    expect(tip()?.style.bottom).toBe('');
  });

  it('centres the tip, and hugs the canvas edge in the first / last column', () => {
    paint({ hover: { x: 1, y: 1 } });
    wait(1000);
    // 百分比而不是像素：绝对定位贴着 padding box，用 rect.width / 2 会差一个 padding。
    expect(tip()?.style.transform).toBe('translateX(-50%)');
    expect(tip()?.style.left).toBe('50%');

    paint({ hover: { x: 0, y: 1 }, map: new Map([['0,1', { item: { assetId: 7, w: 1, h: 1 } }]]) });
    wait(1000);
    // 贴着左边：不位移，左边缘对齐物品（也就是画布）左边缘。
    expect(tip()?.style.transform).toBe('');
    expect(tip()?.style.left).toBe('0px');

    paint({ hover: { x: 5, y: 1 }, map: new Map([['5,1', { item: { assetId: 7, w: 1, h: 1 } }]]) });
    wait(1000);
    // 贴着右边：以右边缘为准往左长；物品没越界，所以不退。
    expect(tip()?.style.transform).toBe('translateX(-100%)');
    expect(tip()?.style.left).toBe('calc(100% - 0px)');
  });

  it('pulls the tip back inside when a transform pushed the item past the edge', () => {
    // offsetX 以格为单位：左移一格后，物品左边缘已经在画布之外（-100px）。
    paint({
      hover: { x: 0, y: 1 },
      map: new Map([['0,1', { item: { assetId: 7, w: 1, h: 1, offsetX: -1 } }]]),
    });
    wait(1000);
    expect(tip()?.style.left).toBe('100px');

    // 右移两格后右边缘越界 200px，纸片整体往左让。
    paint({
      hover: { x: 5, y: 1 },
      map: new Map([['5,1', { item: { assetId: 7, w: 1, h: 1, offsetX: 2 } }]]),
    });
    wait(1000);
    expect(tip()?.style.transform).toBe('translateX(-100%)');
    expect(tip()?.style.left).toBe('calc(100% - 200px)');
  });

  it('is a tip, not a target: it never eats pointer events', () => {
    paint({ hover: { x: 1, y: 1 } });
    wait(1000);
    // 提示压在物品自己身上，能吃掉指针事件就等于把物品的点击挡了。
    expect(tip()?.classList.contains('pointer-events-none')).toBe(true);
    expect(tip()?.getAttribute('role')).toBe('tooltip');
  });

  it('no longer leans on the browser title', () => {
    paint({ hover: { x: 1, y: 1 } });
    expect(container.querySelector('[title]')).toBeNull();
  });
});
