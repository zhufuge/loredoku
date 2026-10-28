import { describe, expect, it } from 'vitest';
import { mapDraftSchema } from './mapDraft';
import { puzzleDraftSchema } from './puzzle';

/**
 * `docs/data-json.md` §3 有一张表，把「哪些层多写键会报错、哪些层会静默丢掉」
 * 钉死了。这个文件是那张表的可执行版本 —— 手写 JSON 的人按它写，所以任何一层
 * 加上了 `.strict()`（或者反过来忘了加）都必须先把这里改红，而不是让文档慢慢
 * 变成谎话。
 *
 * 分两类断言：
 *
 * - **报错**：`.strict()` 的层，多一个键就是 `unrecognized_keys`；
 * - **静默丢弃**：没写 `.strict()` 的层，解析通过，但那个键不会出现在结果里。
 *
 * 第二类不是「无所谓」—— `formId` 的兼容预处理（`withLegacyAnchorKey`）正是
 * 为了补救它：锚点对象不吃 strict，旧键不改名就会被悄悄扔掉。
 */

const canvas = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  version: 8,
  gridSize: 3,
  cells: {},
  regions: [],
  ...extra,
});

const region = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'rg_45ca41eb',
  name: '前厅',
  cells: [[0, 0]],
  ...extra,
});

describe('多余键会报错（.strict() 的层）', () => {
  it('MapDraft 顶层', () => {
    expect(mapDraftSchema.safeParse(canvas({ name: '前厅平面图' })).success).toBe(false);
  });

  it('style 顶层（未知块不被当默认值咽下去）', () => {
    expect(mapDraftSchema.safeParse(canvas({ style: { linkageColors: [] } })).success).toBe(false);
    expect(mapDraftSchema.safeParse(canvas({ style: { canvasFrame: {}, foo: 1 } })).success).toBe(
      false,
    );
  });

  it('DraftCell', () => {
    expect(
      mapDraftSchema.safeParse(canvas({ cells: { '0,0': { background: { assetId: 1 }, foo: 1 } } }))
        .success,
    ).toBe(false);
  });

  it('DraftRegion 与 region.style 三级', () => {
    expect(mapDraftSchema.safeParse(canvas({ regions: [region({ foo: 1 })] })).success).toBe(false);
    expect(
      mapDraftSchema.safeParse(canvas({ regions: [region({ style: { foo: 1 } })] })).success,
    ).toBe(false);
    expect(
      mapDraftSchema.safeParse(canvas({ regions: [region({ style: { outline: { foo: 1 } } })] }))
        .success,
    ).toBe(false);
  });

  it('PuzzleDraft 顶层与 map 快照', () => {
    const puzzle = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      version: 2,
      map: { mapId: 17, versionNo: 3, mapName: '前厅平面图', data: canvas() },
      name: '谁拿走了印盒',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'blue', label: '蓝', color: '#90CAF9' },
      ],
      characterSlots: [null],
      ...extra,
    });
    expect(puzzleDraftSchema.safeParse(puzzle({ foo: 1 })).success).toBe(false);
    expect(puzzleDraftSchema.safeParse(puzzle({ map: { mapId: 17, versionNo: 3 } })).success).toBe(
      false,
    );
  });

  it('CharacterSlotEntry 与 positionConditions 的每个元素', () => {
    const withSlot = (slot: Record<string, unknown>): Record<string, unknown> => ({
      version: 2,
      map: { mapId: 17, versionNo: 3, data: canvas() },
      name: '谁拿走了印盒',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'blue', label: '蓝', color: '#90CAF9' },
      ],
      characterSlots: [slot],
    });
    expect(puzzleDraftSchema.safeParse(withSlot({ characterId: 1, foo: 1 })).success).toBe(false);
    expect(
      puzzleDraftSchema.safeParse(
        withSlot({ characterId: 1, positionConditions: [{ x: 0, y: 1, foo: 1 }] }),
      ).success,
    ).toBe(false);
  });
});

describe('多余键被静默丢弃（没写 .strict() 的层）', () => {
  it('style 的九个块及其内部', () => {
    const result = mapDraftSchema.safeParse(
      canvas({
        style: {
          canvasFrame: { width: 8, color: '#000000', foo: 1 },
          regionLabel: { fontSize: 32, foo: 1 },
        },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    // 其余键照常补默认值 —— 证明这个块确实是「解析通过，只是多出来的键没了」。
    expect(result.data.style?.canvasFrame).toEqual({ width: 8, color: '#000000' });
    expect(result.data.style?.gridSeparator.width).toBe(4);
    expect(result.data.style?.regionLabel.fontSize).toBe(32);
  });

  it('cell.background / cell.item（formId 的预处理就是为这一层存在的）', () => {
    const result = mapDraftSchema.safeParse(
      canvas({
        cells: {
          '0,0': {
            background: { assetId: 12, foo: 1 },
            item: { assetId: 88, w: 1, h: 1, foo: 1 },
          },
        },
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cells['0,0']?.background).toEqual({ assetId: 12 });
    expect(result.data.cells['0,0']?.item).toEqual({ assetId: 88, w: 1, h: 1 });
  });

  it('linkageColors 的每一项', () => {
    const result = puzzleDraftSchema.safeParse({
      map: { mapId: 17, versionNo: 3, data: canvas() },
      name: '谁拿走了印盒',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A', foo: 1 },
        { key: 'blue', label: '蓝', color: '#90CAF9' },
      ],
      characterSlots: [null],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.linkageColors[0]).toEqual({ key: 'red', label: '红', color: '#EF9A9A' });
  });

  it('联动的四个目标对象', () => {
    const result = puzzleDraftSchema.safeParse({
      map: { mapId: 17, versionNo: 3, data: canvas() },
      name: '谁拿走了印盒',
      linkageColors: [
        { key: 'red', label: '红', color: '#EF9A9A' },
        { key: 'blue', label: '蓝', color: '#90CAF9' },
      ],
      characterSlots: [
        {
          characterId: 3063,
          linkages: [
            { type: 'cell', cells: [[1, 1]], effect: 'glow', color: 'red', foo: 1 },
            { type: 'region', id: 'rg_45ca41eb', effect: 'glow', color: 'blue', foo: 1 },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.characterSlots[0]?.linkages[0]).toEqual({
      type: 'cell',
      cells: [[1, 1]],
      effect: 'glow',
      color: 'red',
    });
    expect(result.data.characterSlots[0]?.linkages[1]).toEqual({
      type: 'region',
      id: 'rg_45ca41eb',
      effect: 'glow',
      color: 'blue',
    });
  });
});
