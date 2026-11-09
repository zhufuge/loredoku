import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode, MAP_JSON_VERSION } from '@loredoku/shared';
import type { MapDraft } from '@loredoku/shared';
import { api } from './helpers';
import * as bundleService from '../src/service/bundleService';
import { purgeTheme } from './purge';
import { db } from '../src/db/knex';
import { resolveUploadPath } from '../src/utils/paths';

/**
 * v0.8.0（docs/v0.8.0.md §11）—— 资源包的接线测试。
 *
 * 包的**内容**（id 闭包、sha256、体积）在真实数据上验证过一遍（见 §11.2 的实测表），
 * 这里管的是三件在测试里能稳定复现的事：
 *
 * 1. 空主题不许导出（§11.1「0 关已部署」）；
 * 2. 一关已上线就能导出，且包里的引用已经是包内序号（§11.3）；
 * 3. HTTP 层真的流出一个 zip，文件名是 `<code>-bundle-<时间>.zip`（§11.6）。
 *
 * 素材全部用**纯色块**资源与角色：没有图片文件，包的内容完全确定，也不会往
 * `storage/uploads` 里写东西。
 */

/** 主题在测试里只以**编码**出现 —— 接口没有别的名字（v0.8.0 §19）。 */
const createdThemes: string[] = [];
const createdMaps: number[] = [];
const createdAssets: number[] = [];
const createdCharacters: number[] = [];
const createdPuzzles: number[] = [];
/** 部署是「另起一行」，删谜题前必须先取消部署（`games.puzzle_id` 是 RESTRICT）。 */
const createdGames: number[] = [];
/** 版本行是**新插入的行**：不先删它们，底图与资源的引用就一直挂着不让删。 */
const mapVersions: Array<{ mapId: number; versionNo: number }> = [];
const puzzleVersions: Array<{ puzzleId: number; versionNo: number }> = [];
/** v0.8.6 §4：禁止符号上传图落在 `puzzles/<id>/forbidden-symbol/`。 */
const symbolDirs: string[] = [];

/** 1×1 PNG —— 与 `api.test.ts` 同一个夹具，够上传管线接受。 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function unique(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function uniqueSlug(prefix = 'bundle'): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function emptyDraft(gridSize: number): MapDraft {
  return { version: MAP_JSON_VERSION, gridSize, cells: {}, regions: [] };
}

async function createTheme(): Promise<string> {
  const code = unique('t').toLowerCase().replace(/_/g, '-');
  const res = await api.post('/api/themes').send({ code, name: `主题 ${code}` });
  expect(res.status).toBe(200);
  createdThemes.push(code);
  return code;
}

/** 纯色块资源：不产生任何图片文件，所以包里只有 JSON。 */
async function createSolidAsset(themeCode: string): Promise<number> {
  const res = await api.post('/api/assets').send({
    code: unique('a'),
    name: '石板地',
    type: 'background',
    blocking: false,
    themeCode,
    appearance: { bgColor: '#8C7B6B' },
  });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdAssets.push(id);
  return id;
}

async function createSolidCharacter(themeCode: string): Promise<number> {
  const res = await api
    .post('/api/characters')
    .send({ code: unique('c'), name: '黛玉', themeCode, bgColor: '#B93A32' });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdCharacters.push(id);
  return id;
}

/**
 * 一关「已经能玩」的谜题：底图 → 发布 → 建谜题 → 名册一位参与者 → 发布 →
 * 部署成一个游戏。返回游戏 slug。
 *
 * `forbiddenSymbol: true` 时在发布前走一遍真实的上传端点并把 `path` 存进草稿 ——
 * 打包链路（v0.8.6 §4）要的正是「版本行里有一个上传图路径」这个状态。
 */
