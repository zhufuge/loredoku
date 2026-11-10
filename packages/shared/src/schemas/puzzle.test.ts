import { describe, expect, it } from 'vitest';
import {
  GRID_SIZE_MAX,
  PARTICIPANT_DISPLAY_NUMBER_MAX,
  PUZZLE_CLUE_MAX_LENGTH,
  PUZZLE_CLUES_MAX_COUNT,
  PUZZLE_DESCRIPTION_MAX_LENGTH,
  PUZZLE_ENDING_MAX_LENGTH,
  PUZZLE_NAME_MAX_LENGTH,
} from '../constants';
import {
  createPuzzleSchema,
  forkPuzzleVersionBodySchema,
  puzzleDraftSchema,
  savePuzzleDraftSchema,
  updatePuzzleSchema,
} from './puzzle';

const palette = [
  { key: 'red', label: '红', color: '#E5484D' },
  { key: 'blue', label: '蓝', color: '#3E63DD' },
];

const slot = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  characterId: 12,
  themeColor: '#FFFFFF',
  clue: '',
  linkages: [],
  ...extra,
});

const mapSnapshot = (gridSize = 6): Record<string, unknown> => ({
  mapId: 217,
  versionNo: 3,
  mapName: '午夜花园',
  data: { version: 7, gridSize, cells: {}, regions: [] },
});

function draft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    map: mapSnapshot(),
    name: '午夜花园',
    description: '六人六格，注意花丛的位置条件。',
    linkageColors: palette,
    characterSlots: [slot(), null, null, null, null, null],
    ...extra,
  };
}

