import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Item } from '@loredoku/shared';
import type { CellMap } from '@/lib/canvasLayers';
import { MapBackgroundLayer, MapObjectLayer } from './MapLayers';

/**
 * v0.5.1 FEAT-L01 / SPEC-L03 — 「在背景展示该色块」.
 *
 * A colour-block item fills its cell(s) with the colour on **both** item layers
 * (层 12 背景层 / 层 4 物体层), with no `<img>` anywhere. An ordinary image item
 * keeps rendering its `<img>` exactly as before.
 */

function item(id: number, overrides: Partial<Item> = {}): Item {
  return {
    id,
    code: `item_${id}`,
    name: `Item ${id}`,
    category: 'object',
    widthCells: 1,
    heightCells: 1,
    canStand: true,
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

const itemsById = new Map<number, Item>([
  [1, block],
  [2, picture],
  [3, bare],
]);

describe('层 12 · 背景层 — 纯色块（v0.5.1 SPEC-L03 §3.1）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(cells: CellMap): void {
    act(() => {
      root.render(<MapBackgroundLayer cells={cells} itemsById={itemsById} cellSize={100} />);
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('fills the cell with the colour instead of an image', () => {
    render(new Map([['0,0', { background: { itemId: 1 } }]]));
    const painted = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(painted?.dataset.colorBlock).toBe('#FF8800');
    expect(painted?.style.backgroundColor).toBe('rgb(255, 136, 0)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders an <img> for an image item', () => {
    render(new Map([['1,1', { background: { itemId: 2 } }]]));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('renders nothing for an item with neither image nor colour', () => {
    render(new Map([['2,2', { background: { itemId: 3 } }]]));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });
});

describe('层 4 · 物体层 — 纯色块（v0.5.1 SPEC-L03 §3.1）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(cells: CellMap): void {
    act(() => {
      root.render(<MapObjectLayer cells={cells} itemsById={itemsById} cellSize={100} />);
    });
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('fills the whole footprint for a multi-cell block', () => {
    render(new Map([['0,0', { object: { itemId: 1, w: 2, h: 2 } }]]));
    const painted = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(painted?.dataset.colorBlock).toBe('#FF8800');
    expect(painted?.style.backgroundColor).toBe('rgb(255, 136, 0)');
    // The footprint is the whole 2×2 area, not one cell.
    expect(painted?.parentElement?.getAttribute('style')).toContain('width: 200px');
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders an <img> for an image item', () => {
    render(new Map([['1,1', { object: { itemId: 2, w: 1, h: 1 } }]]));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/p.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('renders nothing for an item with neither image nor colour', () => {
    render(new Map([['2,2', { object: { itemId: 3, w: 1, h: 1 } }]]));
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });
});