async function deployedGame(
  themeCode: string,
  options: { forbiddenSymbol?: boolean; toolIcons?: boolean } = {},
): Promise<{
  slug: string;
  assetId: number;
  variantId: number;
  characterId: number;
  draftId: number;
  forbiddenSymbolPath?: string;
  toolIconPaths?: Record<string, string>;
}> {
  const assetId = await createSolidAsset(themeCode);
  const characterId = await createSolidCharacter(themeCode);

  const asset = await api.get(`/api/assets/${assetId}`);
  expect(asset.status).toBe(200);
  const variantId = asset.body.data.variants[0].id as number;

  const map = await api.post('/api/maps').send({ name: `底图 ${unique('m')}`, themeCode });
  expect(map.status).toBe(200);
  const mapId = map.body.data.id as number;
  createdMaps.push(mapId);
  expect((await api.patch(`/api/maps/${mapId}/grid-size`).send({ gridSize: 2 })).status).toBe(200);

  const draft = emptyDraft(2);
  draft.cells['0,0'] = { background: { assetId, variantId } };
  draft.cells['0,1'] = { item: { assetId, variantId, w: 1, h: 1 } };
  expect((await api.put(`/api/maps/${mapId}/map`).send({ data: draft })).status).toBe(200);

  const versionRes = await api.post(`/api/maps/${mapId}/versions`).send({});
  expect(versionRes.status).toBe(200);
  const mapVersionNo = versionRes.body.data.versionNo as number;
  mapVersions.push({ mapId, versionNo: mapVersionNo });

  const puzzle = await api
    .post('/api/puzzles')
    // v0.8.5 §7：编码必填（部署时预填路径用）。
    .send({ name: `撕扇 ${unique('p')}`, code: uniqueSlug('pz'), mapId, mapVersionNo });
  expect(puzzle.status).toBe(200);
  const puzzleId = puzzle.body.data.id as number;
  createdPuzzles.push(puzzleId);

  const initial = await api.get(`/api/puzzles/${puzzleId}`);
  const puzzleDraft = initial.body.data.data;
  puzzleDraft.characterSlots[0] = {
    characterId,
    linkages: [{ type: 'asset', id: assetId, scope: 'all', effect: 'highlight', color: 'red' }],
  };

  // v0.8.6 §4：先真的传一张图，再把回执的 `path` 存进草稿（发布后它就冻在版本行里）。
  let forbiddenSymbolPath: string | undefined;
  if (options.forbiddenSymbol) {
    const uploaded = await api
      .post(`/api/puzzles/${puzzleId}/forbidden-symbol`)
      .attach('file', TINY_PNG, 'symbol.png');
    expect(uploaded.status).toBe(200);
    forbiddenSymbolPath = uploaded.body.data.path as string;
    symbolDirs.push(resolveUploadPath(`puzzles/${puzzleId}`));
  }

  // v0.8.7 §7：三枚工具按钮图标，同样走真实上传端点。
  const toolIconPaths: Record<string, string> = {};
  if (options.toolIcons) {
    for (const icon of ['clear', 'undo', 'submit'] as const) {
      const uploaded = await api
        .post(`/api/puzzles/${puzzleId}/tool-icons/${icon}`)
        .attach('file', TINY_PNG, `${icon}.png`);
      expect(uploaded.status).toBe(200);
      toolIconPaths[icon] = uploaded.body.data.path as string;
    }
    symbolDirs.push(resolveUploadPath(`puzzles/${puzzleId}`));
  }

  const saved = await api.put(`/api/puzzles/${puzzleId}`).send({
    data: {
      ...puzzleDraft,
      ...(forbiddenSymbolPath ? { forbiddenSymbol: { path: forbiddenSymbolPath } } : {}),
      ...(Object.keys(toolIconPaths).length
        ? {
            toolIcons: Object.fromEntries(
              Object.entries(toolIconPaths).map(([icon, path]) => [icon, { path }]),
            ),
          }
        : {}),
    },
    updatedAt: initial.body.data.updatedAt,
  });
  expect(saved.status).toBe(200);

  const published = await api.post(`/api/puzzles/${puzzleId}/versions`).send({});
  expect(published.status).toBe(200);
  createdPuzzles.push(published.body.data.id as number);
  puzzleVersions.push({ puzzleId, versionNo: published.body.data.version as number });

  const slug = uniqueSlug();
  const deployed = await api
    .post(`/api/puzzles/${published.body.data.id}/games`)
    .send({ name: '撕扇', slug });
  expect(deployed.status).toBe(200);
  expect(deployed.body.data.slug).toBe(slug);
  createdGames.push(deployed.body.data.id as number);

  return {
    slug,
    assetId,
    variantId,
    characterId,
    draftId: puzzleId,
    forbiddenSymbolPath,
    ...(Object.keys(toolIconPaths).length ? { toolIconPaths } : {}),
  };
}

