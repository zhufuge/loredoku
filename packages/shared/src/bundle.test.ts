import { describe, expect, it } from 'vitest';
import {
  buildBundleIdMaps,
  buildBundleManifest,
  buildBundlePuzzleFile,
  renumberPuzzleDraft,
} from './bundle';
import type { BuildBundleManifestInput } from './bundle';
import type { MapDraft, MapGameSummary, PuzzleDraft } from './types/domain';

function summary(slug: string): MapGameSummary {
  return {
    id: 1,
    puzzleId: 100,
    themeCode: 'hlm',
    puzzleName: '撕扇',
    puzzleVersionNo: 3,
    name: '撕扇',
    slug,
    coverUrl: null,
    difficulty: 3,
    sortWeight: 0,
    gridSize: 2,
    participantCount: 1,
    createdAt: '2026-10-29T00:00:00.000Z',
  };
}

function puzzle(): PuzzleDraft {
  const data: MapDraft = {
    version: 8,
    gridSize: 2,
    cells: {
      '0,0': { background: { assetId: 4165, variantId: 4934 } },
      '0,1': { item: { assetId: 4165, variantId: 4934, w: 1, h: 1 } },
    },
    regions: [],
  };
  return {
    version: 2,
    map: { mapId: 9, versionNo: 1, mapName: '底图', data },
    name: '撕扇',
    description: '',
    linkageColors: [{ key: 'red', label: '红', color: '#B93A32' }],
    characterSlots: [
      {
        characterId: 3062,
        linkages: [{ type: 'asset', id: 4986, scope: 'all', effect: 'highlight', color: 'red' }],
      },
      null,
    ],
  };
}

describe('buildBundleIdMaps', () => {
  it('按首次出现顺序发序号，同一个 id 只发一次', () => {
    const ids = buildBundleIdMaps([
      { summary: summary('a'), map: puzzle().map.data, puzzle: puzzle() },
    ]);

    // 背景与物品指向同一个资源 4165 → 都拿到 1；名册联动指向 4986 → 拿到 2。
    // 顺序是「先画布、后名册」，序号跟着首次出现走。
    expect([...ids.assets.entries()]).toEqual([
      [4165, 1],
      [4986, 2],
    ]);
    expect([...ids.variants.entries()]).toEqual([[4934, 1]]);
    expect([...ids.characters.entries()]).toEqual([[3062, 1]]);
  });

  /** 背景修饰层。真实事故（2026-11-17，「一从二令三人木」）： 修饰层引用没进引用闭包 ⇒ assets.json 少了「地毯」、包里没有它的图， 播放器那一格画不出东西。 */
  it('背景修饰层的资源与形态也进引用闭包', () => {
    const source = puzzle();
    source.map.data.cells['1,1'] = { decoration: { assetId: 13390, variantId: 11920 } };
    const ids = buildBundleIdMaps([
      { summary: summary('a'), map: source.map.data, puzzle: source },
    ]);

    // 出现顺序：背景 4165 → 修饰 13390 → 名册联动 4986。
    expect([...ids.assets.entries()]).toEqual([
      [4165, 1],
      [13390, 2],
      [4986, 3],
    ]);
    expect([...ids.variants.entries()]).toEqual([
      [4934, 1],
      [11920, 2],
    ]);
  });
});

describe('renumberPuzzleDraft', () => {
  it('改写单元格、名册与联动目标，并把反向表留给对账', () => {
    const source = puzzle();
    const ids = buildBundleIdMaps([{ summary: summary('a'), map: source.map.data, puzzle: source }]);
    const next = renumberPuzzleDraft(source, ids);

    expect(next.map.data.cells['0,0']?.background).toEqual({ assetId: 1, variantId: 1 });
    expect(next.map.data.cells['0,1']?.item?.assetId).toBe(1);
    expect(next.characterSlots[0]?.characterId).toBe(1);
    expect(next.characterSlots[0]?.linkages?.[0]).toMatchObject({ type: 'asset', id: 2 });

    expect(ids.originAssets).toEqual({ '1': 4165, '2': 4986 });
    expect(ids.originCharacters).toEqual({ '1': 3062 });
  });

  it('指向角色的联动也要换成包内序号 —— 它也是数据库 id', () => {
    const source = puzzle();
    source.characterSlots[0]!.linkages!.push({
      type: 'character',
      id: 3062,
      effect: 'highlight',
      color: 'red',
    });
    const ids = buildBundleIdMaps([{ summary: summary('a'), map: source.map.data, puzzle: source }]);
    const next = renumberPuzzleDraft(source, ids);

    expect(next.characterSlots[0]?.linkages?.[1]).toMatchObject({ type: 'character', id: 1 });
    // 槽位上的 characterId 与联动指向同一个角色 ⇒ 同一个序号。
    expect(next.characterSlots[0]?.characterId).toBe(
      (next.characterSlots[0]!.linkages![1] as { id: number }).id,
    );
  });

  it('不动原始草稿 —— 导出不该改内存里那一份', () => {
    const source = puzzle();
    const ids = buildBundleIdMaps([{ summary: summary('a'), map: source.map.data, puzzle: source }]);
    renumberPuzzleDraft(source, ids);
    expect(source.map.data.cells['0,0']?.background?.assetId).toBe(4165);
  });

  it('画布的来源字段保持原样：它们是追溯，不是引用', () => {
    const source = puzzle();
    const ids = buildBundleIdMaps([{ summary: summary('a'), map: source.map.data, puzzle: source }]);
    const next = renumberPuzzleDraft(source, ids);
    expect(next.map.mapId).toBe(9);
    expect(next.map.versionNo).toBe(1);
  });

  it('v0.10.9 的背景修饰层同样重编号 —— 不改它，包里那格指着不存在的 id', () => {
    const source = puzzle();
    source.map.data.cells['1,1'] = { decoration: { assetId: 13390, variantId: 11920 } };
    const ids = buildBundleIdMaps([
      { summary: summary('a'), map: source.map.data, puzzle: source },
    ]);
    const next = renumberPuzzleDraft(source, ids);

    expect(next.map.data.cells['1,1']?.decoration).toEqual({ assetId: 2, variantId: 2 });
    // 原草稿不被改（导出不该动内存里那一份）。
    expect(source.map.data.cells['1,1']?.decoration).toEqual({ assetId: 13390, variantId: 11920 });
  });
});

