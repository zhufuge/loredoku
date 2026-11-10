import { describe, expect, it } from 'vitest';
import { nextUnfinishedLevel, type GameLevelRef } from './gameCatalog';

/**
 * v0.9.5：定案卡的「下一关」。
 *
 * 「下一关」＝列表顺序里排在当前这一关之后、**还没通过**的第一关。三件行为分开钉：
 * 跳过已通过的、不回头、不缠绕。
 */

const levels: GameLevelRef[] = [
  { key: 'a', gridSize: 4 },
  { key: 'b', gridSize: 5 },
  { key: 'c', gridSize: 5 },
  { key: 'd', gridSize: 6 },
];

/** 只把 `done` 里那些当作已通过。 */
function completedOf(done: readonly string[]): (level: GameLevelRef) => boolean {
  return (level) => done.includes(level.key);
}

describe('下一关（v0.9.5）', () => {
  it('取列表顺序里的下一关', () => {
    expect(nextUnfinishedLevel(levels, 'a', completedOf(['a']))?.key).toBe('b');
  });

  it('跳过已经通过的那些 —— 玩家要的是「还没做的下一件」', () => {
    expect(nextUnfinishedLevel(levels, 'a', completedOf(['a', 'b', 'c']))?.key).toBe('d');
  });

  it('后面没有了就是没有：不回头、不绕回第一关', () => {
    expect(nextUnfinishedLevel(levels, 'd', completedOf(['d']))).toBeNull();
    // 一关都没通过也一样 —— 当前是最后一关，就没有「下一关」。
    expect(nextUnfinishedLevel(levels, 'd', completedOf([]))).toBeNull();
  });

  it('后面的全通过了也是 null（而不是退回去找前面漏的）', () => {
    expect(nextUnfinishedLevel(levels, 'b', completedOf(['a', 'b', 'c', 'd']))).toBeNull();
  });

  /**
   * 当前这一关不在清单里：地址过时（那一关已被取消部署）或清单比它新。
   * 这时从清单开头找**第一关还没通过的** —— 那才是「下一个还没做的」。
   */
  it('当前这一关不在清单里：从头找第一关没通过的', () => {
    expect(nextUnfinishedLevel(levels, 'gone', completedOf(['a']))?.key).toBe('b');
    expect(nextUnfinishedLevel(levels, 'gone', completedOf([]))?.key).toBe('a');
  });

  it('空清单 / 全通过 → null', () => {
    expect(nextUnfinishedLevel([], 'a', completedOf([]))).toBeNull();
    expect(nextUnfinishedLevel(levels, 'a', completedOf(['a', 'b', 'c', 'd']))).toBeNull();
  });
});
