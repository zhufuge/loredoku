import { describe, expect, it } from 'vitest';
import { assetHasAppearance, blockingFor, resolveAssetVariant } from './assetRules';
import type { Asset, AssetVariant } from './types';

function variant(id: number, overrides: Partial<AssetVariant> = {}): AssetVariant {
  return {
    id,
    assetId: 1,
    name: `形态${id}`,
    sortOrder: id,
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

function asset(variants: AssetVariant[]): Asset {
  return {
    id: 1,
    code: 'chest',
    name: '宝箱',
    type: 'item',
    blocking: true,
    isActive: true,
    variants,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): 「背景」类型的资源一定不阻挡，
 * 「阻挡」只对「物品」类型有意义。v0.6.0 把这个标记从 `canStand` 反过来。
 */
describe('blockingFor (FEAT-M04)', () => {
  it('forces false for a background asset', () => {
    expect(blockingFor('background', false)).toBe(false);
    expect(blockingFor('background', true)).toBe(false);
  });

  it('follows the caller for an item asset', () => {
    expect(blockingFor('item', true)).toBe(true);
    expect(blockingFor('item', false)).toBe(false);
  });
});

/**
 * v0.6.1 (docs/v0.6.1.md §6.2): one function decides which variant a canvas anchor
 * renders with — the editor, the preview and the game all call it, so the three
 * can never disagree about a fallback.
 */
describe('resolveAssetVariant', () => {
  const two = [variant(7), variant(9)];

  it('prefers the variant the anchor names', () => {
    expect(resolveAssetVariant(asset(two), 9)?.id).toBe(9);
  });

  it('falls back to the first variant when the anchor carries none', () => {
    expect(resolveAssetVariant(asset(two), undefined)?.id).toBe(7);
    expect(resolveAssetVariant(asset(two), null)?.id).toBe(7);
  });

  it('falls back to the first variant when the named one is gone', () => {
    expect(resolveAssetVariant(asset(two), 42)?.id).toBe(7);
  });
});

/**
 * v0.6.1 (docs/v0.6.1.md §4.5): the enable switch needs **some** variant to have a
 * look. With several variants, "the asset has an image" is no longer one field.
 */
describe('assetHasAppearance', () => {
  it('is true as soon as any variant carries an image or a colour', () => {
    expect(assetHasAppearance(asset([variant(1, { imageUrl: '/a.png' })]))).toBe(true);
    expect(assetHasAppearance(asset([variant(1), variant(2, { bgColor: '#112233' })]))).toBe(true);
  });

  it('is false while every variant is bare', () => {
    expect(assetHasAppearance(asset([variant(1), variant(2)]))).toBe(false);
  });
});
