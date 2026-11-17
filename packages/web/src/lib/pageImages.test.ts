import { describe, expect, it } from 'vitest';
import type { Asset, Character, CharacterSlotEntry, DraftCell } from '@loredoku/shared';
import type { CellMap } from './canvasLayers';
import { boardImageUrls, gameCoverUrls } from './pageImages';

function asset(
  id: number,
  variants: { imageUrl: string | null; imageThumbUrl: string | null }[],
): Asset {
  return {
    id,
    code: `a${id}`,
    name: `资源 ${id}`,
    type: 'item',
    blocking: false,
    isActive: true,
    variants: variants.map((variant, index) => ({
      id: id * 10 + index,
      assetId: id,
      name: `形态 ${index}`,
      fitMode: 'contain',
      imagePath: null,
      bgColor: null,
      sortOrder: index,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...variant,
    })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function character(id: number, avatarUrl: string | null, avatarThumbUrl: string | null): Character {
  return {
    id,
    code: `c${id}`,
    name: `角色 ${id}`,
    gender: 'female',
    description: null,
    avatarPath: null,
    avatarUrl,
    avatarThumbUrl,
    bgColor: null,
    color: null,
    displayName: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function byId<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function cellMap(cells: Record<string, DraftCell>): CellMap {
  return new Map(Object.entries(cells));
}

function slot(characterId: number): CharacterSlotEntry {
  return { characterId };
}

describe('gameCoverUrls — 列表页要等的封面（v0.11.2）', () => {
  it('按卡片顺序收，没有封面的跳过', () => {
    expect(
      gameCoverUrls([{ coverUrl: '/a.webp' }, { coverUrl: null }, { coverUrl: '/b.webp' }]),
    ).toEqual(['/a.webp', '/b.webp']);
  });

  it('同一张封面被两关复用只等一次', () => {
    expect(gameCoverUrls([{ coverUrl: '/same.webp' }, { coverUrl: '/same.webp' }])).toEqual([
      '/same.webp',
    ]);
  });

  it('一关都没有：没有图要等', () => {
    expect(gameCoverUrls([])).toEqual([]);
  });
});

describe('boardImageUrls — 游戏页要等的图（v0.11.2）', () => {
  it('只收这一关画布上用到的资源，优先缩略图', () => {
    const assets = [
      asset(1, [
        { imageUrl: '/full-1.webp', imageThumbUrl: '/thumb-1.webp' },
        { imageUrl: '/full-2.webp', imageThumbUrl: null },
      ]),
      // 资源 2 这一关没用到，不该拖着本页等。
      asset(2, [{ imageUrl: '/unused.webp', imageThumbUrl: null }]),
    ];
    const urls = boardImageUrls({
      assetsById: byId(assets),
      cells: cellMap({
        '0,0': { background: { assetId: 1 } },
        '1,0': { item: { assetId: 1, variantId: 11, w: 1, h: 1 } },
      }),
    });
    // 背景没有 variantId → 退回第一个形态（缩略图）；物品指定了形态 11 → 第二个形态。
    expect(urls).toEqual(['/thumb-1.webp', '/full-2.webp']);
  });

  it('锚点指定的形态优先于第一个形态', () => {
    const assets = [
      asset(1, [
        { imageUrl: '/first.webp', imageThumbUrl: null },
        { imageUrl: '/second.webp', imageThumbUrl: '/second-thumb.webp' },
      ]),
    ];
    const urls = boardImageUrls({
      assetsById: byId(assets),
      cells: cellMap({ '2,2': { decoration: { assetId: 1, variantId: 11 } } }),
    });
    expect(urls).toEqual(['/second-thumb.webp']);
  });

  it('悬空的 variantId 退回第一个形态（与图层同一套兜底）', () => {
    const assets = [asset(1, [{ imageUrl: '/first.webp', imageThumbUrl: null }])];
    const urls = boardImageUrls({
      assetsById: byId(assets),
      cells: cellMap({ '0,0': { item: { assetId: 1, variantId: 999, w: 1, h: 1 } } }),
    });
    expect(urls).toEqual(['/first.webp']);
  });

  it('色块资源没有图，不出现在清单里', () => {
    const urls = boardImageUrls({
      assetsById: byId([asset(1, [{ imageUrl: null, imageThumbUrl: null }])]),
      cells: cellMap({ '0,0': { background: { assetId: 1 } } }),
    });
    expect(urls).toEqual([]);
  });

  it('画布空着：一个资源图都不等', () => {
    const urls = boardImageUrls({
      assetsById: byId([asset(1, [{ imageUrl: '/unused.webp', imageThumbUrl: null }])]),
      cells: cellMap({}),
    });
    expect(urls).toEqual([]);
  });

  it('角色只收名册里坐着的那些，缩略图优先', () => {
    const characters = [
      character(1, '/avatar-full.webp', '/avatar-thumb.webp'),
      character(2, '/avatar-full-2.webp', null),
      character(3, '/unused.webp', null),
    ];
    const urls = boardImageUrls({
      charactersById: byId(characters),
      slots: [slot(1), slot(2), null],
    });
    expect(urls).toEqual(['/avatar-thumb.webp', '/avatar-full-2.webp']);
  });

  it('名册空着：一个头像都不等', () => {
    const urls = boardImageUrls({
      charactersById: byId([character(1, '/avatar.webp', null)]),
      slots: [],
    });
    expect(urls).toEqual([]);
  });

  it('标记、工具图标、校验圈都算这一页的图', () => {
    const urls = boardImageUrls({
      mark: { imageUrl: '/mark.webp', source: 'puzzle' },
      toolIcons: {
        clear: { imageUrl: '/clear.webp', source: 'theme' },
        submit: { imageUrl: '/submit.webp', source: 'puzzle' },
      },
      ringImage: '/ring.webp',
    });
    expect(urls).toEqual(['/mark.webp', '/clear.webp', '/submit.webp', '/ring.webp']);
  });

  it('同一张图被多处引用只等一次', () => {
    const urls = boardImageUrls({
      assetsById: byId([asset(1, [{ imageUrl: '/same.webp', imageThumbUrl: '/same.webp' }])]),
      cells: cellMap({ '0,0': { item: { assetId: 1, w: 1, h: 1 } } }),
      charactersById: byId([character(1, '/same.webp', '/same.webp')]),
      slots: [slot(1)],
      mark: { imageUrl: '/same.webp', source: 'theme' },
    });
    expect(urls).toEqual(['/same.webp']);
  });

  it('什么都没配：没有图要等', () => {
    expect(boardImageUrls({})).toEqual([]);
    expect(
      boardImageUrls({ cells: null, assetsById: null, slots: null, charactersById: null, mark: null }),
    ).toEqual([]);
  });
});
