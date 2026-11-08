import { describe, expect, it } from 'vitest';
import { BUNDLE_FORMAT, BUNDLE_FORMAT_VERSION } from '@loredoku/shared';
import type {
  Asset,
  BundleManifest,
  BundlePuzzleFile,
  Character,
} from '@loredoku/shared';
import {
  assertBundleFormat,
  bundleFileUrl,
  bundleRoot,
  bundleStorageId,
  gameHrefOf,
  resolveAssetFileUrls,
  resolveCharacterFileUrls,
  themeHrefOf,
  toGameCard,
  toGameDetail,
} from './bundleLoad';

/**
 * v0.9.0（docs/v0.9.0.md §5）：包内路径与身份的几条纯函数。
 *
 * 这些函数的共同点是「拼一次、到处用」：一旦 `bundleFileUrl` 少一个斜杠或
 * `bundleStorageId` 多一个冒号，症状是「图全是破的」或「进度下次进来没了」——
 * 两种都不容易一眼看出根因，所以在这里钉死。
 *
 * `import.meta.env.BASE_URL` 在 vitest 下是 `/`，所以下面断言里的包根是 `/hlm/`；
 * 产物里它是 `/loredoku/`，同一个函数。
 */

function manifest(overrides: Partial<BundleManifest> = {}): BundleManifest {
  return {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    exportedAt: '2026-11-08T00:00:00.000Z',
    theme: { code: 'hlm', name: '红楼梦', description: null },
    games: [
      {
        key: 'puzzle-sishan',
        file: 'puzzles/puzzle-sishan.json',
        name: '撕扇',
        puzzleName: '撕扇',
        gridSize: 4,
        difficulty: 3,
        cover: 'files/covers/1.png',
      },
    ],
    assets: 'assets.json',
    characters: 'characters.json',
    fonts: [],
    files: [],
    originIds: { assets: {}, characters: {}, games: {} },
    ...overrides,
  };
}

describe('bundleRoot / bundleFileUrl', () => {
  it('包根是「站点 base + 编码 + 斜杠」', () => {
    expect(bundleRoot('hlm')).toBe('/hlm/');
  });

  it('拼路径时不重复斜杠，空路径给 null', () => {
    expect(bundleFileUrl('/hlm/', 'files/assets/1-a.webp')).toBe('/hlm/files/assets/1-a.webp');
    expect(bundleFileUrl('/hlm/', '/files/assets/1-a.webp')).toBe('/hlm/files/assets/1-a.webp');
    expect(bundleFileUrl('/hlm/', null)).toBeNull();
    expect(bundleFileUrl('/hlm/', '')).toBeNull();
  });
});

describe('bundleStorageId', () => {
  it('带 bundle 前缀，与线上的 slug 键不通', () => {
    expect(bundleStorageId('hlm', 'puzzle-sishan')).toBe('bundle:hlm:puzzle-sishan');
  });
});

describe('路由地址', () => {
  it('列表页与关卡页都在 basename 内（不带 /loredoku）', () => {
    expect(themeHrefOf('hlm')).toBe('/hlm/play');
    expect(gameHrefOf('hlm', 'puzzle-sishan')).toBe('/hlm/play/puzzle-sishan');
  });
});

describe('toGameCard', () => {
  it('把 manifest 的那几项摊成卡片认的字段，封面拼成包内地址', () => {
    const game = toGameCard(manifest().games[0]!, '/hlm/');
    expect(game).toEqual({
      slug: 'puzzle-sishan',
      name: '撕扇',
      coverUrl: '/hlm/files/covers/1.png',
      difficulty: 3,
      gridSize: 4,
    });
  });

  it('没有封面就是 null（列表页画首字占位）', () => {
    const entry = { ...manifest().games[0]!, cover: null };
    expect(toGameCard(entry, '/hlm/').coverUrl).toBeNull();
  });
});

describe('包内相对路径 → URL', () => {
  it('资源的图挂在形态上，四个字段都要换', () => {
    const asset = {
      id: 1,
      code: 'hlm_stone',
      name: '石子路',
      type: 'background',
      blocking: false,
      isActive: true,
      createdAt: '',
      updatedAt: '',
      variants: [
        {
          id: 1,
          assetId: 1,
          name: '默认',
          sortOrder: 0,
          fitMode: 'cover',
          imagePath: 'files/assets/1-a.webp',
          imageUrl: 'files/assets/1-a.webp',
          imageThumbUrl: 'files/assets/1-a_thumb.webp',
          bgColor: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
    } satisfies Asset;

    const [resolved] = resolveAssetFileUrls([asset], '/hlm/');
    expect(resolved!.variants[0]!.imageUrl).toBe('/hlm/files/assets/1-a.webp');
    expect(resolved!.variants[0]!.imageThumbUrl).toBe('/hlm/files/assets/1-a_thumb.webp');
    // `imagePath` 留住：那是「文件在包里的哪」，不是地址。
    expect(resolved!.variants[0]!.imagePath).toBe('files/assets/1-a.webp');
  });

  it('角色的头像在里面一层，两个字段都换', () => {
    const character = {
      id: 1,
      code: 'hlm_baoyu',
      name: '贾宝玉',
      gender: 'male',
      description: null,
      avatarPath: 'files/characters/1.webp',
      avatarUrl: 'files/characters/1.webp',
      avatarThumbUrl: 'files/characters/1_thumb.webp',
      bgColor: null,
      color: null,
      displayName: null,
      createdAt: '',
      updatedAt: '',
    } as unknown as Character;

    const [resolved] = resolveCharacterFileUrls([character], '/hlm/');
    expect(resolved!.avatarUrl).toBe('/hlm/files/characters/1.webp');
    expect(resolved!.avatarThumbUrl).toBe('/hlm/files/characters/1_thumb.webp');
  });
});

describe('toGameDetail', () => {
  it('摘要 + 画布 + 谜题拼成页面认识的形状', () => {
    const file: BundlePuzzleFile = {
      key: 'puzzle-sishan',
      summary: {
        id: 7,
        puzzleId: 9,
        themeCode: 'hlm',
        puzzleName: '撕扇',
        puzzleVersionNo: 1,
        name: '撕扇',
        slug: 'puzzle-sishan',
        coverUrl: null,
        difficulty: 3,
        sortWeight: 0,
        gridSize: 4,
        participantCount: 4,
        createdAt: '2026-11-08T00:00:00.000Z',
      },
      map: { version: 8, gridSize: 4, cells: {}, regions: [] },
      puzzle: {
        version: 2,
        map: { mapId: 1, versionNo: 1, mapName: '底图', data: { version: 8, gridSize: 4, cells: {}, regions: [] } },
        name: '撕扇',
        description: '',
        linkageColors: [],
        characterSlots: [],
      },
    };

    const detail = toGameDetail(file);
    expect(detail.slug).toBe('puzzle-sishan');
    expect(detail.map.gridSize).toBe(4);
    expect(detail.puzzle?.name).toBe('撕扇');
  });
});

describe('assertBundleFormat', () => {
  it('同版本的包放行', () => {
    expect(() => assertBundleFormat(manifest())).not.toThrow();
  });

  it('不是格物的包 / 版本对不上，都直接报错而不是硬读', () => {
    expect(() => assertBundleFormat(manifest({ format: 'other' }))).toThrow(/不是格物/);
    expect(() => assertBundleFormat(manifest({ formatVersion: 999 }))).toThrow(/重新导出/);
  });
});
