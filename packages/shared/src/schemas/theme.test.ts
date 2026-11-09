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
 * v0.8.6（docs/v0.8.6.md §3）：难度分级进 `data`，一档 = 数字 + 名字 + 可选颜色。
 *
 * 四个硬约束各有理由：至少一档（零档的难度体系等于没有难度）、档位数字唯一
 * （否则 `games.difficulty` 指不出是哪一档）、最多 12 档（再多一屏放不下）、
 * 颜色只收 `#rrggbb`（取色器给的就是这个，别的写法混不出可预期的淡色）。
 */
describe('themeDataSchema.difficultyLevels（v0.8.6）', () => {
  const tiers = [
    { level: 1, label: '热身' },
    { level: 2, label: '地狱' },
  ];

  it('不写就是内置五档 —— 存量主题原样成立', () => {
    expect(themeDataSchema.parse({ version: 1 }).difficultyLevels).toBeUndefined();
  });

  it('写就原样收下，顺序不变', () => {
    const parsed = themeDataSchema.parse({ version: 1, difficultyLevels: tiers });
    expect(parsed.difficultyLevels).toEqual(tiers);
  });

  it('档位可以带颜色，必须写成 #rrggbb', () => {
    const parsed = themeDataSchema.parse({
      version: 1,
      difficultyLevels: [{ level: 1, label: '热身', color: '#2F5C2D' }],
    });
    expect(parsed.difficultyLevels?.[0]?.color).toBe('#2F5C2D');

    for (const bad of ['red', '#2f5', '2f5c2d', '#2f5c2d80', 'rgb(1,2,3)']) {
      expect(
        themeDataSchema.safeParse({
          version: 1,
          difficultyLevels: [{ level: 1, label: '热身', color: bad }],
        }).success,
        bad,
      ).toBe(false);
    }
  });

  it('档位必须是 1…99 的整数，名字不能空', () => {
    for (const badLevel of [0, -1, 1.5, 100, '1']) {
      expect(
        themeDataSchema.safeParse({
          version: 1,
          difficultyLevels: [{ level: badLevel, label: '热' }],
        }).success,
        String(badLevel),
      ).toBe(false);
    }
    expect(
      themeDataSchema.safeParse({ version: 1, difficultyLevels: [{ level: 1, label: ' ' }] })
        .success,
    ).toBe(false);
  });

  it('空数组被拒，一档都没有不叫分级', () => {
    expect(themeDataSchema.safeParse({ version: 1, difficultyLevels: [] }).success).toBe(false);
  });

  it('档位数字重复被拒，并说出是哪一个', () => {
    const parsed = themeDataSchema.safeParse({
      version: 1,
      difficultyLevels: [...tiers, { level: 1, label: '又一个' }],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.success ? '' : parsed.error.issues[0]?.message).toContain('1');
  });

  it('超过 12 档被拒', () => {
    const many = Array.from({ length: 13 }, (_, index) => ({
      level: index + 1,
      label: `第 ${index + 1} 档`,
    }));
    expect(themeDataSchema.safeParse({ version: 1, difficultyLevels: many }).success).toBe(false);
  });
});

/**
 * v0.8.6（docs/v0.8.6.md §4）：主题的禁止符号缺省 —— 与谜题侧同一个形状，
 * 新建谜题那一刻被抄走；缺失 / null 都表示「默认 ×」。
 */
describe('themeDataSchema 的禁止符号缺省（v0.8.6 §4）', () => {
  it('缺省 / null 与一张上传图都合法', () => {
    expect(themeDataSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(themeDataSchema.safeParse({ version: 1, forbiddenSymbol: null }).success).toBe(true);
    const parsed = themeDataSchema.safeParse({
      version: 1,
      forbiddenSymbol: { path: 'themes/3/forbidden-symbol/x.webp' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.forbiddenSymbol).toEqual({ path: 'themes/3/forbidden-symbol/x.webp' });
    }
  });

  it('路径不能为空、不能往上跳、不能多带键', () => {
    for (const bad of [
      { path: '' },
      { path: '/absolute/x.webp' },
      { path: 'themes/../../etc/passwd' },
      { path: 'themes/3/x.webp', extra: 1 },
    ] as Array<unknown>) {
      expect(
        themeDataSchema.safeParse({ version: 1, forbiddenSymbol: bad }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });
});
/**
 * v0.9.2 §2：长按计时环那张图走的是「禁止符号」同一个形状 —— `{ path }` 或
 * `null` / 缺省。`themeDataSchema` 是 `.strict()` 的，少写这一项会让作者
 * 一上传就 400，所以这里把它钉住。
 */
describe('themeDataSchema.pressRing（v0.9.2）', () => {
  it('缺省是 undefined，null 与 {path} 都收', () => {
    expect(themeDataSchema.parse({ version: 1 }).pressRing).toBeUndefined();
    expect(themeDataSchema.parse({ version: 1, pressRing: null }).pressRing).toBeNull();
    expect(
      themeDataSchema.parse({ version: 1, pressRing: { path: 'themes/1/press-ring/a.webp' } })
        .pressRing,
    ).toEqual({ path: 'themes/1/press-ring/a.webp' });
  });

  it('路径不能往上跳，形状必须只有 path', () => {
    expect(
      themeDataSchema.safeParse({ version: 1, pressRing: { path: '../etc/passwd' } }).success,
    ).toBe(false);
    expect(
      themeDataSchema.safeParse({ version: 1, pressRing: { path: 'themes/1/a.webp', x: 1 } })
        .success,
    ).toBe(false);
  });
});
