import { describe, expect, it } from 'vitest';
import type { Asset, Character } from '@loredoku/shared';
import { boardImageUrls, gameCoverUrls } from './pageImages';

function asset(id: number, variants: { imageUrl: string | null; imageThumbUrl: string | null }[]): Asset {
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

describe('gameCoverUrls — 列表页要等的封面（v0.11.2）', () => {
  it('按卡片顺序收，没有封面的跳过', () => {
    expect(
      gameCoverUrls([
        { coverUrl: '/a.webp' },
        { coverUrl: null },
        { coverUrl: '/b.webp' },
      ]),
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
  it('资源按形态各收一张，优先缩略图', () => {
    const urls = boardImageUrls({
      assets: [
        asset(1, [
          { imageUrl: '/full-1.webp', imageThumbUrl: '/thumb-1.webp' },
          { imageUrl: '/full-2.webp', imageThumbUrl: null },
        ]),
      ],
    });
    expect(urls).toEqual(['/thumb-1.webp', '/full-2.webp']);
  });

  it('色块资源没有图，不出现在清单里', () => {
    const urls = boardImageUrls({
      assets: [asset(1, [{ imageUrl: null, imageThumbUrl: null }])],
    });
    expect(urls).toEqual([]);
  });

  it('角色收头像，缩略图优先', () => {
    const urls = boardImageUrls({
      characters: [
        character(1, '/avatar-full.webp', '/avatar-thumb.webp'),
        character(2, '/avatar-full-2.webp', null),
        character(3, null, null),
      ],
    });
    expect(urls).toEqual(['/avatar-thumb.webp', '/avatar-full-2.webp']);
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
      assets: [asset(1, [{ imageUrl: '/same.webp', imageThumbUrl: '/same.webp' }])],
      characters: [character(1, '/same.webp', '/same.webp')],
      mark: { imageUrl: '/same.webp', source: 'theme' },
    });
    expect(urls).toEqual(['/same.webp']);
  });

  it('什么都没配：没有图要等', () => {
    expect(boardImageUrls({})).toEqual([]);
    expect(boardImageUrls({ assets: null, characters: null, mark: null })).toEqual([]);
  });
});