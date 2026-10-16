import type { ItemCategory } from './types';

/**
 * v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): a **background** item is always
 * standable — 「可站立」 is an object-layer concept, so the flag is meaningless
 * (and hidden) for `category = 'background'`.
 *
 * One function, three callers: the create/update schemas (server), the
 * repository (server-side backstop) and the two web forms, so "background ⇒
 * canStand" can never drift apart between them.
 */
export function canStandFor(category: ItemCategory, canStand: boolean): boolean {
  return category === 'background' ? true : canStand;
}
