import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Asset, AssetVariant } from '@loredoku/shared';
import { ITEM_NAME_TIP_DELAY_MS, ITEM_NAME_TIP_Z, MAP_LAYER_Z } from '@loredoku/shared';
import type { CellCoord } from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import type { CanvasPoint } from '@/lib/grid';
import { MapBackgroundLayer, MapDecorationLayer, MapItemLayer } from './MapAssetLayers';

/**
 * FEAT-L01 / SPEC-L03 — 「在背景展示该色块」.
 *
 * A colour-block variant fills its cell(s) with the colour on **both** item layers
 * (层 12 背景层 / 层 4 物品层), with no `<img>` anywhere. An ordinary image variant
 * keeps rendering its `<img>`.
 *
 * The look lives on a variant, and an item anchor names one — with the first variant
 * as the fallback for v4 payloads and for variants deleted after publication.
 *
 * **回退规则**（docs/v0.8.3.md §16）：锚点没写 variantId、或写了一个已经不存在的
 * id 时，画第一个形态。那条规则错了，玩家的物品会整块消失。
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
  {
    name: '层 11 · 背景修饰层（v0.10.9）',
    layer: (cells: CellMap) => (
      <MapDecorationLayer cells={cells} assetsById={assetsById} cellSize={100} />
    ),
    cells: (assetId: number) => new Map([['0,0', { decoration: { assetId } }]]),
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

describe('层 4 · 物品层 — 物品描边（v0.9.1 §5）', () => {
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

  function paint(assetId: number, outline: { width: number; color: string } | null): void {
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId, w: 1, h: 1 } }]])}
          assetsById={assetsById}
          cellSize={100}
          itemOutline={outline}
        />,
      );
    });
  }

  it('宽度 0（出厂默认）不挂 filter', () => {
    paint(2, { width: 0, color: '#000000' });
    expect(container.querySelector('img')?.style.filter ?? '').toBe('');
  });

  it('宽度 > 0 时图片带 4 向 drop-shadow，颜色取配置', () => {
    paint(2, { width: 4, color: '#FF0000' });
    const filter = container.querySelector('img')?.style.filter ?? '';
    expect(filter.match(/drop-shadow/g)).toHaveLength(4);
    expect(filter.match(/#FF0000/g)).toHaveLength(4);
  });

  it('色块同样带描边', () => {
    paint(1, { width: 4, color: '#00FF00' });
    const painted = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(painted?.style.filter ?? '').toContain('drop-shadow');
  });

  /*
   * Safari 在元素没有自己的合成层时会整条 filter 不画。有描边时才要求
   * 提升合成层（`will-change: filter`），没描边的物品不要白拿一层 —— 盘面上物品
   * 多，多出来的层直接换成滚动掉帧。
   */
  it('有描边时把这一层提升成独立合成层', () => {
    paint(2, { width: 4, color: '#FF0000' });
    expect(container.querySelector('img')?.style.willChange).toBe('filter');
  });

  it('没描边时不提升合成层', () => {
    paint(2, { width: 0, color: '#FF0000' });
    expect(container.querySelector('img')?.style.willChange ?? '').toBe('');
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
 * 多格物品的整体动效 —— 悬停任一占据格，同一件物品的显示框作为
 * 整体被悬停（hoveredKey 按锚点命中，被 `scale` 撑出去的那圈画也不抢指针）。
 * 抬手、名称提示都随这个整体走。
 */
describe('层 4 · 物品层 — 多格物品悬停联动（v0.10.6）', () => {
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

  const paint = (
    cells: CellMap,
    hover: CellCoord | null,
    pointer?: CanvasPoint | null,
  ): void => {
    act(() => {
      root.render(
        <MapItemLayer
          cells={cells}
          assetsById={assetsById}
          cellSize={100}
          hover={hover}
          pointer={pointer}
        />,
      );
    });
  };

  it('悬停任一占据格，同一件多格物品整体渲染（带抬手变换）', () => {
    // 2×1 横跨 (0,0) 和 (1,0)，锚点在 (0,0)，有图片 ⇒ 渲染 img。
    paint(
      new Map([['0,0', { item: { assetId: 2, w: 2, h: 1 } }]]),
      { x: 1, y: 0 },
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.style.transform).toContain('translateY(-4px)');

    // 悬停另一个占据格：整体仍然是 hovered。
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId: 2, w: 2, h: 1 } }]])}
          assetsById={assetsById}
          cellSize={100}
          hover={{ x: 0, y: 0 }}
          pointer={null}
        />,
      );
    });
    expect(container.querySelector('img')?.style.transform).toContain(
      'translateY(-4px)',
    );

    // 离开所有占据格：不再 hovered。
    act(() => {
      root.render(
        <MapItemLayer
          cells={new Map([['0,0', { item: { assetId: 2, w: 2, h: 1 } }]])}
          assetsById={assetsById}
          cellSize={100}
          hover={null}
          pointer={null}
        />,
      );
    });
    expect((container.querySelector('img')?.style.transform ?? '')).toBe('');
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
 * 三种东西可以同格共存，每层只画自己那一份 —— 背景修饰层不会因为
 * 格子同时还有物品就把物品一起画出来，也不会漏掉自己那格。
 */
