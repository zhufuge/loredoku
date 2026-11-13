import {
  ASSET_VARIANT_FOOTPRINT_DEFAULT,
  ASSET_VARIANT_FOOTPRINT_MAX,
  ASSET_VARIANT_FOOTPRINT_MIN,
} from './constants';
import type { Asset, AssetVariant, AssetType } from './types';

/**
 * v0.10.6: the footprint of a variant, in cells. `w` / `h` are optional on the
 * DTO (older bundles, literal test fixtures), and a background never spans more
 * than one cell. One helper, so the editor, the palette and the game can't
 * disagree about the default or the clamp.
 */
export function resolveVariantFootprint(
  variant: AssetVariant,
  assetType?: AssetType,
): { w: number; h: number } {
  if (assetType === 'background') {
    return { w: ASSET_VARIANT_FOOTPRINT_DEFAULT, h: ASSET_VARIANT_FOOTPRINT_DEFAULT };
  }
  const clamp = (value: number | undefined): number => {
    const n = Number.isFinite(value) ? Math.trunc(value as number) : ASSET_VARIANT_FOOTPRINT_DEFAULT;
    return Math.min(
      ASSET_VARIANT_FOOTPRINT_MAX,
      Math.max(ASSET_VARIANT_FOOTPRINT_MIN, n),
    );
  };
  return { w: clamp(variant.w), h: clamp(variant.h) };
}

/**
 * v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): a **background** asset never blocks —
 * 「阻挡」 is an item-layer concept, meaningless for `background`. One
 * function, three callers (schemas, repository, web forms), so the rule can't
 * drift.
 *
 * v0.6.0: the flag was `canStand` and pointed the other way; the shape of the
 * rule is unchanged.
 */
export function blockingFor(type: AssetType, blocking: boolean): boolean {
  return type === 'background' ? false : blocking;
}

/**
 * v0.6.1: which variant a canvas anchor resolves to (docs/v0.6.1.md §6.2). The
 * single place that decides, so the editor, the preview and the game can't drift.
 *
 * A missing or dangling `variantId` falls back to the asset's first variant: payloads
 * written before the field existed carry no `variantId` at all, and a variant deleted
 * after a version was published leaves a dangling id behind.
 */
export function resolveAssetVariant(asset: Asset, variantId?: number | null): AssetVariant | undefined {
  if (variantId !== undefined && variantId !== null) {
    const match = asset.variants.find((variant) => variant.id === variantId);
    if (match) return match;
  }
  return asset.variants[0];
}

/**
 * v0.6.1: an asset can only be enabled once **some** variant has a look (an image
 * or a colour block) — the same predicate v0.5.1 used when an image was deleted,
 * widened from one asset to one of its variants.
 */
export function assetHasAppearance(asset: Asset): boolean {
  return asset.variants.some((variant) => variant.imageUrl !== null || variant.bgColor !== null);
}
