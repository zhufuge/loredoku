import { describe, expect, it } from 'vitest';
import {
  GAME_DIFFICULTY_LEVELS,
  GAME_NAME_MAX_LENGTH,
  GAME_SLUG_MAX_LENGTH,
  MAP_LAYER_ORDER,
  MAP_LAYER_Z,
} from '../constants';
import { cellPlacementSchema, gameDeploySchema, gameSlugParamSchema, gameWeightUpdateSchema } from './game';

describe('MAP_LAYER_ORDER / MAP_LAYER_Z (SPEC-G01 / SPEC-G02)', () => {
  it('lists fifteen layers, the two game-only ones between 区域标签 and 物品图层', () => {
    expect(MAP_LAYER_ORDER).toEqual([
      'mouseCursorBox',
      'operationCursorBox',
      'regionLabel',
      'gameToolHint',
      'gamePlacement',
      'itemLayer',
      'regionOutline',
      'canvasFrame',
      'gridSeparator',
      'blockingMask',
      'regionHighlight',
      'cellHighlight',
      'backgroundHighlight',
      'backgroundLayer',
      'canvasBase',
    ]);
  });

  it('assigns a strictly descending z-index with no duplicates', () => {
    const values = MAP_LAYER_ORDER.map((name) => MAP_LAYER_Z[name]);
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index - 1]!).toBeGreaterThan(values[index]!);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('keeps the mouse box the top-most element', () => {
    expect(MAP_LAYER_Z.mouseCursorBox).toBe(Math.max(...Object.values(MAP_LAYER_Z)));
  });

  it('registers the two game layers between 区域标签 and 物品图层', () => {
    expect(MAP_LAYER_Z.regionLabel).toBeGreaterThan(MAP_LAYER_Z.gameToolHint);
    expect(MAP_LAYER_Z.gameToolHint).toBeGreaterThan(MAP_LAYER_Z.gamePlacement);
    expect(MAP_LAYER_Z.gamePlacement).toBeGreaterThan(MAP_LAYER_Z.itemLayer);
  });
});

describe('gameDeploySchema (FEAT-G02 §5.2, CONS-K16 起按谜题部署)', () => {
  it('accepts a full deploy body', () => {
    const parsed = gameDeploySchema.parse({
      name: '  神秘古堡  ',
      difficulty: 5,
      clearCover: false,
    });
    expect(parsed.name).toBe('神秘古堡');
    expect(parsed.difficulty).toBe(5);
    expect(parsed.clearCover).toBe(false);
  });

  /**
   * v0.8.6：缺省难度**不再由 schema 决定** —— 由服务端按谜题所属主题分级补
   * （内置五档给第 3 档，自定义分级给正中间那一档）。schema 里写死一个值，
   * 只会让「只有两档」的主题连部署都做不了。
   */
  it('leaves the difficulty to the service and the name to the service', () => {
    const parsed = gameDeploySchema.parse({});
    expect(parsed.difficulty).toBeUndefined();
    expect(parsed.name).toBeUndefined();
  });

  it('no longer takes a version number — the puzzle pins it (v0.5.0)', () => {
    expect('versionNo' in gameDeploySchema.parse({})).toBe(false);
    expect(gameDeploySchema.safeParse({ versionNo: 3 }).success).toBe(true);
  });

  /**
   * v0.8.6：难度是**档位数字**，schema 只判断「1…99 的整数」。
   * 某个数字是不是这个主题的一档，由服务端拿着主题去核对（`api.test.ts` 的
   * 「自定义分级」一组）。字符串在这里一律不合法 —— 连 `'3'` 也不收，接口是
   * JSON，不是查询串。
   */
  it('rejects a difficulty that is not an integer level', () => {
    for (const bad of ['3', 'expert', 0, 100, 2.5, -1, null]) {
      expect(gameDeploySchema.safeParse({ difficulty: bad }).success, String(bad)).toBe(false);
    }
    for (const good of [1, 3, 99]) {
      expect(gameDeploySchema.safeParse({ difficulty: good }).success, String(good)).toBe(true);
    }
  });

  it('rejects an over-long name', () => {
    expect(
      gameDeploySchema.safeParse({ name: 'x'.repeat(GAME_NAME_MAX_LENGTH + 1) }).success,
    ).toBe(false);
  });

  it('accepts every built-in difficulty level', () => {
    for (const [index] of GAME_DIFFICULTY_LEVELS.entries()) {
      const difficulty = index + 1;
      expect(gameDeploySchema.parse({ difficulty }).difficulty).toBe(difficulty);
    }
  });
});

/**
 * v0.8.3：`sortWeight` 的**不给默认值**是刻意的 —— 缺省与 0 是两句话。
 *
 * 缺省 = 「这次没提」，服务端沿用上一行的值；0 = 「就排 0」。两者混成一个，
 * 重新部署（delete-then-insert）就会把作者排好的顺序冲掉。
 */
