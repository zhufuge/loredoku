import { describe, expect, it } from 'vitest';
import { createThemeSchema, themeCodeSchema, themeDataSchema } from './theme';

/**
 * v0.8.0 §18：主题编码是工作空间的地址前缀（`/hlm/maps`），所以除了字符集，还要拦
 * **顶层静态路径** —— 一个叫 `settings` 的主题永远打不开自己的工作台。
 */

function codeError(input: string): string | null {
  const parsed = themeCodeSchema.safeParse(input);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? '');
}

describe('themeCodeSchema（v0.8.0 §18）', () => {
  it('普通编码照常通过', () => {
    expect(codeError('hlm')).toBeNull();
    expect(codeError('hlm-2')).toBeNull();
    expect(codeError('hong_lou_meng')).toBeNull();
  });

  it('顶层静态路径被拦下，并说出被占用的那个词', () => {
    for (const reserved of ['settings', 'play', 'maps', 'assets', 'themes']) {
      const message = codeError(reserved);
      expect(message, reserved).not.toBeNull();
      expect(message).toContain(reserved);
      expect(message).toContain('换一个编码');
    }
  });

  it('只拦整个编码，不拦包含保留词的编码', () => {
    // `maps-old` 不是 `/maps`，两者不冲突。
    expect(codeError('maps-old')).toBeNull();
  });

  it('字符集与长度照旧', () => {
    expect(codeError('Hlm')).not.toBeNull();
    expect(codeError('-hlm')).not.toBeNull();
    expect(codeError('')).not.toBeNull();
  });

  it('创建时同样走这套校验（不是只有单独调用才拦）', () => {
    const parsed = createThemeSchema.safeParse({ code: 'settings', name: '设置' });
    expect(parsed.success).toBe(false);
  });
});

/**
 * v0.8.2：`data.accent` 是主题的识别色 —— 只给界面认人用，不进包、不参与渲染。
 * 它可选，且只收 `#RRGGBB`：颜色以字符串进 JSONB，写错了就是一个没人能改的脏值。
 */
describe('themeDataSchema.accent（v0.8.2）', () => {
  it('不写就是没有 —— 没设过色带的主题是合法的', () => {
    const parsed = themeDataSchema.parse({ version: 1 });
    expect(parsed.accent).toBeUndefined();
  });

  it('写就得是 #RRGGBB', () => {
    expect(themeDataSchema.parse({ version: 1, accent: '#B93A32' }).accent).toBe('#B93A32');
    expect(themeDataSchema.safeParse({ version: 1, accent: 'B93A32' }).success).toBe(false);
    expect(themeDataSchema.safeParse({ version: 1, accent: '#f00' }).success).toBe(false);
    expect(themeDataSchema.safeParse({ version: 1, accent: 0xb93a32 }).success).toBe(false);
  });

  it('与缺省风格、调色板并存，互不覆盖', () => {
    const parsed = themeDataSchema.parse({
      version: 1,
      accent: '#326385',
      style: {},
      linkageColors: [{ key: 'red', label: '红', color: '#B93A32' }],
    });
    expect(parsed.accent).toBe('#326385');
    // `style: {}` 按 DEFAULT_MAP_STYLE 补齐 —— 加了 accent 之后这条行为不变。
    expect(parsed.style?.cellSize).toBeDefined();
    expect(parsed.linkageColors).toHaveLength(1);
  });
});

/**
 * v0.8.3（docs/v0.8.3.md §3）：难度分级进 `data`。
 *
 * 三个硬约束各有理由：至少一档（零档的难度体系等于没有难度）、标识唯一（否则
 * `games.difficulty` 指不出是哪一档）、最多 12 档（再多一屏放不下，也没人做）。
 */
describe('themeDataSchema.difficultyLevels（v0.8.3）', () => {
  const tiers = [
    { key: 'warmup', label: '热身' },
    { key: 'brutal', label: '地狱' },
  ];

  it('不写就是内置五档 —— 存量主题原样成立', () => {
    expect(themeDataSchema.parse({ version: 1 }).difficultyLevels).toBeUndefined();
  });

  it('写就原样收下，顺序不变', () => {
    const parsed = themeDataSchema.parse({ version: 1, difficultyLevels: tiers });
    expect(parsed.difficultyLevels).toEqual(tiers);
  });

  it('标识必须是短横线小写标识，名字不能空', () => {
    expect(
      themeDataSchema.safeParse({ version: 1, difficultyLevels: [{ key: 'Warm Up', label: '热' }] })
        .success,
    ).toBe(false);
    expect(
      themeDataSchema.safeParse({ version: 1, difficultyLevels: [{ key: 'warmup', label: ' ' }] })
        .success,
    ).toBe(false);
  });

  it('空数组被拒，一档都没有不叫分级', () => {
    expect(themeDataSchema.safeParse({ version: 1, difficultyLevels: [] }).success).toBe(false);
  });

  it('标识重复被拒，并说出是哪一个', () => {
    const parsed = themeDataSchema.safeParse({
      version: 1,
      difficultyLevels: [...tiers, { key: 'warmup', label: '又一个' }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.error.issues[0]?.message).toContain('warmup');
  });

  it('超过 12 档被拒', () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      key: `tier-${index + 1}`,
      label: `第 ${index + 1} 档`,
    }));
    expect(themeDataSchema.safeParse({ version: 1, difficultyLevels: many }).success).toBe(false);
  });
});
