import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Item } from '@loredoku/shared';
import { ItemThumbnail } from './ItemThumbnail';

/**
 * v0.5.1 FEAT-L01 / SPEC-L03 — an item with `bgColor` renders as a **solid
 * colour block**, and a colour block wins over an uploaded image. Everything
 * else (image → `<img>`, nothing → placeholder icon) is unchanged.
 */

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 1,
    code: 'block',
    name: '色块',
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

describe('ItemThumbnail — 纯色块（v0.5.1 FEAT-L01 / SPEC-L03）', () => {
  let container: HTMLDivElement;
  let root: Root;

  function render(value: Item): void {
    act(() => {
      root.render(<ItemThumbnail item={value} className="h-10 w-10" />);
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

  it('paints the block when there is no image at all', () => {
    render(item({ bgColor: '#FF0000' }));
    const block = container.querySelector<HTMLDivElement>('[data-color-block]');
    expect(block).not.toBeNull();
    expect(block?.dataset.colorBlock).toBe('#FF0000');
    expect(block?.style.backgroundColor).toBe('rgb(255, 0, 0)');
    expect(container.querySelector('img')).toBeNull();
  });

  it('lets the block win over an uploaded image', () => {
    render(item({ bgColor: '#00FF00', imageUrl: '/uploads/a.png', imageThumbUrl: '/uploads/a.png' }));
    expect(container.querySelector<HTMLDivElement>('[data-color-block]')?.dataset.colorBlock).toBe(
      '#00FF00',
    );
    expect(container.querySelector('img')).toBeNull();
  });

  it('still renders an <img> for a plain image item', () => {
    render(item({ imageUrl: '/uploads/b.png', imageThumbUrl: '/uploads/b.png' }));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/uploads/b.png');
    expect(container.querySelector('[data-color-block]')).toBeNull();
  });

  it('falls back to the placeholder icon when there is neither', () => {
    render(item());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-color-block]')).toBeNull();
    // The placeholder is the lucide `ImageIcon` svg.
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