describe('gameDeploySchema sortWeight (v0.8.3)', () => {
  it('缺省时不落 0，交给仓储沿用上一行', () => {
    expect(gameDeploySchema.parse({}).sortWeight).toBeUndefined();
  });

  it('显式 0 与缺省是两回事', () => {
    expect(gameDeploySchema.parse({ sortWeight: 0 }).sortWeight).toBe(0);
  });

  it('接受区间内的负值（想把一关顶到最前面就得靠它）', () => {
    expect(gameDeploySchema.parse({ sortWeight: -999 }).sortWeight).toBe(-999);
    expect(gameDeploySchema.parse({ sortWeight: 999 }).sortWeight).toBe(999);
  });

  it('拒绝越界与非整数，而不是静默改成 0', () => {
    for (const bad of [1000, -1000, 1.5, Number.NaN]) {
      expect(gameDeploySchema.safeParse({ sortWeight: bad }).success, String(bad)).toBe(false);
    }
    expect(gameDeploySchema.safeParse({ sortWeight: '3' }).success).toBe(false);
  });
});

/**
 * v0.8.5：`PATCH /api/games/:id` 的入参 —— 与部署 schema 的唯一区别是
 * `sortWeight` **必填**：这条端点只做「改顺序」一件事，少一个键的意思只能是
 * 请求写错了，静默成功只会让作者以为改上了。
 */
describe('gameWeightUpdateSchema (v0.8.5)', () => {
  it('接受区间内的整数（含负数）', () => {
    for (const value of [-999, -3, 0, 42, 999]) {
      expect(gameWeightUpdateSchema.parse({ sortWeight: value }).sortWeight).toBe(value);
    }
  });

  it('缺键是错误 —— 不是「沿用上一次」', () => {
    expect(gameWeightUpdateSchema.safeParse({}).success).toBe(false);
    expect(gameWeightUpdateSchema.safeParse({ weight: 3 }).success).toBe(false);
  });

  it('越界、非整数、字符串都拒', () => {
    for (const bad of [1000, -1000, 1.5, Number.NaN, '3', null]) {
      expect(gameWeightUpdateSchema.safeParse({ sortWeight: bad }).success, String(bad)).toBe(
        false,
      );
    }
  });
});

describe('gameDeploySchema slug & clearCover (OPT-W04 / OPT-W03)', () => {
  it('trims an author-supplied slug', () => {
    const parsed = gameDeploySchema.parse({ slug: '  puzzle-castle-hard  ' });
    expect(parsed.slug).toBe('puzzle-castle-hard');
  });

  it('leaves the slug undefined so the service can derive the default', () => {
    expect(gameDeploySchema.parse({}).slug).toBeUndefined();
    expect(gameDeploySchema.parse({ clearCover: false }).clearCover).toBe(false);
  });

  it('rejects an over-long slug but still accepts an empty one for the service to judge', () => {
    expect(
      gameDeploySchema.safeParse({ slug: 'x'.repeat(GAME_SLUG_MAX_LENGTH + 1) }).success,
    ).toBe(false);
    expect(gameDeploySchema.parse({ slug: '' }).slug).toBe('');
  });

  it('flag the "remove the stored cover" request separately from the cover bytes', () => {
    const parsed = gameDeploySchema.parse({ clearCover: true });
    expect(parsed.clearCover).toBe(true);
    // v0.7.1 §7.2: the mime / size / dimension fields are gone with the columns.
    expect(parsed).not.toHaveProperty('coverPath');
  });
});

describe('gameSlugParamSchema (OPT-W04 §4.6)', () => {
  it('accepts a well-formed path segment', () => {
    expect(gameSlugParamSchema.parse({ slug: '  puzzle-flower-garden-very-easy  ' }).slug).toBe(
      'puzzle-flower-garden-very-easy',
    );
  });

  it('rejects uppercase, spaces and over-long segments before they reach the database', () => {
    expect(gameSlugParamSchema.safeParse({ slug: 'Puzzle' }).success).toBe(false);
    expect(gameSlugParamSchema.safeParse({ slug: 'puzzle flower' }).success).toBe(false);
    expect(gameSlugParamSchema.safeParse({ slug: 'x'.repeat(GAME_SLUG_MAX_LENGTH + 1) }).success).toBe(
      false,
    );
  });
});

describe('cellPlacementSchema (SPEC-G01 §7.1)', () => {
  it('accepts the three mutually exclusive forms', () => {
    expect(cellPlacementSchema.parse({ kind: 'participant', index: 2 })).toEqual({
      kind: 'participant',
      index: 2,
    });
    expect(cellPlacementSchema.parse({ kind: 'numbers', entries: [1, 3] })).toEqual({
      kind: 'numbers',
      entries: [1, 3],
    });
    expect(cellPlacementSchema.parse({ kind: 'forbidden' })).toEqual({ kind: 'forbidden' });
  });

  it('rejects a zero / negative participant index', () => {
    expect(cellPlacementSchema.safeParse({ kind: 'participant', index: 0 }).success).toBe(false);
    expect(cellPlacementSchema.safeParse({ kind: 'numbers', entries: [0] }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(cellPlacementSchema.safeParse({ kind: 'sticker' }).success).toBe(false);
  });
});
