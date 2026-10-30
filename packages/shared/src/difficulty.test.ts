import { describe, expect, it } from 'vitest';
import { GAME_DIFFICULTY_COLORS } from './constants';
import {
  DEFAULT_DIFFICULTY_TIERS,
  defaultDifficultyKey,
  difficultyBadge,
  nextDifficultyKey,
  resolveDifficultyTiers,
} from './difficulty';
import type { ThemeDifficultyTier } from './types/domain';

/**
 * v0.8.3（docs/v0.8.3.md §3）：分级从「写死的五档」变成「主题说了算」。
 *
 * 这一组钉四件事：没配就是内置五档（存量主题不受影响）、徽章按位置取色
 * （作者改不动颜色，也不该改）、标识不在分级里时不炸、部署默认档跟着分级走。
 */

const twoTiers: ThemeDifficultyTier[] = [
  { key: 'warmup', label: '热身' },
  { key: 'brutal', label: '地狱' },
];

describe('resolveDifficultyTiers', () => {
  it('没配 / 空数组 → 内置五档，名字是中文', () => {
    for (const missing of [undefined, [] as ThemeDifficultyTier[]]) {
      const tiers = resolveDifficultyTiers(missing);
      expect(tiers.map((tier) => tier.key)).toEqual([
        'veryEasy',
        'easy',
        'medium',
        'hard',
        'expert',
      ]);
      expect(tiers.map((tier) => tier.label)).toEqual(['极简', '简单', '中等', '困难', '专家']);
    }
  });

  it('配了就整份替换，不是追加', () => {
    expect(resolveDifficultyTiers(twoTiers)).toBe(twoTiers);
  });

  it('内置分级与 DEFAULT_DIFFICULTY_TIERS 是同一份', () => {
    expect(DEFAULT_DIFFICULTY_TIERS.map((tier) => tier.key)).toEqual([
      'veryEasy',
      'easy',
      'medium',
      'hard',
      'expert',
    ]);
  });
});

describe('difficultyBadge', () => {
  it('内置五档一一对应内置热力坡', () => {
    const colors = DEFAULT_DIFFICULTY_TIERS.map(
      (tier) => difficultyBadge(undefined, tier.key).backgroundColor,
    );
    expect(colors).toEqual([
      GAME_DIFFICULTY_COLORS.veryEasy,
      GAME_DIFFICULTY_COLORS.easy,
      GAME_DIFFICULTY_COLORS.medium,
      GAME_DIFFICULTY_COLORS.hard,
      GAME_DIFFICULTY_COLORS.expert,
    ]);
  });

  it('自定义分级：两端的档拿到两端的颜色', () => {
    expect(difficultyBadge(twoTiers, 'warmup').backgroundColor).toBe(
      GAME_DIFFICULTY_COLORS.veryEasy,
    );
    expect(difficultyBadge(twoTiers, 'brutal').backgroundColor).toBe(GAME_DIFFICULTY_COLORS.expert);
  });

  it('三档的中间一档落在坡的中间，名字取主题给的那个', () => {
    const three: ThemeDifficultyTier[] = [
      { key: 'a', label: '初' },
      { key: 'b', label: '中' },
      { key: 'c', label: '终' },
    ];
    expect(difficultyBadge(three, 'b')).toEqual({
      label: '中',
      backgroundColor: GAME_DIFFICULTY_COLORS.medium,
      color: expect.any(String),
    });
  });

  it('标识不在分级里（档被删了）→ 原样显示标识 + 中性灰，而不是报错', () => {
    const badge = difficultyBadge(twoTiers, 'expert');
    expect(badge.label).toBe('expert');
    expect(badge.backgroundColor).toBe('hsl(var(--muted))');
  });
});

describe('defaultDifficultyKey', () => {
  it('内置五档里是 medium —— 与 v0.4 的默认一致', () => {
    expect(defaultDifficultyKey(undefined)).toBe('medium');
  });

  it('自定义分级里取正中间那一档，而不是第一档', () => {
    expect(defaultDifficultyKey(twoTiers)).toBe('warmup');
    expect(
      defaultDifficultyKey([
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
        { key: 'c', label: 'C' },
      ]),
    ).toBe('b');
  });

  it('自定义分级里也有 medium 时优先 medium', () => {
    expect(
      defaultDifficultyKey([
        { key: 'warmup', label: '热身' },
        { key: 'medium', label: '适中' },
        { key: 'brutal', label: '地狱' },
      ]),
    ).toBe('medium');
  });
});

describe('nextDifficultyKey', () => {
  it('生成一个没被占用的标识', () => {
    expect(nextDifficultyKey([])).toBe('tier-1');
    expect(nextDifficultyKey([{ key: 'tier-1', label: 'A' }])).toBe('tier-2');
    expect(
      nextDifficultyKey([
        { key: 'tier-1', label: 'A' },
        { key: 'tier-3', label: 'C' },
      ]),
    ).toBe('tier-2');
  });
});
