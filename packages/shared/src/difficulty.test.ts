import { describe, expect, it } from 'vitest';
import { GAME_DIFFICULTY_COLORS, GAME_DIFFICULTY_RAMP_HEX } from './constants';
import {
  DEFAULT_DIFFICULTY_TIERS,
  defaultDifficultyLevel,
  difficultyBadge,
  difficultyBadgeFromColor,
  difficultySwatchColor,
  nextDifficultyLevel,
  resolveDifficultyTiers,
} from './difficulty';
import type { ThemeDifficultyTier } from './types/domain';

/**
 * v0.8.6（docs/v0.8.6.md §3）：难度是**数字档位**，文字与颜色由主题映射。
 *
 * 这一组钉五件事：没配就是内置五档（存量主题不受影响）、列表按档位排序（存进
 * JSON 的顺序不可信）、徽章按位置取色（没选色时与 v0.8.3 完全一样）、选了色就
 * 由它混出底色与字色、档位不在分级里时不炸。
 */

const twoTiers: ThemeDifficultyTier[] = [
  { level: 1, label: '热身' },
  { level: 2, label: '地狱' },
];

describe('resolveDifficultyTiers', () => {
  it('没配 / 空数组 → 内置五档，数字 1…5，名字是中文', () => {
    for (const missing of [undefined, [] as ThemeDifficultyTier[]]) {
      const tiers = resolveDifficultyTiers(missing);
      expect(tiers.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5]);
      expect(tiers.map((tier) => tier.label)).toEqual(['极简', '简单', '中等', '困难', '专家']);
    }
  });

  it('配了就整份替换，不追加', () => {
    expect(resolveDifficultyTiers(twoTiers)).toEqual(twoTiers);
  });

  /**
   * 库里那份 JSON 谁都能手改，而「第 2 档排在第 1 档前面」不会让任何一处报错 ——
   * 只会让徽章取错坡上的颜色。排序收在这一层，取色与列表就永远同一顺序。
   */
  it('按档位升序返回，即使存进去的顺序是乱的', () => {
    const shuffled: ThemeDifficultyTier[] = [
      { level: 3, label: '终' },
      { level: 1, label: '初' },
      { level: 2, label: '中' },
    ];
    expect(resolveDifficultyTiers(shuffled).map((tier) => tier.level)).toEqual([1, 2, 3]);
  });

  it('内置分级与 DEFAULT_DIFFICULTY_TIERS 是同一份', () => {
    expect(DEFAULT_DIFFICULTY_TIERS.map((tier) => tier.level)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('difficultyBadge', () => {
  it('内置五档一一对应内置热力坡', () => {
    const colors = DEFAULT_DIFFICULTY_TIERS.map(
      (tier) => difficultyBadge(undefined, tier.level).backgroundColor,
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
    expect(difficultyBadge(twoTiers, 1).backgroundColor).toBe(GAME_DIFFICULTY_COLORS.veryEasy);
    expect(difficultyBadge(twoTiers, 2).backgroundColor).toBe(GAME_DIFFICULTY_COLORS.expert);
  });

  it('三档的中间一档落在坡的中间，名字取主题给的那个', () => {
    const three: ThemeDifficultyTier[] = [
      { level: 1, label: '初' },
      { level: 2, label: '中' },
      { level: 3, label: '终' },
    ];
    expect(difficultyBadge(three, 2)).toEqual({
      label: '中',
      backgroundColor: GAME_DIFFICULTY_COLORS.medium,
      color: expect.any(String),
    });
  });

  it('选了颜色 → 底色与字色都从这颗色混出来，不再走坡', () => {
    const tiers: ThemeDifficultyTier[] = [{ level: 1, label: '紫', color: '#7c3aed' }];
    expect(difficultyBadge(tiers, 1)).toEqual({
      label: '紫',
      ...difficultyBadgeFromColor('#7c3aed'),
    });
    expect(difficultyBadge(tiers, 1).backgroundColor).toBe(
      'color-mix(in srgb, #7c3aed 20%, hsl(var(--card)))',
    );
    expect(difficultyBadge(tiers, 1).backgroundColor).not.toBe(GAME_DIFFICULTY_COLORS.veryEasy);
  });

  it('档位不在分级里（档被删了）→ 显示「第 N 档」+ 中性灰，而不是报错', () => {
    const badge = difficultyBadge(twoTiers, 5);
    expect(badge.label).toBe('第 5 档');
    expect(badge.backgroundColor).toBe('hsl(var(--muted))');
  });
});

describe('difficultySwatchColor', () => {
  it('没选过色 → 取色器显示的就是徽章此刻用的那颗色', () => {
    expect(difficultySwatchColor(DEFAULT_DIFFICULTY_TIERS, 1)).toBe(GAME_DIFFICULTY_RAMP_HEX[0]);
    expect(difficultySwatchColor(DEFAULT_DIFFICULTY_TIERS, 3)).toBe(GAME_DIFFICULTY_RAMP_HEX[2]);
    expect(difficultySwatchColor(twoTiers, 2)).toBe(GAME_DIFFICULTY_RAMP_HEX[4]);
  });

  it('选过色 → 原样回那一颗', () => {
    expect(difficultySwatchColor([{ level: 1, label: '紫', color: '#7c3aed' }], 1)).toBe('#7c3aed');
  });
});

describe('defaultDifficultyLevel', () => {
  it('内置五档里是第 3 档 —— 与 v0.4 的 medium 一致', () => {
    expect(defaultDifficultyLevel(undefined)).toBe(3);
  });

  it('自定义分级里取正中间那一档，而不是第一档', () => {
    expect(defaultDifficultyLevel(twoTiers)).toBe(1);
    expect(
      defaultDifficultyLevel([
        { level: 10, label: 'A' },
        { level: 20, label: 'B' },
        { level: 30, label: 'C' },
      ]),
    ).toBe(20);
  });

  it('自定义分级里有第 3 档时优先它', () => {
    expect(
      defaultDifficultyLevel([
        { level: 1, label: '热身' },
        { level: 3, label: '适中' },
        { level: 7, label: '地狱' },
      ]),
    ).toBe(3);
  });
});

describe('nextDifficultyLevel', () => {
  it('接在最大的一档后面，不补空档', () => {
    expect(nextDifficultyLevel([])).toBe(1);
    expect(nextDifficultyLevel([{ level: 1, label: 'A' }])).toBe(2);
    expect(
      nextDifficultyLevel([
        { level: 1, label: 'A' },
        { level: 3, label: 'C' },
      ]),
    ).toBe(4);
  });

  it('到 99 之后回填最小的空档', () => {
    const high: ThemeDifficultyTier[] = [
      { level: 1, label: 'A' },
      { level: 2, label: 'B' },
      { level: 99, label: 'Z' },
    ];
    expect(nextDifficultyLevel(high)).toBe(3);
  });
});