describe('puzzleDraftSchema —— v0.7.1 底图快照 + 名册结构', () => {
  it('accepts the documented payload shape', () => {
    const result = puzzleDraftSchema.safeParse(draft());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.map).toEqual(mapSnapshot());
    expect(result.data.map.data.gridSize).toBe(6);
    expect(result.data.linkageColors.map((entry) => entry.key)).toEqual(['red', 'blue']);
  });

  it('rejects unknown top-level keys (schema stays strict)', () => {
    expect(puzzleDraftSchema.safeParse(draft({ cells: {} })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ style: {} })).success).toBe(false);
  });

  it('rejects a map snapshot without a canvas (the v1 reference shape)', () => {
    // v1 payloads are readable only through `absorbLegacyPuzzleDraft`; a raw v1
    // object must not slip through the v2 schema.
    expect(
      puzzleDraftSchema.safeParse(draft({ map: { mapId: 217, versionNo: 3, gridSize: 6 } })).success,
    ).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ map: { mapId: 1, versionNo: 3 } })).success).toBe(false);
    expect(
      puzzleDraftSchema.safeParse(
        draft({ map: { ...mapSnapshot(), data: { version: 7, gridSize: 99, cells: {}, regions: [] } } }),
      ).success,
    ).toBe(false);
  });

  it('requires the palette (no silent default) and enforces 2 ~ 12 entries', () => {
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: undefined })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: [palette[0]] })).success).toBe(false);
    const twelve = Array.from({ length: 12 }, (_, index) => ({
      key: `k${index}`,
      label: `k${index}`,
      color: '#123456',
    }));
    expect(puzzleDraftSchema.safeParse(draft({ linkageColors: twelve })).success).toBe(true);
    expect(
      puzzleDraftSchema.safeParse(
        draft({ linkageColors: [...twelve, { key: 'k13', label: 'x', color: '#123456' }] }),
      ).success,
    ).toBe(false);
  });

  it('caps the description and requires a non-empty name', () => {
    expect(
      puzzleDraftSchema.safeParse(draft({ description: 'x'.repeat(PUZZLE_DESCRIPTION_MAX_LENGTH + 1) }))
        .success,
    ).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ description: '' })).success).toBe(true);
    expect(puzzleDraftSchema.safeParse(draft({ name: '   ' })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(draft({ name: 'x'.repeat(PUZZLE_NAME_MAX_LENGTH + 1) })).success).toBe(
      false,
    );
  });

  it('does not constrain the roster length to gridSize', () => {
    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [] })).success).toBe(true);
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: Array.from({ length: 20 }, () => null) }))
        .success,
    ).toBe(true);
  });

  /**
   * v0.6.3 (docs/v0.6.3.md §3.1) — the roster's column count.
   *
   * The point of the field being optional: a puzzle saved before this version
   * has no such key and must still load, and it loads as 自动 — which is
   * exactly the layout it had. That is also why the JSON version stays put.
   */
  it('keeps the roster column count optional and bounded', () => {
    const older = puzzleDraftSchema.parse(draft());
    expect(older.rosterCols).toBeUndefined();

    expect(puzzleDraftSchema.safeParse(draft({ rosterCols: null })).success).toBe(true);
    expect(puzzleDraftSchema.parse(draft({ rosterCols: 3 })).rosterCols).toBe(3);
    // The board's own bound, not the roster's — a column count above the slot
    // count is clamped at render time, not refused here.
    expect(puzzleDraftSchema.safeParse(draft({ rosterCols: GRID_SIZE_MAX })).success).toBe(true);

    for (const bad of [0, -2, 2.5, GRID_SIZE_MAX + 1, '3'] as Array<unknown>) {
      expect(puzzleDraftSchema.safeParse(draft({ rosterCols: bad })).success, String(bad)).toBe(
        false,
      );
    }
  });

  /**
   * v0.6.4 (docs/v0.6.4.md §2) — the per-participant 编号展示 text.
   *
   * Same optional-field rule as `rosterCols`: a payload saved before this
   * version has no such key and still parses, and the badge then shows the
   * sequence number — which is what it always showed. Trimmed on the way in,
   * bounded, and `null` is accepted so "cleared" round-trips.
   */
  it('keeps the participant 编号展示 text optional, trimmed and bounded', () => {
    const older = puzzleDraftSchema.parse(draft());
    expect(older.characterSlots[0]).not.toHaveProperty('displayNumber');

    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: '甲' })] })).success).toBe(
      true,
    );
    expect(
      puzzleDraftSchema.parse(draft({ characterSlots: [slot({ displayNumber: '  7  ' })] }))
        .characterSlots[0],
    ).toMatchObject({ displayNumber: '7' });
    expect(puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: null })] })).success).toBe(
      true,
    );

    const tooLong = 'x'.repeat(PARTICIPANT_DISPLAY_NUMBER_MAX + 1);
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: tooLong })] })).success,
    ).toBe(false);
    for (const bad of [7, {}, []] as Array<unknown>) {
      expect(
        puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ displayNumber: bad })] })).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
  });

  /**
   * v0.8.6（docs/v0.8.6.md §4）；v0.9.5 起字段名为 `mark` —— **标记**用哪张图。
   *
   * 与 `rosterCols` 同一条可选字段规则：老版本行没有这个键照样解析，值缺席 =
   * 默认的 `×`。`null` 与缺席等价（= 跟随主题）。
   *
   * 旧键 `forbiddenSymbol` 仍读得出来（冻结的版本行、旧导出包），由
   * `withLegacyImageKeys` 在读入时搬成 `mark`。
   */
  it('keeps the mark image optional and strict', () => {
    const older = puzzleDraftSchema.parse(draft());
    expect(older.mark).toBeUndefined();
    expect(puzzleDraftSchema.parse(draft({ mark: null })).mark).toBeNull();

    const chosen = puzzleDraftSchema.parse(draft({ mark: { path: 'puzzles/12/mark/a1b2.webp' } }));
    expect(chosen.mark).toEqual({ path: 'puzzles/12/mark/a1b2.webp' });

    for (const bad of [
      {},
      { path: '' },
      { path: '/etc/passwd' },
      { path: 'puzzles/../themes/x.webp' },
      { path: 'a.webp' },
      { path: 7 },
      { path: 'puzzles/1/x.webp', extra: true },
      'puzzles/1/x.webp',
    ] as Array<unknown>) {
      expect(puzzleDraftSchema.safeParse(draft({ mark: bad })).success, JSON.stringify(bad)).toBe(
        false,
      );
    }
  });

  /** v0.9.5：v0.9.5 之前落库的谜题行还带着旧键，读进来必须落到 `mark` 上。 */
  it('读得懂 v0.9.5 之前的 forbiddenSymbol（旧键搬到 mark）', () => {
    const legacy = puzzleDraftSchema.parse(
      draft({ forbiddenSymbol: { path: 'puzzles/12/forbidden-symbol/a1b2.webp' } }),
    );
    expect(legacy.mark).toEqual({ path: 'puzzles/12/forbidden-symbol/a1b2.webp' });
    // 旧键本身不再出现在解析结果里（写回去时只会写新键）。
    expect(legacy).not.toHaveProperty('forbiddenSymbol');
  });
});

