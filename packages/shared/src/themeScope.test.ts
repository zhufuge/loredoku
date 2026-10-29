import { describe, expect, it } from 'vitest';
import { collectMapThemeRefs, collectPuzzleThemeRefs, findOutOfScopeRefs } from './themeScope';
import type { MapDraft, PuzzleDraft } from './types/domain';

function canvas(partial: Partial<MapDraft> = {}): MapDraft {
  return { version: 8, gridSize: 2, cells: {}, regions: [], ...partial };
}

function puzzle(overrides: Partial<PuzzleDraft> = {}): PuzzleDraft {
  return {
    version: 2,
    map: { mapId: 1, versionNo: 1, mapName: '底图', data: canvas() },
    name: '谜题',
    description: '',
    linkageColors: [{ key: 'red', label: '红', color: '#B93A32' }],
    characterSlots: [null, null],
    ...overrides,
  };
}

describe('collectMapThemeRefs', () => {
  it('取出背景与物品的资源，以及两者的形态', () => {
    const refs = collectMapThemeRefs(
      canvas({
        cells: {
          '0,0': { background: { assetId: 11, variantId: 21 } },
          '0,1': { item: { assetId: 12, variantId: 22, w: 1, h: 1 } },
        },
      }),
    );

    expect(refs).toEqual([
      { kind: 'asset', id: 11, where: '单元格 0,0 的背景' },
      { kind: 'variant', id: 21, where: '单元格 0,0 的背景形态' },
      { kind: 'asset', id: 12, where: '单元格 0,1 的物品' },
      { kind: 'variant', id: 22, where: '单元格 0,1 的物品形态' },
    ]);
  });

  it('空画布返回空数组，不是 null', () => {
    expect(collectMapThemeRefs(null)).toEqual([]);
    expect(collectMapThemeRefs(canvas())).toEqual([]);
  });
});

describe('collectPuzzleThemeRefs', () => {
  it('画布之外还收集名册与联动目标', () => {
    const refs = collectPuzzleThemeRefs(
      puzzle({
        characterSlots: [
          {
            characterId: 31,
            linkages: [{ type: 'asset', id: 41, scope: 'all', effect: 'highlight', color: 'red' }],
          },
          null,
        ],
      }),
    );

    expect(refs.map((ref) => `${ref.kind}:${ref.id}`)).toEqual([
      'character:31',
      'asset:41',
    ]);
  });
});

describe('findOutOfScopeRefs', () => {
  const refs = [
    { kind: 'asset' as const, id: 1, where: 'a' },
    { kind: 'asset' as const, id: 2, where: 'b' },
    { kind: 'character' as const, id: 3, where: 'c' },
  ];

  it('同主题一条都不报', () => {
    expect(findOutOfScopeRefs(refs, 7, () => 7)).toEqual([]);
  });

  it('只报属于别的主题的那几条', () => {
    const owner = new Map([
      [1, 7],
      [2, 9],
      [3, 7],
    ]);
    const bad = findOutOfScopeRefs(refs, 7, (ref) => owner.get(ref.id));
    expect(bad).toEqual([{ kind: 'asset', id: 2, where: 'b' }]);
  });

  it('查不到的行不算越界 —— 那是悬空引用，由另一套检查负责', () => {
    expect(findOutOfScopeRefs(refs, 7, () => null)).toEqual([]);
  });
});
