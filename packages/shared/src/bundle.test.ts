import { describe, expect, it } from 'vitest';
import { buildBundleIdMaps, buildBundlePuzzleFile, renumberPuzzleDraft } from './bundle';
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
      (next.characterSlots[0]?.linkages?.[1] as { id: number }).id,
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

  /**
   * v0.9.0 §5：包里有**两份画布**（`map` 与 `puzzle.map.data`），两份都必须已经
   * 重编号。v0.8.0 只改了后者，`map` 还指着数据库原 id —— 播放器读 `map` 会得到
   * 一张没有背景的空棋盘（v0.9.0 实测撞上的就是这一条）。
   */
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
