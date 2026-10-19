import type { Asset, AssetForm, AssetType } from './types';

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
 * v0.6.1: which form a canvas anchor resolves to (docs/v0.6.1.md §6.2). The
 * single place that decides, so the editor, the preview and the game can't drift.
 *
 * A missing or dangling `formId` falls back to the asset's first form: payloads
 * written before the field existed carry no `formId` at all, and a form deleted
 * after a version was published leaves a dangling id behind.
 */
export function resolveAssetForm(asset: Asset, formId?: number | null): AssetForm | undefined {
  if (formId !== undefined && formId !== null) {
    const match = asset.forms.find((form) => form.id === formId);
    if (match) return match;
  }
  return asset.forms[0];
}

/**
 * v0.6.1: an asset can only be enabled once **some** form has a look (an image
 * or a colour block) — the same predicate v0.5.1 used when an image was deleted,
 * widened from one asset to one of its forms.
 */
export function assetHasAppearance(asset: Asset): boolean {
  return asset.forms.some((form) => form.imageUrl !== null || form.bgColor !== null);
}
