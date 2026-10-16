import { describe, expect, it } from 'vitest';
import { canStandFor } from './itemRules';

/**
 * v0.5.2 FEAT-M04 (docs/v0.5.2.md §4): 「背景」类型的物品一定可站立，
 * 「可站立」只对「物体」类型有意义。
 */
describe('canStandFor (FEAT-M04)', () => {
  it('forces true for a background item', () => {
    expect(canStandFor('background', false)).toBe(true);
    expect(canStandFor('background', true)).toBe(true);
  });

  it('follows the caller for an object item', () => {
    expect(canStandFor('object', true)).toBe(true);
    expect(canStandFor('object', false)).toBe(false);
  });
});