describe('puzzleDraftSchema 自洽引用校验 (§5.2 第一半)', () => {
  it('accepts character / cell / color references that resolve', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [
          slot({
            characterId: 12,
            linkages: [
              { type: 'character', id: 34, effect: 'highlight', color: 'red' },
              { type: 'cell', cells: [[3, 4]], effect: 'highlight', color: 'blue' },
            ],
          }),
          slot({ characterId: 34 }),
          null,
          null,
          null,
          null,
        ],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a dangling character target', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'character', id: 999, effect: 'highlight', color: 'red' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('不在参与者中'))).toBe(true);
  });

  it('rejects a cell target outside the referenced gridSize', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'cell', cells: [[99, 0]], effect: 'highlight', color: 'red' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('超出画布范围'))).toBe(true);
  });

  it('rejects a linkage colour missing from the puzzle palette', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({
        characterSlots: [slot({ linkages: [{ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'green' }] })],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('green'))).toBe(true);
  });

  it('rejects a position condition outside the referenced gridSize', () => {
    const result = puzzleDraftSchema.safeParse(
      draft({ characterSlots: [slot({ positionConditions: [{ x: 6, y: 0 }] })] }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.message.includes('超出画布范围'))).toBe(true);
  });

  it('accepts an in-bounds position condition', () => {
    expect(
      puzzleDraftSchema.safeParse(draft({ characterSlots: [slot({ positionConditions: [{ x: 5, y: 0 }] })] }))
        .success,
    ).toBe(true);
  });

  it('leaves asset / region targets to validatePuzzleReferences (§5.2 第二半)', () => {
    // The schema cannot see the map's canvas, so an unresolvable asset target
    // is accepted here — `validatePuzzleReferences` rejects it.
    expect(
      puzzleDraftSchema.safeParse(
        draft({
          characterSlots: [
            slot({ linkages: [{ type: 'asset', id: 999, scope: 'all', effect: 'highlight', color: 'red' }] }),
          ],
        }),
      ).success,
    ).toBe(true);
  });
});

describe('谜题的三个写入 schema', () => {
  /**
   * v0.8.5 §7：`code` 是**必填**的，而且形状必须是路径中段（小写 / 数字 / 连字符）——
   * 部署时它原样落进 `/play/puzzle-{code}`，允许大写或下划线等于允许一条打不开的
   * 链接。
   */
  it('createPuzzleSchema requires name + code + mapId + mapVersionNo', () => {
    const ok = { name: '午夜花园', code: 'midnight-garden', mapId: 217, mapVersionNo: 3 };
    expect(createPuzzleSchema.safeParse(ok).success).toBe(true);
    // 缺编码 = 缺「这一关叫什么」，按不下去。
    expect(createPuzzleSchema.safeParse({ name: '午夜花园', mapId: 217, mapVersionNo: 3 }).success).toBe(
      false,
    );
    expect(createPuzzleSchema.safeParse({ ...ok, code: 'x' }).success).toBe(false);
    expect(createPuzzleSchema.safeParse({ ...ok, code: 'Midnight_Garden' }).success).toBe(false);
    expect(createPuzzleSchema.safeParse({ ...ok, code: '-garden' }).success).toBe(false);
    expect(createPuzzleSchema.safeParse({ ...ok, mapId: undefined }).success).toBe(false);
    expect(createPuzzleSchema.safeParse({ ...ok, mapVersionNo: undefined }).success).toBe(false);
    const parsed = createPuzzleSchema.parse({ ...ok, name: ' 午夜花园 ', code: ' midnight-garden ' });
    expect(parsed.name).toBe('午夜花园');
    expect(parsed.code).toBe('midnight-garden');
    expect(parsed.description).toBeUndefined();
  });

  it('savePuzzleDraftSchema wraps data + optional updatedAt', () => {
    expect(savePuzzleDraftSchema.safeParse({ data: draft() }).success).toBe(true);
    expect(
      savePuzzleDraftSchema.safeParse({ data: draft(), updatedAt: '2026-10-16T00:00:00.000Z' }).success,
    ).toBe(true);
    expect(savePuzzleDraftSchema.safeParse({ data: draft({ name: '' }) }).success).toBe(false);
  });

  it('updatePuzzleSchema allows a rename / description edit', () => {
    expect(updatePuzzleSchema.safeParse({ name: '新名字' }).success).toBe(true);
    expect(updatePuzzleSchema.safeParse({ description: '' }).success).toBe(true);
    expect(updatePuzzleSchema.safeParse({ name: '   ' }).success).toBe(false);
    // v0.8.5 §7：编码可改（存量谜题唯一的补写入口），但形状与创建时同一条规矩。
    expect(updatePuzzleSchema.safeParse({ code: 'hlm-sishan' }).success).toBe(true);
    expect(updatePuzzleSchema.safeParse({ code: 'HLM_Sishan' }).success).toBe(false);
    expect(updatePuzzleSchema.safeParse({}).success).toBe(true);
  });

  it('forkPuzzleVersionBodySchema takes an optional draft', () => {
    // 空 body = 用版本快照（版本历史面板的老用法）。
    expect(forkPuzzleVersionBodySchema.safeParse({}).success).toBe(true);
    expect(forkPuzzleVersionBodySchema.parse({}).data).toBeUndefined();
    expect(forkPuzzleVersionBodySchema.safeParse({ data: draft() }).success).toBe(true);
    // 坏草稿在这里就拦下，不用等服务端引用校验。
    expect(forkPuzzleVersionBodySchema.safeParse({ data: draft({ name: '' }) }).success).toBe(
      false,
    );
  });

  it('save / fork take an optional mapSource and nothing else', () => {
    const mapSource = { mapId: 217, versionNo: 3 };
    expect(savePuzzleDraftSchema.parse({ data: draft(), mapSource }).mapSource).toEqual(mapSource);
    expect(
      forkPuzzleVersionBodySchema.parse({ data: draft(), mapSource }).mapSource,
    ).toEqual(mapSource);
    // 缺省 = 不换底图。
    expect(savePuzzleDraftSchema.parse({ data: draft() }).mapSource).toBeUndefined();
    // 只收来源三元组里的两个；画布不走这条路（服务端自己读版本）。
    for (const bad of [{ mapId: 217 }, { mapId: 0, versionNo: 1 }, { mapId: 1, versionNo: 1, data: {} }]) {
      expect(savePuzzleDraftSchema.safeParse({ data: draft(), mapSource: bad }).success).toBe(false);
    }
  });
});

