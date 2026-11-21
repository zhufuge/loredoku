import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import sharp from 'sharp';
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
 * 三条优化（共享主题图 / 按引用裁形态 / 封面 768 webp）各有一条用例。
 *
 * 大部分素材用**纯色块**资源与角色：没有图片文件，包的内容完全确定；只有形态裁剪
 * 与封面两条用例需要真的传图（写进 `storage/uploads`，由 `symbolDirs` 兜底扫掉）。
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
/** v0.8.6 §4：标记上传图落在 `puzzles/<id>/forbidden-symbol/`。 */
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
 * `mark: true` 时在发布前走一遍真实的上传端点并把 `path` 存进草稿 ——
 * 打包链路（v0.8.6 §4）要的正是「版本行里有一个上传图路径」这个状态。
 */
async function deployedGame(
  themeCode: string,
  options: { mark?: boolean; toolIcons?: boolean } = {},
): Promise<{
  slug: string;
  assetId: number;
  variantId: number;
  characterId: number;
  draftId: number;
  markPath?: string;
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
  let markPath: string | undefined;
  if (options.mark) {
    const uploaded = await api
      .post(`/api/puzzles/${puzzleId}/mark`)
      .attach('file', TINY_PNG, 'symbol.png');
    expect(uploaded.status).toBe(200);
    markPath = uploaded.body.data.path as string;
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
      ...(markPath ? { mark: { path: markPath } } : {}),
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
    markPath,
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
    // v0.11.0 §2：形态按引用裁，不再整表进包。这个夹具只有一形态且被格子引用，
    // 所以它就是被保留的那一个，序号从 1 起。
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
   * v0.8.6 §4：标记是一张**上传图**，所以打包时它和资源图走同一条「搬文件 +
   * 改写为包内相对路径」的路 —— 只是目标目录是 `files/marks/`。
   */
  it('标记图进包：files/marks 有条目、关卡 JSON 路径已改写、manifest 有 hash', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { mark: true });
    expect(game.markPath).toBeTruthy();

    const built = await bundleService.buildThemeBundle(themeCode);

    const symbolEntries = built.entries.filter((entry) => entry.path.startsWith('files/marks/'));
    expect(symbolEntries).toHaveLength(1);
    const target = `files/marks/${game.slug}.webp`;
    expect(symbolEntries[0]!.path).toBe(target);

    const level = JSON.parse(
      built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
    ) as { puzzle: { mark?: { path: string } } };
    // 包里指向包内相对路径，不是 `puzzles/<id>/forbidden-symbol/...` 那条上传路径。
    expect(level.puzzle.mark).toEqual({ path: target });

    // 校验和覆盖包里除 manifest 自己以外的一切 —— 这张图也不例外。
    const manifestFile = built.manifest.files.find((entry) => entry.path === target);
    expect(manifestFile?.bytes).toBe(symbolEntries[0]!.data.length);
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * v0.8.7 §4：谜题没配标记就**跟随主题**。包里必须把它一起装上 —— 否则
   * 「线上跟着主题画一张图、包里退回 ×」，同一关在两种运行环境里长得不一样。
   *
   * v0.11.0 §1：主题那张图只装**一份**，所有跟随的关都指向同一个包内地址
   * `files/marks/theme.webp` —— `FileSink` 按目标路径去重，这里只是把名字取成同一串。
   */
  it('谜题没配 → 打包装上主题那张，多关共用同一份文件', async () => {
    const themeCode = await createTheme();
    const first = await deployedGame(themeCode);
    const second = await deployedGame(themeCode);
    // 关卡先建、主题后配：跟随是读取时的，不是建题那一刻的快照。
    const uploaded = await api
      .post(`/api/themes/${themeCode}/mark`)
      .attach('file', TINY_PNG, 'symbol.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));

    const built = await bundleService.buildThemeBundle(themeCode);

    const symbolEntries = built.entries.filter((entry) => entry.path.startsWith('files/marks/'));
    // 两关都跟随主题，图只有一份 —— 请求也跟着从两次合成一次。
    expect(symbolEntries).toHaveLength(1);
    const target = 'files/marks/theme.webp';
    expect(symbolEntries[0]!.path).toBe(target);

    for (const game of [first, second]) {
      const level = JSON.parse(
        built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
      ) as { puzzle: { mark?: { path: string } } };
      expect(level.puzzle.mark).toEqual({ path: target });
    }
  });

  /**
   * v0.9.2 §2；v0.9.6 起长按计时环与提交校验圈**合并成一张**（`ThemeData.ring`）。
   *
   * 它是一张**主题级**的图，全主题共用一张 —— 所以不进每一关的 JSON，只装在
   * `files/ring/` 里一份，路径写进 `manifest.theme.ring.image`。
   *
   * 同时守住另一半：没配环的主题不写这个键（老包与新包都按「没有」处理）。
   */
  it('圆环图进包：files/ring 一份、manifest.theme.ring 指过去', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);
    const uploaded = await api
      .post(`/api/themes/${themeCode}/ring`)
      .attach('file', TINY_PNG, 'ring.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));

    const built = await bundleService.buildThemeBundle(themeCode);

    const ringEntries = built.entries.filter((entry) => entry.path.startsWith('files/ring/'));
    expect(ringEntries).toHaveLength(1);
    const target = 'files/ring/ring.webp';
    expect(ringEntries[0]!.path).toBe(target);
    // 一张图只装一份，不因为「主题里有 3 关」就变成三份。
    expect(built.manifest.theme.ring).toEqual({ image: { path: target } });

    // 校验和覆盖包里除 manifest 自己以外的一切。
    const manifestFile = built.manifest.files.find((entry) => entry.path === target);
    expect(manifestFile?.bytes).toBe(ringEntries[0]!.data.length);
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 没配的主题：一个键都不多。
    const plainCode = await createTheme();
    await deployedGame(plainCode);
    const plain = await bundleService.buildThemeBundle(plainCode);
    expect('ring' in plain.manifest.theme).toBe(false);
  });

  /**
   * 结算卡的图标图与圆环同一条路 —— 搬进 `files/verdict/`，manifest 指过去；
   * 只配文字时也进 manifest，但不产生任何文件。
   */
  it('结算卡配置进包：图标图搬进 files/verdict、文字与标题原样进 manifest', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);
    const uploaded = await api
      .post(`/api/themes/${themeCode}/verdict-icon`)
      .attach('file', TINY_PNG, 'icon.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    symbolDirs.push(resolveUploadPath(`themes/${Number(row!.id)}`));

    const textSaved = await api
      .patch(`/api/themes/${themeCode}/verdict`)
      .send({ iconText: '🏮', title: '此案已了' });
    expect(textSaved.status).toBe(200);

    const built = await bundleService.buildThemeBundle(themeCode);

    const entries = built.entries.filter((entry) => entry.path.startsWith('files/verdict/'));
    expect(entries).toHaveLength(1);
    const target = 'files/verdict/verdict.webp';
    expect(entries[0]!.path).toBe(target);
    // 一张图只装一份，不因为「主题里有 1 关」就多出来。
    expect(built.manifest.theme.verdict).toEqual({
      iconText: '🏮',
      icon: { path: target },
      title: '此案已了',
    });

    const manifestFile = built.manifest.files.find((entry) => entry.path === target);
    expect(manifestFile?.bytes).toBe(entries[0]!.data.length);
    expect(manifestFile?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // 只配文字：进 manifest，但包里一条 files/verdict 都没有。
    const textOnlyCode = await createTheme();
    await deployedGame(textOnlyCode);
    expect(
      (
        await api
          .patch(`/api/themes/${textOnlyCode}/verdict`)
          .send({ title: '此案已了' })
      ).status,
    ).toBe(200);
    const textOnly = await bundleService.buildThemeBundle(textOnlyCode);
    expect(textOnly.manifest.theme.verdict).toEqual({ title: '此案已了' });
    expect(textOnly.entries.filter((entry) => entry.path.startsWith('files/verdict/'))).toHaveLength(
      0,
    );

    // 没配的主题：一个键都不多。
    const plainCode = await createTheme();
    await deployedGame(plainCode);
    const plain = await bundleService.buildThemeBundle(plainCode);
    expect('verdict' in plain.manifest.theme).toBe(false);
  });

  /**
   * 列表页那两行字（「N 关可玩」/「已通过 N 关」）随包走。
   *
   * 与难度分级同一条规矩：配了就进 manifest（zip 里那份也得有），没配就一个键
   * 都不多 —— 播放器那边按「有没有这个键」决定用内置那句还是用配的。
   */
  it('列表页文案进包：配了就带上，没配就一个键都不多', async () => {
    const gameList = { playable: '共 {n} 回', passed: '已了 {n} 桩' };
    const themedCode = await createTheme();
    const patched = await api
      .patch(`/api/themes/${themedCode}`)
      .send({ data: { version: 1, gameList } });
    expect(patched.status).toBe(200);
    await deployedGame(themedCode);

    const built = await bundleService.buildThemeBundle(themedCode);
    expect(built.manifest.theme.gameList).toEqual(gameList);
    const fromZip = JSON.parse(
      built.entries.find((entry) => entry.path === 'manifest.json')!.data.toString('utf8'),
    ) as { theme: { gameList?: unknown } };
    expect(fromZip.theme.gameList).toEqual(gameList);

    // 少了 `{n}` 的文案在写库这一步就该被拒 —— 那句话会失去关数。
    const badCode = await createTheme();
    const rejected = await api
      .patch(`/api/themes/${badCode}`)
      .send({ data: { version: 1, gameList: { playable: '共若干回' } } });
    expect(rejected.status).toBe(400);

    const plainCode = await createTheme();
    await deployedGame(plainCode);
    const plain = await bundleService.buildThemeBundle(plainCode);
    expect('gameList' in plain.manifest.theme).toBe(false);
  });

  /**
   * 文件不在了要在打包时中止 —— 与标记、工具图标同一条规矩，
   * 免得流出一个「玩家打开才发现图 404」的包。
   */
  it('结算图标图不在了 → 打包中止（400 + bundle-incomplete）', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);
    const uploaded = await api
      .post(`/api/themes/${themeCode}/verdict-icon`)
      .attach('file', TINY_PNG, 'icon.png');
    expect(uploaded.status).toBe(200);
    const row = (await db('themes').where({ code: themeCode }).first('id')) as
      | { id: string | number }
      | undefined;
    const dir = resolveUploadPath(`themes/${Number(row!.id)}`);
    symbolDirs.push(dir);
    await rm(dir, { recursive: true, force: true });

    const res = await api.get(`/api/themes/${themeCode}/bundle`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.data).toMatchObject({ kind: 'bundle-incomplete' });
  });

  /**
   * v0.8.7 §7：三枚工具按钮图标与标记同一条路 —— 搬文件、改写为包内路径。
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
   * 谜题没配就跟随主题 —— 与标记 §4 的理由一字不差：线上画主题那一套，包里
   * 若没有，同一关的按钮在两种运行环境里长得不一样。
   *
   * v0.11.0 §1：与标记同一条规矩 —— 主题的图只装一份，路径是
   * `files/icons/theme-<icon>.webp`，所有跟随的关共用。
   */
  it('谜题没配工具图标 → 打包装上主题那三枚，多关共用一份', async () => {
    const themeCode = await createTheme();
    const first = await deployedGame(themeCode);
    const second = await deployedGame(themeCode);
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

    // 三枚图标各一份，不因为「两关都跟随」就变成六份。
    const entries = built.entries.filter((entry) => entry.path.startsWith('files/icons/'));
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      'files/icons/theme-clear.webp',
      'files/icons/theme-submit.webp',
      'files/icons/theme-undo.webp',
    ]);

    for (const game of [first, second]) {
      const level = JSON.parse(
        built.entries.find((entry) => entry.path === `puzzles/${game.slug}.json`)!.data.toString('utf8'),
      ) as { puzzle: { toolIcons?: Record<string, { path: string }> } };
      expect(level.puzzle.toolIcons).toEqual({
        clear: { path: 'files/icons/theme-clear.webp' },
        undo: { path: 'files/icons/theme-undo.webp' },
        submit: { path: 'files/icons/theme-submit.webp' },
      });
    }
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
  it('标记图不在了 → 打包中止（400 + bundle-incomplete）', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode, { mark: true });

    await rm(resolveUploadPath(game.markPath!), { force: true });

    const res = await api.get(`/api/themes/${themeCode}/bundle`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.data).toMatchObject({ kind: 'bundle-incomplete' });
  });

  /**
   * v0.11.0 §2：形态按引用裁 —— 只留被格子引用的形态，外加每个被引资源的首形态
   * （`resolveAssetVariant` 的兜底指着它，`Asset.variants` 也不能为空）。播放器只按
   * 格子画图、不画资源面板，未引用的形态进包只是白占体积。
   */
  it('资源的第二形态没被任何格子引用 → 形态和图都不进包', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);
    // 夹具里两个格子引用的都是**首**形态；再加一个第二形态，它哪都不被引用。
    const created = await api
      .post(`/api/assets/${game.assetId}/variants`)
      .send({ name: '第二形态' });
    expect(created.status).toBe(200);
    const secondId = created.body.data.id as number;
    // 两形态各传一张图：文件名才会带 -1 / -2 后缀，砍掉第二张才有断言可下。
    for (const variantId of [game.variantId, secondId]) {
      const uploaded = await api
        .post(`/api/assets/${game.assetId}/variants/${variantId}/image`)
        .attach('file', TINY_PNG, `${variantId}.png`);
      expect(uploaded.status).toBe(200);
    }
    symbolDirs.push(resolveUploadPath(`assets/${game.assetId}/variants`));

    const built = await bundleService.buildThemeBundle(themeCode);

    const assets = JSON.parse(
      built.entries.find((entry) => entry.path === 'assets.json')!.data.toString('utf8'),
    ) as { assets: Array<{ variants: Array<{ id: number }> }> };
    expect(assets.assets[0]!.variants).toHaveLength(1);
    // 保留的是被引用的首形态（重编号后仍是 1）。
    expect(assets.assets[0]!.variants[0]!.id).toBe(1);

    // 图也一样：只有 -1 那一份，-2 不在包里。
    const imageEntries = built.entries.filter((entry) => entry.path.startsWith('files/assets/'));
    expect(imageEntries).toHaveLength(1);
    expect(imageEntries[0]!.path).toMatch(/-1\.webp$/);
  });

  /**
   * v0.11.0 §3：封面统一裁到 768px 长边、转 webp —— 播放器的列表卡片只有几百
   * 像素宽，原图进包只会让 zip 变大、首屏多花一次流量。
   */
  it('关卡封面进包：统一 768px webp，不再搬原图', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);
    const row = (await db('games').where({ slug: game.slug }).first('id')) as
      | { id: string | number }
      | undefined;
    const gameId = Number(row!.id);
    // 900×600 —— 比新上限宽，才能验出「真的裁了」。
    const wide = await sharp({
      create: { width: 900, height: 600, channels: 4, background: '#8C7B6B' },
    })
      .png()
      .toBuffer();
    const uploaded = await api.post(`/api/games/${gameId}/cover`).attach('file', wide, 'cover.png');
    expect(uploaded.status).toBe(200);
    symbolDirs.push(resolveUploadPath(`games/${gameId}`));

    const built = await bundleService.buildThemeBundle(themeCode);

    // manifest 指的是裁过的那个包内地址。
    expect(built.manifest.games[0]!.cover).toBe('files/covers/1.webp');
    const entry = built.entries.find((item) => item.path === 'files/covers/1.webp');
    expect(entry).toBeTruthy();
    const meta = await sharp(entry!.data).metadata();
    expect(meta.format).toBe('webp');
    // `fit: 'inside'`：900×600 → 768×512，画幅不裁、不放大。
    expect(meta.width).toBe(768);
    expect(meta.height).toBe(512);
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

  /**
   * `?games=` 只打勾上的那几关。两关都在线、只给第二关的 id ——
   * manifest 与关卡 JSON 都只剩这一关，清单的另一头（取消勾选）由前端管。
   */
  it('给了 gameIds 就只打选中的那几关', async () => {
    const themeCode = await createTheme();
    const kept = await deployedGame(themeCode);
    const dropped = await deployedGame(themeCode);
    const keptId = Number(
      (await db('games').where({ slug: kept.slug }).first('id'))?.id,
    );
    expect(Number.isFinite(keptId)).toBe(true);

    const built = await bundleService.buildThemeBundle(themeCode, { gameIds: [keptId] });

    expect(built.manifest.games.map((entry) => entry.key)).toEqual([kept.slug]);
    expect(built.entries.some((entry) => entry.path === `puzzles/${kept.slug}.json`)).toBe(true);
    expect(built.entries.some((entry) => entry.path === `puzzles/${dropped.slug}.json`)).toBe(false);

    // HTTP 同一条路：query 里的 id 列表就是选中集。
    const res = await api
      .get(`/api/themes/${themeCode}/bundle?games=${keptId}`)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    // 内容是压缩的，这里只验「仍然是一个正常的 zip」—— 内容取舍由上面那句断言管。
    expect((res.body as Buffer).subarray(0, 4).toString('binary')).toBe('PK\x03\x04');
  });

  /** 选中的 id 不在线 / 不是这个主题的 —— 单独报出来，作者才分得清「选错了」。 */
  it('选中的关不在线或不属于这个主题 → 400，并列出是哪几关', async () => {
    const themeCode = await createTheme();
    const game = await deployedGame(themeCode);
    const other = await deployedGame(await createTheme());
    const otherId = Number((await db('games').where({ slug: other.slug }).first('id'))?.id);

    const res = await api.get(`/api/themes/${themeCode}/bundle?games=${otherId},999999`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toContain('999999');
    expect(res.body.message).toContain(String(otherId));

    // 不给 games query 仍是全部在线关（老调用方不受影响）。
    const all = await bundleService.buildThemeBundle(themeCode);
    expect(all.manifest.games.map((entry) => entry.key)).toEqual([game.slug]);
  });

  /** query 形状不对（空串、非数字）在进服务前就 400，不碰数据库。 */
  it('games 不是逗号分隔的数字 → 400', async () => {
    const themeCode = await createTheme();
    await deployedGame(themeCode);

    for (const value of ['', 'abc', '1,']) {
      const res = await api.get(`/api/themes/${themeCode}/bundle?games=${value}`);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('主题不存在 → 404，而不是一个空包', async () => {
    const res = await api.get('/api/themes/999999/bundle');
    expect(res.status).toBe(404);
  });
});
