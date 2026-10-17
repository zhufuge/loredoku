import type { ItemCategory } from './types';

/**
 * v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): a **background** item is always standable
 * — 「可站立」 is an object-layer concept, meaningless for `background`. One
 * function, three callers (schemas, repository, web forms), so the rule can't drift.
 */
export function canStandFor(category: ItemCategory, canStand: boolean): boolean {
  return category === 'background' ? true : canStand;
}