/**
 * v0.7.14（docs/v0.7.14.md §2）：题面 —— 全局线索与结束语。
 *
 * 两个都是**缺键即默认**：v0.7.14 之前发布出去的谜题版本行是一份冻住的 JSON，
 * 里面没有这两个键，读的时候必须能过（`clues` → `[]`、`ending` → `''`）。
 * 上限拦在解析这一层，因为导入的文件可以绕过界面。
 */
describe('puzzleDraftSchema —— 题面（v0.7.14）', () => {
  it('a payload written before this version parses with an empty 题面', () => {
    const parsed = puzzleDraftSchema.parse(draft());
    expect(parsed.clues).toEqual([]);
    expect(parsed.ending).toBe('');
  });

  it('keeps the clue order and trims each line, and trims the ending', () => {
    const parsed = puzzleDraftSchema.parse(
      draft({
        clues: ['  同一行里没有重复编号  ', '阴影里没有编号'],
        ending: '  灯灭了，花园还在。  ',
      }),
    );
    expect(parsed.clues).toEqual(['同一行里没有重复编号', '阴影里没有编号']);
    expect(parsed.ending).toBe('灯灭了，花园还在。');
  });

  it('caps the list at eight clues and each clue at its own limit', () => {
    const full = Array.from({ length: PUZZLE_CLUES_MAX_COUNT }, (_, index) => `线索 ${index + 1}`);
    expect(puzzleDraftSchema.safeParse(draft({ clues: full })).success).toBe(true);
    expect(puzzleDraftSchema.safeParse(draft({ clues: [...full, '第九条'] })).success).toBe(false);
    expect(
      puzzleDraftSchema.safeParse(draft({ clues: ['x'.repeat(PUZZLE_CLUE_MAX_LENGTH + 1)] }))
        .success,
    ).toBe(false);
  });

  it('caps the ending at 200 characters', () => {
    expect(
      puzzleDraftSchema.safeParse(draft({ ending: 'x'.repeat(PUZZLE_ENDING_MAX_LENGTH) })).success,
    ).toBe(true);
    expect(
      puzzleDraftSchema.safeParse(draft({ ending: 'x'.repeat(PUZZLE_ENDING_MAX_LENGTH + 1) }))
        .success,
    ).toBe(false);
  });
});