describe('buildBundlePuzzleFile', () => {
  it('key 直接用游戏 slug，不用谜题名再 slugify', () => {
    const source = puzzle();
    const ids = buildBundleIdMaps([{ summary: summary('puzzle-sishan-medium'), map: source.map.data, puzzle: source }]);
    const file = buildBundlePuzzleFile(
      { summary: summary('puzzle-sishan-medium'), map: source.map.data, puzzle: source },
      ids,
    );
    expect(file.key).toBe('puzzle-sishan-medium');
  });

  /** v0.9.0 §5：包里有**两份画布**（`map` 与 `puzzle.map.data`），两份都必须已经重编号 —— `map` 若还指着数据库原 id，播放器读它就会得到一张没有背景的空棋盘（实测撞上的就是这一条）。 */
  it('map 与 puzzle.map.data 是同一份、且引用已重编号', () => {
    const source = puzzle();
    const ids = buildBundleIdMaps([
      { summary: summary('puzzle-sishan-medium'), map: source.map.data, puzzle: source },
    ]);
    const file = buildBundlePuzzleFile(
      { summary: summary('puzzle-sishan-medium'), map: source.map.data, puzzle: source },
      ids,
    );

    expect(file.map).toEqual(file.puzzle.map.data);
    const cells = Object.values(file.map.cells);
    const assetIds = cells.map((cell) => cell.background?.assetId ?? cell.item?.assetId);
    for (const id of assetIds) {
      // 重编号后的 id 一定小于原 id（序号从 1 起，数据库 id 是四位数）。
      expect(id).toBeLessThan(100);
    }
  });
});

/** 2026-11-09 补（docs/v0.9.0.md §13）：包里要带上作者配的难度名字与颜色。 只测「原样透传 / 没配就不写键」两件事 —— 排序和内置五档的兜底属于 `resolveDifficultyTiers`，不在这里重做一遍。 */
describe('buildBundleManifest 的主题难度分级', () => {
  function input(theme: BuildBundleManifestInput['theme']): BuildBundleManifestInput {
    return {
      theme,
      exportedAt: '2026-11-09T00:00:00.000Z',
      games: [],
      files: [],
      fonts: [],
      ids: buildBundleIdMaps([]),
      originGames: {},
    };
  }

  it('配了就原样进 manifest.theme（不排序、不改颜色）', () => {
    const levels = [
      { level: 3, label: '通', color: '#B93A32' },
      { level: 1, label: '初' },
    ];
    const built = buildBundleManifest(
      input({ code: 'hlm', name: '红楼梦', description: null, difficultyLevels: levels }),
    );
    expect(built.theme.difficultyLevels).toEqual(levels);
    expect(built.theme.difficultyLevels?.[0]?.label).toBe('通');
    expect(JSON.parse(JSON.stringify(built.theme))).toHaveProperty('difficultyLevels');
  });

  it('没配过 / 老包都不写这个键，读包方按 undefined 兜底', () => {
    const built = buildBundleManifest(input({ code: 'hlm', name: '红楼梦', description: null }));
    expect(built.theme.difficultyLevels).toBeUndefined();
    expect('difficultyLevels' in built.theme).toBe(false);
    expect(Object.keys(JSON.parse(JSON.stringify(built.theme)))).toEqual([
      'code',
      'name',
      'description',
    ]);
  });

  /** v0.11.10：列表页标题的字体也跟着包走 —— 播放器没有 `/themes` 查询，只能从 manifest 里读。 */
  it('标题字体同样原样透传，没配就不写键', () => {
    const withFont = buildBundleManifest(
      input({
        code: 'hlm',
        name: '红楼梦',
        description: null,
        fontFamily: 'Courier Prime Sans',
      }),
    );
    expect(withFont.theme.fontFamily).toBe('Courier Prime Sans');

    const plain = buildBundleManifest(input({ code: 'hlm', name: '红楼梦', description: null }));
    expect('fontFamily' in plain.theme).toBe(false);
  });
});