afterAll(async () => {
  // 顺序不能换：game → 版本行 → 草稿 → 地图 → 资源/角色 → 主题（每一层都是 RESTRICT）。
  for (const id of createdGames) await api.delete(`/api/games/${id}`);
  for (const entry of puzzleVersions) {
    await api.delete(`/api/puzzles/${entry.puzzleId}/versions/${entry.versionNo}`);
  }
  for (const id of createdPuzzles) await api.delete(`/api/puzzles/${id}`);
  for (const entry of mapVersions) {
    await api.delete(`/api/maps/${entry.mapId}/versions/${entry.versionNo}`);
  }
  for (const id of createdMaps) await api.delete(`/api/maps/${id}`);
  for (const id of createdAssets) await api.delete(`/api/assets/${id}`);
  for (const id of createdCharacters) await api.delete(`/api/characters/${id}`);
  for (const code of createdThemes) await api.delete(`/api/themes/${code}`);

  /**
   * 兜底清扫。`DELETE /api/assets/:id` 会因为**已软删的版本行**的草稿还引用着它
   * 而拒绝 —— 那是产品行为（草稿引用检查不看 `deleted_at`），不是这个用例要验的东西。
   * 夹具必须自己擦干净，否则每跑一次 `npm test` 都在库里留一个主题。
   *
   * §19 起不再「留成软删」：主题的 DELETE 本来就是一条 UPDATE，软删的行还占着
   * `themes.code`（普通 UNIQUE），一次跑一具尸体，几十次之后表就没法看了。
   * `purgeTheme` 按外键顺序把这一整个主题物理抬走 —— 包括上面这些删不掉的残留。
   */
  for (const code of createdThemes) await purgeTheme(code);

  await db.destroy();

  for (const dir of symbolDirs) await rm(dir, { recursive: true, force: true });
});

