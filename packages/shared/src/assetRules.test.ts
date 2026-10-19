import { describe, expect, it } from 'vitest';
import { blockingFor } from './assetRules';

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