describe('三层同格共存（v0.10.9）', () => {
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

  const both = new Map([
    [
      '0,0',
      {
        background: { assetId: 1 },
        decoration: { assetId: 2 },
        item: { assetId: 1, w: 1, h: 1 },
      },
    ],
  ]);

  it('每一层各自只画自己那一份', () => {
    act(() => {
      root.render(
        <>
          <MapBackgroundLayer cells={both} assetsById={assetsById} cellSize={100} />
          <MapDecorationLayer cells={both} assetsById={assetsById} cellSize={100} />
          <MapItemLayer cells={both} assetsById={assetsById} cellSize={100} />
        </>,
      );
    });
    // 背景(1) 与 物品(1) 都是纯色块，修饰(2) 是图片 ⇒ 两块颜色 + 一张图。
    const colours = Array.from(container.querySelectorAll<HTMLDivElement>('[data-color-block]')).map(
      (node) => node.dataset.colorBlock,
    );
    expect(colours).toEqual(['#FF8800', '#FF8800']);
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('只有修饰层时，物品与背景都不出现在它的输出里', () => {
    act(() => {
      root.render(<MapDecorationLayer cells={both} assetsById={assetsById} cellSize={100} />);
    });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelectorAll('[data-color-block]')).toHaveLength(0);
  });
});

/**
 * 作者要求「物品提示出现在地图最上层，且标签默认在鼠标上方」。
 */
describe('层 4 · 物品层 — 名称提示在最上层、默认在指针上方（v0.11.4）', () => {
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

  /** 画一块 5×5（cellSize 100）、悬停命中 `hover`，并把 0.32 秒的计时推过去。 */
  const paint = (
    cells: CellMap,
    pointer: CanvasPoint | null,
    hover: CellCoord = { x: 0, y: 0 },
  ): void => {
    act(() => {
      root.render(
        <MapItemLayer
          cells={cells}
          assetsById={assetsById}
          cellSize={100}
          gridSize={5}
          hover={hover}
          pointer={pointer}
        />,
      );
    });
    act(() => {
      vi.advanceTimersByTime(ITEM_NAME_TIP_DELAY_MS);
    });
  };

  const singleItemPicture = (): CellMap =>
    new Map([['0,0', { item: { assetId: 2, w: 1, h: 1 } }]]);
  const tip = (): HTMLElement | null =>
    container.querySelector('[data-testid="item-name-tip"]');

  it('纸片自己挂一层，压得比物品层高', () => {
    paint(singleItemPicture(), { x: 50, y: 50 });
    const span = tip();
    expect(span).not.toBeNull();

    const layer = span!.parentElement as HTMLElement;
    expect(layer.style.zIndex).toBe(String(ITEM_NAME_TIP_Z));
    expect(ITEM_NAME_TIP_Z).toBeGreaterThan(MAP_LAYER_Z.itemLayer);
    // 与物品**不在**同一层：纸片那个壳子里没有任何物品的画。
    expect(layer.contains(container.querySelector('img'))).toBe(false);
  });

  it('有光标坐标时，纸片落在指针正上方', () => {
    paint(singleItemPicture(), { x: 250, y: 300 });
    const style = tip()!.style;
    expect(style.left).toBe('250px');
    // 底边贴在指针上方 18px 处 —— `translateY(-100%)` 把纸片往上提。
    expect(style.top).toBe('282px');
    expect(style.transform).toBe('translate(-50%, -100%)');
  });

  it('指针贴着画布顶边时翻到下方，仍然水平居中', () => {
    paint(singleItemPicture(), { x: 250, y: 20 });
    const style = tip()!.style;
    expect(style.top).toBe('38px');
    expect(style.transform).toBe('translate(-50%, 0)');
  });

  it('指针贴着画布右边时从锚点向左展开', () => {
    paint(singleItemPicture(), { x: 480, y: 300 });
    expect(tip()!.style.transform).toBe('translate(-100%, -100%)');
  });

  it('没有光标坐标（触屏、测试）时挂在物品显示框上方', () => {
    paint(new Map([['2,2', { item: { assetId: 2, w: 1, h: 1 } }]]), null, { x: 2, y: 2 });
    const style = tip()!.style;
    // 第三行第二列的显示框：上边 200、中线 250，纸片底边落在它上方 6px。
    expect(style.top).toBe('194px');
    expect(style.left).toBe('250px');
    expect(style.transform).toBe('translate(-50%, -100%)');
  });
});