describe('资源包导出（§11）', () => {
  it('0 关已上线的主题不许导出 —— 空包是零字节的谜题', async () => {
    const themeCode = await createTheme();
    const res = await api.get(`/api/themes/${themeCode}/bundle`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toContain('先至少上线一关');
  });

  it('一关已上线 → 包里只有这一关，引用已是包内序号', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);

    const built = await bundleService.buildThemeBundle(themeCode);

    expect(built.manifest.format).toBe('loredoku-theme');
    expect(built.manifest.formatVersion).toBe(1);
    expect(built.manifest.games.map((entry) => entry.key)).toEqual([game.slug]);
    // 主题不版本化（§4）：包的身份是导出时间，不是版本号。
    expect(built.manifest.exportedAt).toBeTruthy();

    const assets = JSON.parse(
      built.entries.find((entry) => entry.path === 'assets.json')!.data.toString('utf8'),
    ) as { assets: Array<{ id: number; variants: Array<{ id: number }> }> };
    expect(assets.assets).toHaveLength(1);
    expect(assets.assets[0]!.id).toBe(1);
    // 包里带整张形态表，所以形态序号也直接从 1 起
    expect(assets.assets[0]!.variants[0]!.id).toBe(1);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as {
      key: string;
      puzzle: {
        map: { data: { cells: Record<string, { background?: { assetId: number } }> } };
        characterSlots: Array<{ characterId: number; linkages?: Array<{ id: number }> }>;
      };
    };
    expect(level.key).toBe(game.slug);
    expect(level.puzzle.map.data.cells['0,0']?.background?.assetId).toBe(1);
    expect(level.puzzle.characterSlots[0]?.characterId).toBe(1);
    expect(level.puzzle.characterSlots[0]?.linkages?.[0]?.id).toBe(1);

    // 对账表留着：下一次导入回工坊靠它认人。
    expect(built.manifest.originIds.assets['1']).toBe(game.assetId);
    expect(built.manifest.originIds.characters['1']).toBe(game.characterId);
    expect(Object.values(built.manifest.originIds.games)).toHaveLength(1);

    // 纯色块资源没有图片，所以 `files` 只覆盖那几份 JSON，不会有任何 webp。
    expect(built.entries.every((entry) => !entry.path.startsWith('files/'))).toBe(true);
    expect(built.entries.map((entry) => entry.path)).toContain('manifest.json');
    expect(built.entries.map((entry) => entry.path)).toContain('theme.json');
  });

  /**
   * 2026-11-09 补（docs/v0.9.0.md §13）：包里每关只有 `difficulty` **数字**，
   * 名字与颜色是主题级的。不带它们，播放器列表页只能退回内置五档。
   * 同时守住另一半：缺省主题不写这个键，老包读起来仍是「没配过」。
   */
  it('主题配了难度分级 → manifest.theme 带上；没配就一个键都不多', async () => {
    const levels = [
      { level: 1, label: '初' },
      { level: 2, label: '通', color: '#B93A32' },
      { level: 3, label: '精' },
    ];
    const themedCode = await createTheme();
    const patched = await api
      .patch(`/api/themes/${themedCode}`)
      .send({ data: { version: 1, difficultyLevels: levels } });
    expect(patched.status).toBe(200);
    await deployedGame(themedCode);

    const built = await bundleService.buildThemeBundle(themedCode);
    expect(built.manifest.theme.difficultyLevels).toEqual(levels);
    // 真正进 zip 的那份 manifest.json 也要有 —— 只改内存里的 built.manifest 不算数。
    const fromZip = JSON.parse(
      built.entries.find((entry) => entry.path === 'manifest.json')!.data.toString('utf8'),
    ) as { theme: { difficultyLevels?: unknown } };
    expect(fromZip.theme.difficultyLevels).toEqual(levels);

    const plainCode = await createTheme();
    await deployedGame(plainCode);
    const plain = await bundleService.buildThemeBundle(plainCode);
    expect('difficultyLevels' in plain.manifest.theme).toBe(false);
  });

  /**
   * v0.8.6 §4：禁止符号是一张**上传图**，所以打包时它和资源图走同一条「搬文件 +
   * 改写为包内相对路径」的路 —— 只是目标目录是 `files/symbols/`。
   */
  it('禁止符号图进包：files/symbols 有条目、关卡 JSON 路径已改写、manifest 有 hash', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { forbiddenSymbol: true });
    expect(game.forbiddenSymbolPath).toBeTruthy();

    const built = await bundleService.buildThemeBundle(themeCode);

    const symbolEntries = built.entries.filter((entry) => entry.path.startsWith('files/symbols/'));
    expect(symbolEntries).toHaveLength(1);
    const target = `files/symbols/${game.slug}.webp`;
    expect(symbolEntries[0]!.path).toBe(target);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as { puzzle: { forbiddenSymbol?: { path: string } } };
    // 包里指向包内相对路径，不是 `puzzles/<id>/forbidden-symbol/...` 那条上传路径。
    expect(level.puzzle.forbiddenSymbol).toEqual({ path: target });

    // 校验和覆盖包里除 manifest 自己以外的一切 —— 这张图也不例外。
    const manifestFile = built.manifest.files.find((entry) => entry.path === target);
    expect(manifestFile?.bytes).toBe(symbolEntries[0]!.data.length);
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * v0.8.7 §4：谜题没配禁止符号就**跟随主题**。包里必须把它一起装上 —— 否则
   * 「线上跟着主题画一张图、包里退回 ×」，同一关在两种运行环境里长得不一样。
   */
  it('谜题没配 → 打包装上主题那张，关卡 JSON 里补出包内路径', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);
    // 关卡先建、主题后配：跟随是读取时的，不是建题那一刻的快照。
    const uploaded = await api
      .post(`/api/themes/${themeCode}/forbidden-symbol`)
      .attach('file', TINY_PNG, 'symbol.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));

    const built = await bundleService.buildThemeBundle(themeCode);

    const symbolEntries = built.entries.filter((entry) => entry.path.startsWith('files/symbols/'));
    expect(symbolEntries).toHaveLength(1);
    const target = `files/symbols/${game.slug}.webp`;
    expect(symbolEntries[0]!.path).toBe(target);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as { puzzle: { forbiddenSymbol?: { path: string } } };
    expect(level.puzzle.forbiddenSymbol).toEqual({ path: target });
  });

  /**
   * v0.9.2 §2：长按计时环是一张**主题级**的图，全主题共用一张 —— 所以它不进
   * 每一关的 JSON，只装在 `files/ring/` 里一份，路径写进 `manifest.theme.pressRing`。
   *
   * 同时守住另一半：没配环的主题不写这个键（老包与新包都按「没有」处理）。
   */
  it('计时环图进包：files/ring 一份、manifest.theme.pressRing 指过去', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);
    const uploaded = await api
      .post(`/api/themes/${themeCode}/press-ring`)
      .attach('file', TINY_PNG, 'ring.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));

    const built = await bundleService.buildThemeBundle(themeCode);

    const ringEntries = built.entries.filter((entry) => entry.path.startsWith('files/ring/'));
    expect(ringEntries).toHaveLength(1);
    const target = 'files/ring/press-ring.webp';
    expect(ringEntries[0]!.path).toBe(target);
    // 一张图只装一份，不因为「主题里有 3 关」就变成三份。
    expect(built.manifest.theme.pressRing).toEqual({ path: target });

    // 校验和覆盖包里除 manifest 自己以外的一切。
    const manifestFile = built.manifest.files.find((entry) => entry.path === target);
    expect(manifestFile?.bytes).toBe(ringEntries[0]!.data.length);
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 没配的主题：一个键都不多。
    const plainCode = await createTheme();
    await deployedGame(plainCode);
    const plain = await bundleService.buildThemeBundle(plainCode);
    expect('pressRing' in plain.manifest.theme).toBe(false);
  });

  /**
   * v0.8.7 §7：三枚工具按钮图标与禁止符号同一条路 —— 搬文件、改写为包内路径。
   * 文件名带 `-<icon>`：一关最多三张，解压后一眼能看出是哪一枚。
   */
  it('工具按钮图标进包：files/icons 三条、关卡 JSON 路径已改写、manifest 有 hash', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { toolIcons: true });

    const built = await bundleService.buildThemeBundle(themeCode);

    const entries = built.entries.filter((entry) => entry.path.startsWith('files/icons/'));
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      `files/icons/${game.slug}-clear.webp`,
      `files/icons/${game.slug}-submit.webp`,
      `files/icons/${game.slug}-undo.webp`,
    ]);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as { puzzle: { toolIcons?: Record<string, { path: string }> } };
    expect(level.puzzle.toolIcons).toEqual({
      clear: { path: `files/icons/${game.slug}-clear.webp` },
      undo: { path: `files/icons/${game.slug}-undo.webp` },
      submit: { path: `files/icons/${game.slug}-submit.webp` },
    });

    const manifestFile = built.manifest.files.find(
      (entry) => entry.path === `files/icons/${game.slug}-clear.webp`,
    );
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * 谜题没配就跟随主题 —— 与禁止符号 §4 的理由一字不差：线上画主题那一套，包里
   * 若没有，同一关的按钮在两种运行环境里长得不一样。
   */
  it('谜题没配工具图标 → 打包装上主题那三枚', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));
    for (const icon of ['clear', 'undo', 'submit'] as const) {
      const uploaded = await api
        .post(`/api/themes/${themeCode}/tool-icons/${icon}`)
        .attach('file', TINY_PNG, `${icon}.png`);
      expect(uploaded.status).toBe(200);
    }

    const built = await bundleService.buildThemeBundle(themeCode);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as { puzzle: { toolIcons?: Record<string, { path: string }> } };
    expect(level.puzzle.toolIcons).toEqual({
      clear: { path: `files/icons/${game.slug}-clear.webp` },
      undo: { path: `files/icons/${game.slug}-undo.webp` },
      submit: { path: `files/icons/${game.slug}-submit.webp` },
    });
  });

  /** 某一枚的源文件不在了 → 只跳过那一枚，但 `problems` 非空，打包照样中止。 */
  it('某一枚工具图标不在了 → 打包中止（400 + bundle-incomplete）', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { toolIcons: true });

    await rm(resolveUploadPath(game.toolIconPaths!.undo!), { force: true });

    const res = await api.get(`/api/themes/${themeCode}/bundle`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.data).toMatchObject({ kind: 'bundle-incomplete' });
  });

  /** §11.2：引用闭包缺一个文件就**中止**，不能交付一个少一张图的包。 */
  it('禁止符号图不在了 → 打包中止（400 + bundle-incomplete）', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { forbiddenSymbol: true });

    await rm(resolveUploadPath(game.forbiddenSymbolPath!), { force: true });

    const res = await api.get(`/api/themes/${themeCode}/bundle`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.data).toMatchObject({ kind: 'bundle-incomplete' });
  });

  it('HTTP 层流出的是 zip，文件名带主题 code', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);

    // superagent 没有 `application/zip` 的解析器，`.buffer(true)` 只会得到一个空对象 ——
    // 自己收字节，才验得了「真的是一个 zip」。
    const res = await api
      .get(`/api/themes/${themeCode}/bundle`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/zip');
    expect(res.headers['content-disposition']).toContain(`filename="${themeCode}-bundle-`);

    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    // 本地文件头 `PK\x03\x04` —— 内容正确性由上面那条用例管，这里只验「真的是 zip」。
    expect(body.subarray(0, 4).toString('binary')).toBe('PK\x03\x04');
  });

  it('主题不存在 → 404，而不是一个空包', async () => {
    const res = await api.get('/api/themes/999999/bundle');
    expect(res.status).toBe(404);
  });
});
