import {
  ASSET_VARIANT_FOOTPRINT_DEFAULT,
  ASSET_VARIANT_FOOTPRINT_MAX,
  ASSET_VARIANT_FOOTPRINT_MIN,
} from './constants';
import type { Asset, AssetVariant, AssetType } from './types';

/** Footprint in cells: `w` / `h` are optional on the DTO (old bundles, fixtures) and are clamped; background and 「背景修饰」 are always 1×1 — they share the cell with the item. */
export function resolveVariantFootprint(
  variant: AssetVariant,
  assetType?: AssetType,
  decoration?: boolean,
): { w: number; h: number } {
  if (assetType === 'background' || decoration === true) {
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

/** v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): a **background** asset never blocks — 「阻挡」 is an item-layer concept, meaningless for `background`. One function, three callers (schemas, repository, web forms), so the rule can't drift. */
export function blockingFor(type: AssetType, blocking: boolean): boolean {
  return type === 'background' ? false : blocking;
}

/** v0.10.9 (docs/v0.10.9.md §2): a `background` is never a 「背景修饰」 — it already fills the whole cell; same shape as `blockingFor`, one function / three callers. */
export function decorationFor(type: AssetType, decoration: boolean): boolean {
  return type === 'background' ? false : decoration;
}

/** Which editor layer an asset may be placed on. A 「背景修饰」 item belongs to the decoration layer **instead of** the item layer (they are two halves of the item world, not two aliases), so the palette splits them by this predicate as well. */
export function assetLayerFor(asset: Asset): 'background' | 'decoration' | 'item' {
  if (asset.type === 'background') return 'background';
  return asset.decoration ? 'decoration' : 'item';
}

/** v0.6.1 (docs/v0.6.1.md §6.2): the single place deciding a canvas anchor's variant; a missing or dangling `variantId` falls back to the asset's first variant. */
export function resolveAssetVariant(asset: Asset, variantId?: number | null): AssetVariant | undefined {
  if (variantId !== undefined && variantId !== null) {
    const match = asset.variants.find((variant) => variant.id === variantId);
    if (match) return match;
  }
  return asset.variants[0];
}

/** An asset can only be enabled once **some** variant has a look (an image or a colour block). */
export function assetHasAppearance(asset: Asset): boolean {
  return asset.variants.some((variant) => variant.imageUrl !== null || variant.bgColor !== null);
}
