import type { AssetType } from './types';

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
