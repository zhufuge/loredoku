import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode, MAP_JSON_VERSION } from '@loredoku/shared';
import type { MapDraft } from '@loredoku/shared';
import { api, fixtureTheme } from './helpers';
import { db } from '../src/db/knex';
import { resolveUploadPath } from '../src/utils/paths';

const createdMapEntries: number[] = [];
const createdAssets: number[] = [];
const createdCharacters: number[] = [];
/** Deleted before `maps` — `puzzles.map_project_id` is ON DELETE RESTRICT. */
const createdPuzzles: number[] = [];
const uploadedAvatarDirs: string[] = [];
const uploadedGameCoverDirs: string[] = [];
const uploadedMapCoverDirs: string[] = [];
/** v0.8.6 §4：禁止符号上传图落的目录（`puzzles/<id>` / `themes/<id>`）。 */
const uploadedPuzzleSymbolDirs: string[] = [];
const uploadedThemeSymbolDirs: string[] = [];

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * OPT-W04: a game access path must match `^[a-z0-9-]+$`, so `uniqueCode` (which
 * contains `_`) cannot be used for one. Hex keeps it unique and slug-safe.
 */
function uniqueSlug(prefix = 'game'): string {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * v0.5.0 FEAT-K14: the map draft is pure canvas — the roster and the palette
 * moved to the puzzle, so `characterSlots` is gone and `version` is the v3
 * stamp (`MAP_JSON_VERSION`).
 */
function emptyDraft(gridSize: number): MapDraft {
  return {
    version: MAP_JSON_VERSION,
    gridSize,
    cells: {},
    regions: [],
  };
}

/**
 * v0.5.8: 创建地图不再带画布尺寸（`maps.grid_size` 已删）。测试里的
 * `createMap({ name, gridSize: n })` 语义不变 —— helper 把 gridSize 转成
 * 建后的一次初始化调用，这样所有既有用例一行不用改。
 */
async function initMap(mapId: number, gridSize: number): Promise<void> {
  const res = await api.patch(`/api/maps/${mapId}/grid-size`).send({ gridSize });
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(ErrorCode.OK);
}

/**
 * v0.5.8 第八阶段：保存画布不再需要先读 revision —— 乐观锁取消，服务端后写
 * 覆盖。这个 helper 只负责「写一次并且必须成功」。
 */
/** supertest 的 Response（不是 DOM 那个）—— 用推断类型，避免撞名。 */
type ApiResponse = Awaited<ReturnType<typeof api.get>>;

async function saveCanvas(mapId: number, draft: MapDraft): Promise<ApiResponse> {
  const res = await api.put(`/api/maps/${mapId}/map`).send({ data: draft });
  expect(res.status).toBe(200);
  return res;
}

async function createMap(body: Record<string, unknown> = {}): Promise<number> {
  // §19：主题必须指名 —— 这些用例只想要一个落点，默认给夹具主题。
  const res = await api.post('/api/maps').send({ themeCode: await fixtureTheme(), ...body });
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(ErrorCode.OK);
  const id = res.body.data.id as number;
  createdMapEntries.push(id);
  if (typeof body.gridSize === 'number') {
    await initMap(id, body.gridSize);
  }
  return id;
}

async function createAsset(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api
    .post('/api/assets')
    .send({ code: uniqueCode('item'), name: 'Asset', themeCode: await fixtureTheme(), ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdAssets.push(id);
  return id;
}

async function createCharacter(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api
    .post('/api/characters')
    .send({ code: uniqueCode('char'), name: 'Character', themeCode: await fixtureTheme(), ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdCharacters.push(id);
  return id;
}

/** 1×1 PNG — enough for the avatar upload pipeline to accept it. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function createCharacterWithAvatar(body: Record<string, unknown> = {}): Promise<number> {
  const id = await createCharacter(body);
  const uploaded = await api
    .post(`/api/characters/${id}/avatar`)
    .attach('file', TINY_PNG, 'avatar.png');
  expect(uploaded.status).toBe(200);
  expect(uploaded.body.data.avatarThumbUrl).toBeTruthy();
  uploadedAvatarDirs.push(resolveUploadPath(`characters/${id}`));
  return id;
}

/** Publishes the map's working draft and returns the freshly minted version. */
async function publish(mapId: number): Promise<number> {
  // v0.5.8: 发布弹窗去掉备注，请求体为空对象。
  const res = await api.post(`/api/maps/${mapId}/versions`).send({});
  expect(res.status).toBe(200);
  return res.body.data.versionNo as number;
}

/**
 * v0.5.8 第三阶段：发布 = INSERT 一条 `maps` 行，所以版本行的 id 也要单独记账
 * —— 这些用例会软删 / 硬删工作条目，`root_id` 扫不到它们。
 */
const createdVersionRows: number[] = [];

async function publishVersion(mapId: number, version?: number): Promise<ApiResponse> {
  const res = await api
    .post(`/api/maps/${mapId}/versions`)
    .send(version === undefined ? {} : { version });
  expect(res.status).toBe(200);
  createdVersionRows.push(res.body.data.id as number);
  return res;
}

/** FEAT-K01: a puzzle bound to a published map version. */
async function createPuzzle(body: Record<string, unknown>): Promise<number> {
  /**
   * v0.8.5 §7：编码必填（部署时预填路径的那一串）。绝大多数用例不关心它，这里补一个
   * 合法的唯一值；要断言编码的用例自己传，传了就盖掉这个默认。
   */
  const res = await api.post('/api/puzzles').send({ code: uniqueSlug('pc'), ...body });
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(ErrorCode.OK);
  const id = res.body.data.id as number;
  createdPuzzles.push(id);
  return id;
}

/** A map whose canvas holds one object item, published as `v1`. */
async function publishedMapWithItem(
  name: string,
): Promise<{ mapId: number; assetId: number; versionNo: number }> {
  const mapId = await createMap({ name, gridSize: 6 });
  const assetId = await createAsset({ type: 'item', blocking: false });
  const draft = emptyDraft(6);
  draft.cells['0,0'] = { item: { assetId, w: 1, h: 1 } };
  const saved = await saveCanvas(mapId, draft);
  expect(saved.status).toBe(200);
  const versionNo = await publish(mapId);
  return { mapId, assetId, versionNo };
}

/** 一个新谜题（只有草稿行），底图复制自一张刚发布的地图版本。 */
async function puzzleWithVersion(
  name: string,
): Promise<{ mapId: number; draftId: number; puzzleName: string; code: string }> {
  const mapId = await createMap({ name, gridSize: 6 });
  const versionNo = await publish(mapId);
  const puzzleName = `${name} 谜题`;
  // v0.8.5 §7：编码必填。这里显式给一个，好让「部署不给路径时拿编码兜底」可断言。
  const code = uniqueSlug('pz');
  const draftId = await createPuzzle({
    name: puzzleName,
    code,
    mapId: mapId,
    mapVersionNo: versionNo,
  });
  return { mapId, draftId, puzzleName, code };
}

/** 发布一个谜题，返回**版本行 id** —— 部署的单位（草稿行不能部署）。 */
async function publishPuzzle(puzzleId: number, version?: number): Promise<number> {
  const res = await api
    .post(`/api/puzzles/${puzzleId}/versions`)
    .send(version === undefined ? {} : { version });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  // 版本行是**新插入的行**，也要单独记账（草稿行删了扫不到它）。
  createdPuzzles.push(id);
  return id;
}

/** 一个已发布的谜题：名册上有一位带头像的参与者，可以部署。 */
async function deployablePuzzle(name: string): Promise<{
  mapId: number;
  draftId: number;
  versionId: number;
  versionNo: number;
  puzzleName: string;
  code: string;
}> {
  const context = await puzzleWithVersion(name);
  const characterId = await createCharacterWithAvatar();
  const initial = await api.get(`/api/puzzles/${context.draftId}`);
  const draft = initial.body.data.data;
  draft.characterSlots[0] = { characterId };
  const saved = await api
    .put(`/api/puzzles/${context.draftId}`)
    .send({ data: draft, updatedAt: initial.body.data.updatedAt });
  expect(saved.status).toBe(200);

  const versionId = await publishPuzzle(context.draftId);
  return { ...context, versionId, versionNo: 1 };
}

describe('旧接口前缀', () => {
  it('/api/projects 308 重定向到 /api/maps', async () => {
    const res = await api.get('/api/projects').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/maps');
  });

  it('重定向保留子路径', async () => {
    const res = await api.get('/api/projects/12/versions').redirects(0);
    expect(res.status).toBe(308);
    expect(res.headers.location).toBe('/api/maps/12/versions');
  });
});

describe('maps API', () => {
  it('v0.5.8 §1: creates a map with no canvas size at all', async () => {
    const res = await api
      .post('/api/maps')
      .send({ name: `Smoke ${uniqueCode('p')}`, themeCode: await fixtureTheme() });
    expect(res.status).toBe(200);
    // 创建时不再写尺寸 —— 第一次进编辑器时才由初始化弹窗写入草稿。
    expect(res.body.data.gridSize).toBeNull();
    createdMapEntries.push(res.body.data.id);
  });

  it('v0.5.8 §1: ignores a legacy gridSize field instead of validating it', async () => {
    const res = await api
      .post('/api/maps')
      .send({ name: `Bad ${uniqueCode('p')}`, gridSize: 1, themeCode: await fixtureTheme() });
    // schema 不再认识这个字段（非 strict，直接忽略），尺寸仍为空。
    expect(res.status).toBe(200);
    expect(res.body.data.gridSize).toBeNull();
    createdMapEntries.push(res.body.data.id);
  });

  it('v0.5.8 第六阶段: 允许同名创建与同名改名，但复制仍自动避开重名', async () => {
    const name = `Twin ${uniqueCode('p')}`;

    const themeCode = await fixtureTheme();
    const first = await api.post('/api/maps').send({ name, themeCode });
    const second = await api.post('/api/maps').send({ name, themeCode });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.body.data.name).toBe(name);
    createdMapEntries.push(first.body.data.id, second.body.data.id);

    // 改名也不再查重。
    const renamed = await api.patch(`/api/maps/${second.body.data.id}`).send({ name });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.name).toBe(name);

    // 自动取名（`uniqueCopyName`）仍避重：两次复制得到「副本」「副本 2」。
    const dup1 = await api.post(`/api/maps/${first.body.data.id}/duplicate`);
    const dup2 = await api.post(`/api/maps/${first.body.data.id}/duplicate`);
    expect(dup1.body.data.name).toBe(`${name} 副本`);
    expect(dup2.body.data.name).toBe(`${name} 副本 2`);
    createdMapEntries.push(dup1.body.data.id, dup2.body.data.id);
  });

  it('lists, reads, updates, duplicates and deletes a map', async () => {
    const name = `Lifecycle ${uniqueCode('p')}`;
    const id = await createMap({ name, gridSize: 8 });

    const list = await api.get('/api/maps');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data.list)).toBe(true);
    expect(list.body.data.list.some((p: { mapId: number }) => p.mapId === id)).toBe(true);

    const detail = await api.get(`/api/maps/${id}`);
    expect(detail.body.data.gridSize).toBe(8);

    const updated = await api.patch(`/api/maps/${id}`).send({ name: `${name} v2` });
    expect(updated.body.data.name).toBe(`${name} v2`);

    const dup = await api.post(`/api/maps/${id}/duplicate`);
    expect(dup.status).toBe(200);
    expect(dup.body.data.gridSize).toBe(8);
    createdMapEntries.push(dup.body.data.id);

    const removed = await api.delete(`/api/maps/${id}`);
    expect(removed.status).toBe(200);
    const missing = await api.get(`/api/maps/${id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  /**
   * FEAT-K09 (docs/v0.5.0.md §7.1) — with Q3 = B the list is a **union** of the
   * work entry and every version entry of the same blood lineage, keyed by
   * `map_projects.root_id`. The keyword filter matches both kinds, which is how
   * this test isolates a single lineage in a shared dev database.
   */
  it('groups a work entry with its version entries in one list (FEAT-K09)', async () => {
    const name = `Union ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    await publish(mapId);
    await publish(mapId);

    const res = await api.get(`/api/maps?keyword=${encodeURIComponent(name)}`);
    expect(res.status).toBe(200);
    const rows = res.body.data.list as Array<{
      kind: 'draft' | 'version';
      rootId: number;
      mapId: number;
      versionNo: number | null;
      currentVersionNo: number | null;
      versionCount: number;
      name: string;
    }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.name === name)).toBe(true);

    const work = rows.find((row) => row.kind === 'draft');
    expect(work?.mapId).toBe(mapId);
    expect(work?.versionNo).toBeNull();
    expect(work?.currentVersionNo).toBe(2);
    expect(work?.versionCount).toBe(2);

    const versions = rows
      .filter((row) => row.kind === 'version')
      .map((row) => row.versionNo)
      .sort();
    expect(versions).toEqual([1, 2]);
    // One lineage → one root, and exactly one work entry.
    expect(new Set(rows.map((row) => row.rootId)).size).toBe(1);
    // v0.5.8 第三阶段：发布不再触碰工作条目行（设计 §5「工作条目行不动」），所以
    // 按 updated_at 排序时版本行可能排在草稿行前面 —— 只断言草稿行唯一存在。
    expect(rows.filter((row) => row.kind === 'draft')).toHaveLength(1);
  });

  /** FEAT-K03 §2.4: the 「地图版本」 picker of the create-puzzle dialog. */
  it('lists every published version for the puzzle picker (FEAT-K03)', async () => {
    const name = `Picker ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    const versionNo = await publish(mapId);

    const res = await api.get('/api/maps/versions');
    expect(res.status).toBe(200);
    const row = (
      res.body.data as Array<{
        mapId: number;
        rootId: number;
        versionNo: number;
        mapName: string;
        gridSize: number;
      }>
    ).find((entry) => entry.mapName === name && entry.versionNo === versionNo);
    expect(row?.mapName).toBe(name);
    // v0.5.8: `grid_size` 列删了，这里是从快照自身派生的同一个值。
    expect(row?.gridSize).toBe(6);
    expect(typeof row?.rootId).toBe('number');
  });

  /** v0.5.0 §1: the works module is gone — the route went with it. */
  it('no longer exposes the works module (v0.5.0)', async () => {
    const res = await api.get('/api/versions');
    expect(res.status).toBe(404);
  });

  /**
   * FEAT-H03（docs/v0.4.2.md §3.2c）：封面是二进制，走自己的 `POST` / `DELETE`。
   * `cover_path` 是唯一真相，`coverUrl` 由它拼出来（`buildFileUrl`），所以换端口
   * 时必须同步 `PUBLIC_BASE_URL` —— 这里顺带验证 URL 真的能取到文件。
   */
  it('uploads a cover, serves it, then clears it (FEAT-H03)', async () => {
    const id = await createMap({ name: `Cover ${uniqueCode('p')}` });
    uploadedMapCoverDirs.push(resolveUploadPath(`maps/${id}`));

    const before = await api.get(`/api/maps/${id}`);
    expect(before.body.data.coverPath).toBeNull();
    expect(before.body.data.coverUrl).toBeNull();

    const uploaded = await api
      .post(`/api/maps/${id}/cover`)
      .attach('file', TINY_PNG, 'cover.png');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.code).toBe(ErrorCode.OK);
    expect(typeof uploaded.body.data.coverPath).toBe('string');
    expect(uploaded.body.data.coverPath).toContain(`maps/${id}/`);
    expect(typeof uploaded.body.data.coverUrl).toBe('string');

    // The URL the client gets is actually fetchable.
    const url = new URL(uploaded.body.data.coverUrl as string);
    const served = await api.get(`${url.pathname}${url.search}`);
    expect(served.status).toBe(200);

    const cleared = await api.delete(`/api/maps/${id}/cover`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.coverPath).toBeNull();
    expect(cleared.body.data.coverUrl).toBeNull();
  });

  it('copies the cover reference when a map is duplicated (FEAT-H03 §3.2)', async () => {
    const id = await createMap({ name: `Cover dup ${uniqueCode('p')}` });
    uploadedMapCoverDirs.push(resolveUploadPath(`maps/${id}`));
    const uploaded = await api
      .post(`/api/maps/${id}/cover`)
      .attach('file', TINY_PNG, 'cover.png');
    expect(uploaded.status).toBe(200);

    const dup = await api.post(`/api/maps/${id}/duplicate`);
    expect(dup.status).toBe(200);
    createdMapEntries.push(dup.body.data.id as number);
    expect(dup.body.data.coverPath).toBe(uploaded.body.data.coverPath);
    expect(dup.body.data.coverUrl).toBe(uploaded.body.data.coverUrl);
  });

  it('rejects a non-image cover and leaves cover_path untouched (FEAT-H03 §3.2c)', async () => {
    const id = await createMap({ name: `Cover bad ${uniqueCode('p')}` });
    const res = await api
      .post(`/api/maps/${id}/cover`)
      .attach('file', Buffer.from('definitely not an image'), 'notes.txt');
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.code).toBe(ErrorCode.UNSUPPORTED_MEDIA_TYPE);

    const detail = await api.get(`/api/maps/${id}`);
    expect(detail.body.data.coverPath).toBeNull();
    expect(detail.body.data.coverUrl).toBeNull();
  });

  it('asks for a file when the cover request has none (FEAT-H03)', async () => {
    const id = await createMap({ name: `Cover none ${uniqueCode('p')}` });
    const res = await api.post(`/api/maps/${id}/cover`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const detail = await api.get(`/api/maps/${id}`);
    expect(detail.body.data.coverPath).toBeNull();
  });
});

describe('assets API', () => {
  it('creates an asset and manages its lifecycle (v0.5.2 FEAT-M03: no triggers)', async () => {
    const res = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('candlestick'),
      name: 'Candlestick',
      type: 'item',
      blocking: false,
    });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    createdAssets.push(id);
    // The trigger array — and the free-form meta blob — are gone.
    expect(res.body.data).not.toHaveProperty('triggers');
    expect(res.body.data).not.toHaveProperty('meta');
    // v0.6.1: the look moved to the initial variant; v0.7.6: the footprint left
    // the variant entirely (every placement is one cell now).
    expect(res.body.data).not.toHaveProperty('widthCells');
    expect(res.body.data.variants).toHaveLength(1);
    expect(res.body.data.variants[0]).toMatchObject({ name: '默认' });
    expect(res.body.data.variants[0]).not.toHaveProperty('widthCells');

    const patched = await api.patch(`/api/assets/${id}`).send({ name: 'Candlestick Holder' });
    expect(patched.body.data.name).toBe('Candlestick Holder');

    const usages = await api.get(`/api/assets/${id}/usages`);
    expect(usages.status).toBe(200);
    expect(usages.body.data).toEqual([]);

    const removed = await api.delete(`/api/assets/${id}`);
    expect(removed.status).toBe(200);
  });

  it('v0.5.2 FEAT-M03: the triggers endpoint is gone', async () => {
    const res = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('notriggers'),
      name: 'No Triggers',
      type: 'item',
    });
    const id = res.body.data.id as number;
    createdAssets.push(id);
    const replaced = await api.put(`/api/assets/${id}/triggers`).send([]);
    expect(replaced.status).toBe(404);
  });

  it('v0.5.2 FEAT-M04: a background asset never blocks', async () => {
    const created = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('wallpaper'),
      name: 'Wallpaper',
      type: 'background',
      blocking: true,
    });
    expect(created.status).toBe(200);
    const id = created.body.data.id as number;
    createdAssets.push(id);
    expect(created.body.data.blocking).toBe(false);

    // Flipping an item asset to 背景 makes it non-blocking too.
    const itemAsset = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('lamp'),
      name: 'Lamp',
      type: 'item',
      blocking: true,
    });
    const assetId2 = itemAsset.body.data.id as number;
    createdAssets.push(assetId2);
    expect(itemAsset.body.data.blocking).toBe(true);

    const patched = await api.patch(`/api/assets/${assetId2}`).send({ type: 'background' });
    expect(patched.body.data.blocking).toBe(false);

    // …and an item asset keeps whatever the caller asked for.
    const kept = await api.patch(`/api/assets/${assetId2}`).send({ type: 'item', blocking: false });
    expect(kept.body.data.blocking).toBe(false);
    const dropped = await api.patch(`/api/assets/${assetId2}`).send({ blocking: true });
    expect(dropped.body.data.blocking).toBe(true);
  });

  it('v0.5.3 FEAT-N06: a create can land enabled, and defaults to 停用', async () => {
    const plain = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('inactive'),
      name: 'Inactive Item',
      type: 'item',
    });
    expect(plain.status).toBe(200);
    createdAssets.push(plain.body.data.id as number);
    // OPT-305 stands: no appearance, no `isActive` → 停用.
    expect(plain.body.data.isActive).toBe(false);

    const enabled = await api.post('/api/assets').send({
      themeCode: await fixtureTheme(),
      code: uniqueCode('active'),
      name: 'Active Item',
      type: 'item',
      isActive: true,
    });
    expect(enabled.status).toBe(200);
    createdAssets.push(enabled.body.data.id as number);
    expect(enabled.body.data.isActive).toBe(true);
  });

  it('rejects an invalid asset code', async () => {
    const res = await api
      .post('/api/assets')
      .send({ code: 'bad code', name: 'Bad', themeCode: await fixtureTheme() });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

describe('characters API', () => {
  it('creates a character and manages its lifecycle', async () => {
    const id = await createCharacter({ name: 'Miss Scarlet' });

    const patched = await api.patch(`/api/characters/${id}`).send({ name: 'Scarlet' });
    expect(patched.body.data.name).toBe('Scarlet');

    const usages = await api.get(`/api/characters/${id}/usages`);
    expect(usages.status).toBe(200);
    expect(usages.body.data).toEqual([]);

    const removed = await api.delete(`/api/characters/${id}`);
    expect(removed.status).toBe(200);
  });

  it('rejects an invalid character code', async () => {
    const res = await api
      .post('/api/characters')
      .send({ code: 'bad code', name: 'Bad', themeCode: await fixtureTheme() });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('v0.7.6: 不再回传 avatarMime / meta，旧调用方带 meta 也不报错', async () => {
    const id = await createCharacter({ name: 'Colonel Mustard', meta: { note: 'legacy' } });

    const detail = await api.get(`/api/characters/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).not.toHaveProperty('avatarMime');
    expect(detail.body.data).not.toHaveProperty('meta');

    // 老前端照旧塞 meta：schema 不收这个键，但也**不拒绝**（zod 剥掉未知键）。
    const patched = await api
      .patch(`/api/characters/${id}`)
      .send({ name: 'Mustard', meta: { a: 1 } });
    expect(patched.status).toBe(200);
    expect(patched.body.data.name).toBe('Mustard');
    expect(patched.body.data).not.toHaveProperty('meta');
  });
});

describe('map draft API', () => {
  it('v0.5.8 第八阶段：加载、保存，且后写覆盖（不再有乐观锁）', async () => {
    const mapId = await createMap({ name: `Map ${uniqueCode('p')}`, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: false });

    const initial = await api.get(`/api/maps/${mapId}/map`);
    expect(initial.status).toBe(200);
    expect(initial.body.data.draft.cells).toEqual({});
    // 响应里不再有修订号 —— 它是锁的令牌，锁取消后连同 `draft_updated_at` 一起删了。
    expect(initial.body.data.updatedAt).toBeUndefined();

    const draft = emptyDraft(6);
    draft.cells['0,0'] = { item: { assetId, w: 1, h: 1 } };
    draft.regions = [
      { id: 'rg_a', name: 'Lounge', cells: [[0, 0]], style: { outline: { width: 8 } } },
    ];

    const saved = await api.put(`/api/maps/${mapId}/map`).send({ data: draft });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.cells['0,0'].item.assetId).toBe(assetId);
    expect(saved.body.data.draft.regions).toHaveLength(1);

    const loaded = await api.get(`/api/maps/${mapId}/map`);
    expect(loaded.body.data.draft.regions[0].name).toBe('Lounge');

    // 同一份草稿再写一次（旧客户端可能仍带 updatedAt）—— 照样 200，最后写入的生效。
    const again = await api
      .put(`/api/maps/${mapId}/map`)
      .send({ data: emptyDraft(6), updatedAt: '1999-01-01T00:00:00.000Z' });
    expect(again.status).toBe(200);
    expect(again.body.data.draft.cells).toEqual({});
  });

  it('rejects out-of-bounds cells and unknown asset references', async () => {
    const mapId = await createMap({ name: `Bounds ${uniqueCode('p')}`, gridSize: 4 });

    const outOfBounds = emptyDraft(4);
    outOfBounds.cells['10,0'] = { background: { assetId: await createAsset({ type: 'background' }) } };
    const boundsRes = await api
      .put(`/api/maps/${mapId}/map`)
      .send({ data: outOfBounds });
    expect(boundsRes.status).toBe(400);
    expect(boundsRes.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const unknown = emptyDraft(4);
    unknown.cells['0,0'] = { item: { assetId: 99999999, w: 1, h: 1 } };
    const unknownRes = await api.put(`/api/maps/${mapId}/map`).send({ data: unknown });
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('rejects overlapping regions within one save', async () => {
    const mapId = await createMap({ name: `Overlap ${uniqueCode('p')}`, gridSize: 5 });
    const draft = emptyDraft(5);
    draft.regions = [
      { id: 'rg_a', name: 'A', cells: [[0, 0]] },
      { id: 'rg_b', name: 'B', cells: [[0, 0]] },
    ];
    // 预期失败：不用 saveCanvas（它内部断言 200）。
    const res = await api.put(`/api/maps/${mapId}/map`).send({ data: draft });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCode.REGION_OVERLAP);
  });

  it('manages individual regions and blocks conflicts', async () => {
    const mapId = await createMap({ name: `Regions ${uniqueCode('p')}`, gridSize: 5 });

    const first = await api.post(`/api/maps/${mapId}/regions`).send({
      name: 'Study',
      style: { outline: { width: 8, color: '#3b82f6' } },
      cells: [
        [0, 0],
        [1, 0],
      ],
    });
    expect(first.status).toBe(200);
    const regionId = first.body.data.id as string;
    expect(typeof regionId).toBe('string');

    const conflict = await api
      .post(`/api/maps/${mapId}/regions`)
      .send({ name: 'Clash', cells: [[1, 0]] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(ErrorCode.REGION_OVERLAP);

    const list = await api.get(`/api/maps/${mapId}/regions`);
    expect(list.body.data).toHaveLength(1);
    // v0.7.0: the region's own style rides through the CRUD untouched.
    expect(list.body.data[0].style).toEqual({ outline: { width: 8, color: '#3b82f6' } });

    const patched = await api
      .patch(`/api/maps/${mapId}/regions/${regionId}`)
      .send({ name: 'Library' });
    expect(patched.body.data.name).toBe('Library');

    const removed = await api.delete(`/api/maps/${mapId}/regions/${regionId}`);
    expect(removed.status).toBe(200);
    const after = await api.get(`/api/maps/${mapId}/regions`);
    expect(after.body.data).toHaveLength(0);
  });

  it('returns 404 for a missing map', async () => {
    const res = await api.get('/api/maps/99999999/map');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  // v0.3.8 FEAT-D02: the map style block round-trips through the draft JSON.
  // v0.5.0 FEAT-K14: it no longer carries `linkageColors` — the palette moved to
  // the puzzle, and the strict schema rejects the old key outright.
  it('persists and reloads the map style, and still accepts a style-less draft', async () => {
    const mapId = await createMap({ name: `Style ${uniqueCode('p')}`, gridSize: 6 });

    const draft = {
      ...emptyDraft(6),
      style: {
        cellSize: 150,
        canvasFrame: { width: 8, color: '#112233' },
        regionHighlight: { width: 6, color: '#0B7E74' },
      },
    };
    const saved = await api.put(`/api/maps/${mapId}/map`).send({ data: draft });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.style.cellSize).toBe(150);
    expect(saved.body.data.draft.style.canvasFrame.color).toBe('#112233');

    const reloaded = await api.get(`/api/maps/${mapId}/map`);
    expect(reloaded.body.data.draft.style.regionHighlight.width).toBe(6);

    // A v0.3.7-era payload (no style block) is still accepted.
    const legacy = await api.put(`/api/maps/${mapId}/map`).send({ data: emptyDraft(6) });
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.draft.style).toBeUndefined();
  });

  it('rejects a v2 style palette rather than stripping it (FEAT-K14)', async () => {
    const mapId = await createMap({ name: `StylePalette ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api.put(`/api/maps/${mapId}/map`).send({
      data: {
        ...emptyDraft(6),
        style: {
          cellSize: 150,
          linkageColors: [{ key: 'red', label: '红', color: '#EF9A9A' }],
        },
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('rejects an out-of-range style value', async () => {
    const mapId = await createMap({ name: `StyleRange ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api
      .put(`/api/maps/${mapId}/map`)
      .send({ data: { ...emptyDraft(6), style: { cellSize: 500 } } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  /**
   * docs/v0.5.0.md §8.4: a v2 file must be **rejected with a pointer**, not
   * silently stripped — otherwise the author would believe their participants
   * came along with the canvas.
   */
  it('rejects a v2 map JSON on import and points at the puzzle module (§8.4)', async () => {
    const mapId = await createMap({ name: `Import ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api.post(`/api/maps/${mapId}/map/import`).send({
      data: {
        version: 2,
        gridSize: 6,
        cells: {},
        regions: [],
        characterSlots: [null, null, null, null, null, null],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toContain('characterSlots');
    expect(res.body.message).toContain('谜题');
  });
});

describe('versions API', () => {
  it('publishes, lists, reads and deletes a version', async () => {
    const mapId = await createMap({ name: `Versions ${uniqueCode('p')}`, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: false });

    const draft = emptyDraft(6);
    draft.cells['1,1'] = { item: { assetId, w: 1, h: 1 } };
    await saveCanvas(mapId, draft);

    const published = await api.post(`/api/maps/${mapId}/versions`).send({});
    expect(published.status).toBe(200);
    expect(published.body.data.versionNo).toBe(1);
    expect(published.body.data.itemCount).toBe(1);

    const list = await api.get(`/api/maps/${mapId}/versions`);
    expect(list.body.data).toHaveLength(1);
    // v0.5.8 第三阶段：版本行自己就是 maps 行，面板拿 mapId 拼 URL，所以
    // 它等于版本行 id（合并前是「拥有它的工作条目 id」）。
    expect(list.body.data[0].mapId).toBe(published.body.data.id);

    const detail = await api.get(`/api/maps/${mapId}/versions/1`);
    expect(detail.body.data.data.cells['1,1'].item.assetId).toBe(assetId);
    // The snapshot is a pure canvas — the roster never rides along (v0.5.0).
    expect(detail.body.data.data.characterSlots).toBeUndefined();

    const removed = await api.delete(`/api/maps/${mapId}/versions/1`);
    expect(removed.status).toBe(200);
    const gone = await api.get(`/api/maps/${mapId}/versions/1`);
    expect(gone.status).toBe(404);
  });

  it('rejects publishing when validation fails', async () => {
    const mapId = await createMap({ name: `PubFail ${uniqueCode('p')}`, gridSize: 6 });

    const draft = emptyDraft(6);
    // P3: a region must be a connected blob ((0,0) and (3,3) are not adjacent).
    draft.regions = [
      {
        id: 'rg_split',
        name: '断裂区',
        cells: [
          [0, 0],
          [3, 3],
        ],
      },
    ];
    await saveCanvas(mapId, draft);

    const res = await api.post(`/api/maps/${mapId}/versions`).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.PUBLISH_VALIDATION_FAILED);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(
      (res.body.data as Array<{ rule: string }>).some(
        (violation) => violation.rule === 'region_connected',
      ),
    ).toBe(true);
  });

  // OPT-904 (docs/v0.3.4.md §4.1): a blocking asset IS allowed on the
  // item layer — the v0.3.1 `object_can_stand` rule was removed.
  it('OPT-904: publishes a blocking asset placed on the item layer', async () => {
    const mapId = await createMap({ name: `NoStand ${uniqueCode('p')}`, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: true });

    const draft = emptyDraft(6);
    draft.cells['2,2'] = { item: { assetId, w: 2, h: 2 } };
    const saved = await saveCanvas(mapId, draft);
    expect(saved.status).toBe(200);

    const res = await api.post(`/api/maps/${mapId}/versions`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.versionNo).toBe(1);
  });

  /**
   * @deprecated v0.5.0 §15 Q9 — superseded by `/fork`. No UI reaches it, but a
   * historical caller still restores a version into the working draft.
   */
  it('restores a version into the working draft via the deprecated route (Q9)', async () => {
    const mapId = await createMap({ name: `Restore ${uniqueCode('p')}`, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: false });

    const draft = emptyDraft(6);
    draft.cells['1,1'] = { item: { assetId, w: 1, h: 1 } };
    await saveCanvas(mapId, draft);
    await publish(mapId);

    await saveCanvas(mapId, emptyDraft(6));
    const restored = await api.post(`/api/maps/${mapId}/versions/1/draft`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.draft.cells['1,1'].item.assetId).toBe(assetId);
  });
});

/**
 * SPEC-K11 / Q3 = B (docs/v0.5.0.md §7.3) — 「编辑此版本」 opens a version for
 * editing as a **new work entry in the same blood lineage**. `map_versions` is
 * never written, and the lineage keeps counting so the next publish is `v3`,
 * not a restarted `v1`.
 */
describe('version fork (SPEC-K11 / Q3 = B)', () => {
  it('adds a work entry in the same lineage without touching map_versions', async () => {
    const name = `Fork ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: false });
    const draft = emptyDraft(6);
    draft.cells['2,2'] = { item: { assetId, w: 1, h: 1 } };
    await saveCanvas(mapId, draft);
    await publish(mapId);
    await publish(mapId);

    const before = await api.get(`/api/maps/${mapId}/versions/2`);
    const forked = await api.post(`/api/maps/${mapId}/versions/2/fork`);
    expect(forked.status).toBe(200);
    const forkedId = forked.body.data.id as number;
    createdMapEntries.push(forkedId);

    // The published snapshot is untouched: same timestamp, same payload.
    const after = await api.get(`/api/maps/${mapId}/versions/2`);
    expect(after.body.data.publishedAt).toBe(before.body.data.publishedAt);
    expect(after.body.data.data.cells['2,2'].item.assetId).toBe(assetId);

    // The fork is a *draft* entry seeded from v2, sharing the original's root.
    const list = await api.get(`/api/maps?keyword=${encodeURIComponent(name)}`);
    const rows = list.body.data.list as Array<{
      kind: 'draft' | 'version';
      rootId: number;
      mapId: number;
      versionNo: number | null;
      currentVersionNo: number | null;
      versionCount: number;
    }>;
    const original = rows.find((row) => row.mapId === mapId && row.kind === 'draft');
    const forkEntry = rows.find((row) => row.mapId === forkedId && row.kind === 'draft');
    expect(forkEntry).toBeDefined();
    expect(forkEntry?.rootId).toBe(original?.rootId);
    expect(forkEntry?.currentVersionNo).toBe(2);
    expect(forkEntry?.versionCount).toBe(2);

    const forkedDraft = await api.get(`/api/maps/${forkedId}/map`);
    expect(forkedDraft.body.data.draft.cells['2,2'].item.assetId).toBe(assetId);
  });

  it('continues the lineage numbering after a fork (v3, not v1)', async () => {
    const name = `Lineage ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    await publish(mapId);
    await publish(mapId);

    const forked = await api.post(`/api/maps/${mapId}/versions/2/fork`);
    const forkedId = forked.body.data.id as number;
    createdMapEntries.push(forkedId);

    const next = await api.post(`/api/maps/${forkedId}/versions`).send({});
    expect(next.status).toBe(200);
    expect(next.body.data.versionNo).toBe(3);

    // The lineage panel spans both rows; 合并后每条的 mapId 就是它自己那行。
    const lineage = await api.get(`/api/maps/${forkedId}/versions`);
    expect(lineage.status).toBe(200);
    expect(lineage.body.data.map((entry: { versionNo: number }) => entry.versionNo)).toEqual([3, 2, 1]);
    expect(
      lineage.body.data.every(
        (entry: { mapId: number; id: number }) => entry.mapId === entry.id,
      ),
    ).toBe(true);
  });

  it('404s when the version to fork does not exist', async () => {
    const mapId = await createMap({ name: `NoFork ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api.post(`/api/maps/${mapId}/versions/99/fork`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('v0.5.8 §13: names the forked draft after its source version', async () => {
    const name = `ForkName ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    await publish(mapId);

    const forked = await api.post(`/api/maps/${mapId}/versions/1/fork`);
    expect(forked.status).toBe(200);
    const forkedId = forked.body.data.id as number;
    createdMapEntries.push(forkedId);
    expect(forked.body.data.name).toBe(`${name} (自 v1)`);

    // 再 fork 同一版本 → uniqueCopyName 兜底（血统内可能有多条草稿，不能撞名）。
    const again = await api.post(`/api/maps/${mapId}/versions/1/fork`);
    expect(again.status).toBe(200);
    createdMapEntries.push(again.body.data.id as number);
    expect(again.body.data.name).toBe(`${name} (自 v1) 副本`);
  });

  it('v0.5.8 §13: fork carries the editor canvas (save-time fork)', async () => {
    const name = `ForkData ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    const assetId = await createAsset({ type: 'item', blocking: false });
    const draft = emptyDraft(6);
    draft.cells['1,1'] = { item: { assetId, w: 1, h: 1 } };
    await saveCanvas(mapId, draft);
    await publish(mapId);

    // 「以此为底稿新建」进编辑器后又改了一格（还没保存）—— 保存时这一帧
    // 画布随 fork 一起落库；不传 data 则仍是快照 data（上面的老用例）。
    const edited = emptyDraft(6);
    edited.cells['3,3'] = { item: { assetId, w: 1, h: 1 } };
    const forked = await api.post(`/api/maps/${mapId}/versions/1/fork`).send({ data: edited });
    expect(forked.status).toBe(200);
    const forkedId = forked.body.data.id as number;
    createdMapEntries.push(forkedId);

    const forkedDraft = await api.get(`/api/maps/${forkedId}/map`);
    expect(forkedDraft.body.data.draft.cells['3,3'].item.assetId).toBe(assetId);
    // 旧草稿的 1,1 不在新行里 —— 带的就是发送那一刻的画布，不是合并。
    expect(forkedDraft.body.data.draft.cells['1,1']).toBeUndefined();

    // 版本快照本身不动（不可变）。
    const snapshot = await api.get(`/api/maps/${mapId}/versions/1`);
    expect(snapshot.body.data.data.cells['1,1'].item.assetId).toBe(assetId);
  });
});

/**
 * FEAT-K01 (docs/v0.5.0.md §2) — the puzzle module. It replaces the old works
 * table (the list keeps the same 5 columns) and owns the roster + palette and
 * the reference to one **published** map version.
 */
describe('puzzles API (FEAT-K01)', () => {
  it('creates a puzzle bound to a published version and reads it back', async () => {
    const { mapId, versionNo, assetId } = await publishedMapWithItem(`Pz ${uniqueCode('p')}`);
    const id = await createPuzzle({
      name: '谜题一',
      description: '第一题',
      mapId: mapId,
      mapVersionNo: versionNo,
    });

    const list = await api.get('/api/puzzles');
    expect(list.status).toBe(200);
    const row = (
      list.body.data.list as Array<{
        id: number;
        kind: string;
        versionNo: number | null;
        mapVersionNo: number;
        mapId: number;
        mapName: string;
        deployed: boolean;
      }>
    ).find((entry) => entry.id === id);
    expect(row?.kind).toBe('draft');
    expect(row?.versionNo).toBeNull();
    expect(row?.mapVersionNo).toBe(versionNo);
    expect(row?.mapId).toBe(mapId);
    expect(row?.mapName).toContain('Pz');
    expect(row?.deployed).toBe(false);

    const detail = await api.get(`/api/puzzles/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.name).toBe('谜题一');
    expect(detail.body.data.description).toBe('第一题');
    expect(detail.body.data.gridSize).toBe(6);
    // v2：来源信息 + 一份画布副本（§5.3）。
    expect(detail.body.data.data.version).toBe(2);
    expect(detail.body.data.data.map.mapId).toBe(mapId);
    expect(detail.body.data.data.map.versionNo).toBe(versionNo);
    expect(detail.body.data.data.map.mapName).toContain('Pz');
    expect(detail.body.data.data.map.data.gridSize).toBe(6);
    expect(detail.body.data.data.map.data.cells['0,0'].item.assetId).toBe(assetId);
    expect(detail.body.data.data.characterSlots).toHaveLength(6);
    expect(
      detail.body.data.data.characterSlots.every((slot: unknown) => slot === null),
    ).toBe(true);
    // The palette is seeded from the version (here: the shipped red / blue pair).
    expect(detail.body.data.data.linkageColors.length).toBeGreaterThanOrEqual(2);

    // 画布只在自己的 `map` 块里，谜题 payload 顶层没有第二份。
    expect(detail.body.data.data.cells).toBeUndefined();
  });

  it('rejects a puzzle whose map version was never published', async () => {
    const mapId = await createMap({ name: `NoVer ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api
      .post('/api/puzzles')
      .send({ name: '无版本', code: uniqueSlug('pc'), mapId: mapId, mapVersionNo: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toContain('地图版本');
  });

  it('rejects a puzzle with a blank name', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`BadName ${uniqueCode('p')}`);
    const res = await api
      .post('/api/puzzles')
      .send({ name: '   ', code: uniqueSlug('pc'), mapId: mapId, mapVersionNo: versionNo });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  /** §5.3: 编辑器渲染的画布来自谜题自己的副本，且 style 里没有调色板。 */
  it('serves the copied canvas read-only and strips the palette', async () => {
    const { mapId, assetId, versionNo } = await publishedMapWithItem(`Ctx ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '只读画布', mapId: mapId, mapVersionNo: versionNo });

    const res = await api.get(`/api/puzzles/${id}/map`);
    expect(res.status).toBe(200);
    expect(res.body.data.mapId).toBe(mapId);
    expect(res.body.data.versionNo).toBe(versionNo);
    expect(res.body.data.gridSize).toBe(6);
    expect(res.body.data.cells['0,0'].item.assetId).toBe(assetId);
    expect(res.body.data.style.linkageColors).toBeUndefined();
  });

  it('saves the draft with optimistic concurrency and rejects a stale write', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`Save ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '保存', mapId: mapId, mapVersionNo: versionNo });

    const initial = await api.get(`/api/puzzles/${id}`);
    const updatedAt = initial.body.data.updatedAt as string;
    const draft = initial.body.data.data;
    draft.description = '改一下';

    const saved = await api.put(`/api/puzzles/${id}`).send({ data: draft, updatedAt });
    expect(saved.status).toBe(200);
    expect(saved.body.data.data.description).toBe('改一下');

    const stale = await api.put(`/api/puzzles/${id}`).send({ data: draft, updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe(ErrorCode.DRAFT_CONFLICT);
  });

  it('reads metadata back through the list after a save', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`Mirror ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '旧名', mapId: mapId, mapVersionNo: versionNo });

    const initial = await api.get(`/api/puzzles/${id}`);
    const draft = initial.body.data.data;
    draft.name = '改名后';
    draft.description = '描述也改了';
    const saved = await api.put(`/api/puzzles/${id}`).send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(saved.status).toBe(200);

    // The row mirrors the JSON, so the list and the export never drift apart.
    const list = await api.get('/api/puzzles');
    const row = (
      list.body.data.list as Array<{ id: number; name: string; description: string | null }>
    ).find((entry) => entry.id === id);
    expect(row?.name).toBe('改名后');
    expect(row?.description).toBe('描述也改了');
  });

  /** 底图快照是服务端的 —— payload 既不能换图，也不能改画布。 */
  it('forces the stored map snapshot back on save', async () => {
    const a = await publishedMapWithItem(`RefA ${uniqueCode('p')}`);
    const b = await publishedMapWithItem(`RefB ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '引用', mapId: a.mapId, mapVersionNo: a.versionNo });

    const initial = await api.get(`/api/puzzles/${id}`);
    const draft = initial.body.data.data;
    draft.map = {
      mapId: b.mapId,
      versionNo: b.versionNo,
      mapName: '偷换的底图',
      data: { ...draft.map.data, cells: {} },
    };
    const saved = await api
      .put(`/api/puzzles/${id}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(saved.status).toBe(200);
    expect(saved.body.data.data.map.mapId).toBe(a.mapId);
    expect(saved.body.data.data.map.versionNo).toBe(a.versionNo);
    // 画布也退回存量那份（B 是空画布，A 有一个资源）。
    expect(saved.body.data.data.map.data.cells['0,0'].item).toBeDefined();
  });

  /** §5.2: `asset` / `region` targets are checked against the referenced canvas. */
  it('rejects an asset linkage whose target is not on the referenced canvas', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`BadRef ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '坏引用', mapId: mapId, mapVersionNo: versionNo });
    const characterId = await createCharacter();

    const initial = await api.get(`/api/puzzles/${id}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = {
      characterId,
      linkages: [{ type: 'asset', id: 99999999, scope: 'all', effect: 'highlight', color: 'red' }],
    };
    const res = await api
      .put(`/api/puzzles/${id}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect((res.body.data as string[]).some((message) => message.includes('不在地图中'))).toBe(true);
  });

  /** §5.2: the self-consistent half — a `cell` target must be inside the board. */
  it('rejects a linkage target outside the canvas', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`CellRef ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '越界', mapId: mapId, mapVersionNo: versionNo });
    const characterId = await createCharacter();

    const initial = await api.get(`/api/puzzles/${id}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = {
      characterId,
      linkages: [{ type: 'cell', cells: [[9, 9]], effect: 'glow', color: 'blue' }],
    };
    const res = await api
      .put(`/api/puzzles/${id}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('renames and re-describes, mirroring into the exported JSON', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`Rename ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '旧名', mapId: mapId, mapVersionNo: versionNo });

    const res = await api.patch(`/api/puzzles/${id}`).send({ name: '新名', description: '新描述' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('新名');
    expect(res.body.data.description).toBe('新描述');
    expect(res.body.data.data.name).toBe('新名');
    expect(res.body.data.data.description).toBe('新描述');
  });

  /**
   * v0.8.5 §7（docs/v0.8.5 §7.md §3）：编码在主题内不重，且写整条血统。
   *
   * 「同血统共用」这一条是这次最容易写错的地方：版本行是快照，编码却不是版本的
   * 属性 —— 只写草稿行的话，部署那条版本时预填的还是旧编码。
   */
  it('编码在主题内不重；改编码写整条血统', async () => {
    const { draftId, versionId, code } = await deployablePuzzle(`Code ${uniqueCode('p')}`);
    // 版本行继承草稿的编码（发布时抄过去）。
    expect((await api.get(`/api/puzzles/${draftId}`)).body.data.code).toBe(code);
    expect((await api.get(`/api/puzzles/${versionId}`)).body.data.code).toBe(code);

    // 同一个主题里再要一个同码谜题 → 409，而不是静默落一条重码。
    const { mapId, versionNo } = await publishedMapWithItem(`Clash ${uniqueCode('p')}`);
    const clash = await api
      .post('/api/puzzles')
      .send({ name: '撞码', code, mapId, mapVersionNo: versionNo });
    expect(clash.status).toBe(409);
    expect(clash.body.message).toContain('已经被这个主题的另一个谜题用过');

    // 改编码写整条血统：草稿行与版本行都要跟着变，否则部署那条版本时预填的是旧码。
    const renamed = uniqueSlug('pc2');
    expect((await api.patch(`/api/puzzles/${draftId}`).send({ code: renamed })).status).toBe(200);
    expect((await api.get(`/api/puzzles/${draftId}`)).body.data.code).toBe(renamed);
    expect((await api.get(`/api/puzzles/${versionId}`)).body.data.code).toBe(renamed);
  });

  /** v0.8.5 §7：复制出来的是一条独立的谜题，编码不能原样带走。 */
  it('复制谜题时换一个没被占用的编码', async () => {
    const { draftId, code } = await deployablePuzzle(`DupCode ${uniqueCode('p')}`);

    const copied = await api.post(`/api/puzzles/${draftId}/duplicate`);
    expect(copied.status).toBe(200);
    createdPuzzles.push(copied.body.data.id);
    expect(copied.body.data.code).toBe(`${code}-2`);
  });

  it('duplicates a puzzle under a unique copy name', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`Dup ${uniqueCode('p')}`);
    const id = await createPuzzle({ name: '原件', mapId: mapId, mapVersionNo: versionNo });

    const first = await api.post(`/api/puzzles/${id}/duplicate`);
    expect(first.status).toBe(200);
    createdPuzzles.push(first.body.data.id);
    expect(first.body.data.name).toBe('原件 副本');

    const second = await api.post(`/api/puzzles/${id}/duplicate`);
    createdPuzzles.push(second.body.data.id);
    expect(second.body.data.name).toBe('原件 副本 2');
  });

  it('deletes a puzzle', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`Del ${uniqueCode('p')}`);
    const created = await api
      .post('/api/puzzles')
      .send({ name: '待删', code: uniqueSlug('pc'), mapId: mapId, mapVersionNo: versionNo });
    const id = created.body.data.id as number;

    const removed = await api.delete(`/api/puzzles/${id}`);
    expect(removed.status).toBe(200);
    const missing = await api.get(`/api/puzzles/${id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('404s for an unknown puzzle canvas', async () => {
    const res = await api.get('/api/puzzles/99999999/map');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  /**
   * v0.8.6（docs/v0.8.6.md §4）：禁止符号是一张**上传图**（不是资源引用），
   * 主题还可以配一份「新建谜题缺省」。四件事一起钉：
   *
   * ① 谜题上传 → `{ path, url }`，随草稿保存后读回一致；
   * ② 主题上传 / 删除 → `themes.data.mark`；
   * ③ 新建谜题拷贝主题缺省，之后主题换图不追溯；
   * ④ 版本行 id 也能上传（fork 态只写文件、不写库）。
   */
  describe('标记的上传与主题缺省 (v0.8.6 §4)', () => {
    const THEME_CODE = 'test-mark';

    afterAll(async () => {
      const { purgeTheme } = await import('./purge');
      await purgeTheme(THEME_CODE);
    });

    /** 主题按编码寻址（§19）；上传目录按主键分，收尾要它。 */
    async function theme(): Promise<{ code: string; id: number }> {
      const created = await api
        .post('/api/themes')
        .send({ code: THEME_CODE, name: '标记测试主题' });
      if (created.status !== 200 && created.status !== 409) {
        throw new Error(`标记测试主题建不出来：${created.status}`);
      }
      const row = (await db('themes').where({ code: THEME_CODE }).first('id')) as
        | { id: string | number }
        | undefined;
      if (!row) throw new Error('标记测试主题读不出来');
      return { code: THEME_CODE, id: Number(row.id) };
    }

    it('谜题上传：返回 path/url，保存草稿再读回一致；非图片 415、无文件 400', async () => {
      const { draftId } = await puzzleWithVersion(`Sym ${uniqueCode('p')}`);
      uploadedPuzzleSymbolDirs.push(resolveUploadPath(`puzzles/${draftId}`));

      const none = await api.post(`/api/puzzles/${draftId}/mark`);
      expect(none.status).toBe(400);
      expect(none.body.code).toBe(ErrorCode.VALIDATION_FAILED);

      const bad = await api
        .post(`/api/puzzles/${draftId}/mark`)
        .attach('file', Buffer.from('definitely not an image'), 'notes.txt');
      expect(bad.status).toBe(415);
      expect(bad.body.code).toBe(ErrorCode.UNSUPPORTED_MEDIA_TYPE);

      const uploaded = await api
        .post(`/api/puzzles/${draftId}/mark`)
        .attach('file', TINY_PNG, 'symbol.png');
      expect(uploaded.status).toBe(200);
      expect(uploaded.body.code).toBe(ErrorCode.OK);
      const path = uploaded.body.data.path as string;
      // 只写一张缩放后的 webp，没有原图 / 缩略图两份。
      expect(path).toMatch(new RegExp(`^puzzles/${draftId}/mark/[0-9a-f-]+\\.webp$`));
      expect(typeof uploaded.body.data.url).toBe('string');
      // 回执的 url 真能取到文件。
      expect((await api.get(new URL(uploaded.body.data.url as string).pathname)).status).toBe(200);

      const initial = await api.get(`/api/puzzles/${draftId}`);
      const saved = await api.put(`/api/puzzles/${draftId}`).send({
        data: { ...initial.body.data.data, mark: { path } },
        updatedAt: initial.body.data.updatedAt,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.data.mark).toEqual({ path });
      // 再读一次：值来自 JSONB，不是内存里的那份。
      expect((await api.get(`/api/puzzles/${draftId}`)).body.data.data.mark).toEqual({
        path,
      });
    });

    it('版本行 id 也能上传（fork 态只写文件、不写库），未知谜题 404', async () => {
      const { versionId } = await deployablePuzzle(`ForkSym ${uniqueCode('p')}`);
      uploadedPuzzleSymbolDirs.push(resolveUploadPath(`puzzles/${versionId}`));

      const uploaded = await api
        .post(`/api/puzzles/${versionId}/mark`)
        .attach('file', TINY_PNG, 'symbol.png');
      expect(uploaded.status).toBe(200);
      expect(uploaded.body.data.path).toContain(`puzzles/${versionId}/mark/`);
      expect((await api.get(new URL(uploaded.body.data.url as string).pathname)).status).toBe(200);
      // 只写文件：版本行的 JSON 没被这个端点动过。
      expect((await api.get(`/api/puzzles/${versionId}`)).body.data.data.mark).toBeUndefined();

      const missing = await api
        .post('/api/puzzles/99999999/mark')
        .attach('file', TINY_PNG, 'symbol.png');
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
    });

    it('主题上传 → 读回；DELETE 后消失', async () => {
      const created = await theme();
      uploadedThemeSymbolDirs.push(resolveUploadPath(`themes/${created.id}`));

      const uploaded = await api
        .post(`/api/themes/${created.code}/mark`)
        .attach('file', TINY_PNG, 'symbol.png');
      expect(uploaded.status).toBe(200);
      expect(uploaded.body.code).toBe(ErrorCode.OK);
      const path = uploaded.body.data.data.mark.path as string;
      expect(path).toMatch(new RegExp(`^themes/${created.id}/mark/[0-9a-f-]+\\.webp$`));
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.mark).toEqual({
        path,
      });

      const cleared = await api.delete(`/api/themes/${created.code}/mark`);
      expect(cleared.status).toBe(200);
      // DELETE 是**删键**，不是写成 null。
      expect(cleared.body.data.data.mark).toBeUndefined();
      expect(
        (await api.get(`/api/themes/${created.code}`)).body.data.data.mark,
      ).toBeUndefined();
    });

    /**
     * v0.8.7 §4：新建谜题**不再拷贝**主题的禁止符号 —— 不配就跟随，读取侧解析。
     * 这一条钉的是「库里的草稿保持干净」，以及「主题换图对跟随的谜题立刻生效」。
     */
    it('新建谜题不拷贝主题的禁止符号（跟随），主题换图后仍没有自己的那份', async () => {
      const created = await theme();
      uploadedThemeSymbolDirs.push(resolveUploadPath(`themes/${created.id}`));

      const first = await api
        .post(`/api/themes/${created.code}/mark`)
        .attach('file', TINY_PNG, 'symbol.png');
      expect(first.status).toBe(200);
      const firstPath = first.body.data.data.mark.path as string;

      const mapId = await createMap({
        name: `Sym map ${uniqueCode('p')}`,
        gridSize: 6,
        themeCode: created.code,
      });
      const versionNo = await publish(mapId);
      const inheritedId = await createPuzzle({
        name: '跟随主题',
        mapId,
        mapVersionNo: versionNo,
      });
      // 草稿里没有这个键：跟随是读取时的事，不是建题时的一次拷贝。
      expect(
        (await api.get(`/api/puzzles/${inheritedId}`)).body.data.data.mark,
      ).toBeUndefined();
      // 主题那一份仍然在 —— 解析的兜底来自它。
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.mark).toEqual({
        path: firstPath,
      });

      // 主题换一张图：跟随的谜题依旧没有自己的那份，所以读到的就是新的。
      const second = await api
        .post(`/api/themes/${created.code}/mark`)
        .attach('file', TINY_PNG, 'symbol.png');
      expect(second.status).toBe(200);
      const secondPath = second.body.data.data.mark.path as string;
      expect(secondPath).not.toBe(firstPath);
      expect(
        (await api.get(`/api/puzzles/${inheritedId}`)).body.data.data.mark,
      ).toBeUndefined();
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.mark).toEqual({
        path: secondPath,
      });

      // 作者显式给这一题传一张 —— 那才是「自己的」，与主题无关。
      const own = { path: secondPath };
      const initial = await api.get(`/api/puzzles/${inheritedId}`);
      const saved = await api.put(`/api/puzzles/${inheritedId}`).send({
        data: { ...initial.body.data.data, mark: own },
        updatedAt: initial.body.data.updatedAt,
      });
      expect(saved.status).toBe(200);
      expect((await api.get(`/api/puzzles/${inheritedId}`)).body.data.data.mark).toEqual(
        own,
      );
    });
  });

  /**
   * v0.9.3 §3；v0.9.6 起**圈图并进 `ring`**（与长按计时环共用一张），`checkStyle`
   * 只剩两档颜色。
   *
   * 三件事一起钉：
   *
   * ① PATCH 只改给的那一档，另一档原样保留；
   * ② 主题还没有 `checkStyle` 时，改一个颜色会把两档都补齐；
   * ③ 空 body / 非法颜色都是 400。
   */
  describe('提交校验的两档颜色 (v0.9.3 / v0.9.6)', () => {
    const THEME_CODE = 'test-check-style';

    afterAll(async () => {
      const { purgeTheme } = await import('./purge');
      await purgeTheme(THEME_CODE);
    });

    async function theme(): Promise<{ code: string; id: number }> {
      const created = await api
        .post('/api/themes')
        .send({ code: THEME_CODE, name: '校验样式测试主题' });
      if (created.status !== 200 && created.status !== 409) {
        throw new Error(`校验样式测试主题建不出来：${created.status}`);
      }
      const row = (await db('themes').where({ code: THEME_CODE }).first('id')) as
        | { id: string | number }
        | undefined;
      if (!row) throw new Error('校验样式测试主题读不出来');
      return { code: THEME_CODE, id: Number(row.id) };
    }

    it('改一个颜色只动那一档，另一档按默认补齐', async () => {
      const created = await theme();

      const empty = await api.patch(`/api/themes/${created.code}/check-style`).send({});
      expect(empty.status).toBe(400);
      expect(empty.body.code).toBe(ErrorCode.VALIDATION_FAILED);

      const bad = await api
        .patch(`/api/themes/${created.code}/check-style`)
        .send({ passColor: 'green' });
      expect(bad.status).toBe(400);

      const one = await api
        .patch(`/api/themes/${created.code}/check-style`)
        .send({ passColor: '#123456' });
      expect(one.status).toBe(200);
      expect(one.body.data.data.checkStyle).toEqual({
        passColor: '#123456',
        failColor: '#DC2626',
      });

      // 再改另一档：第一档不能被冲掉。
      const two = await api
        .patch(`/api/themes/${created.code}/check-style`)
        .send({ failColor: '#654321' });
      expect(two.status).toBe(200);
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.checkStyle).toEqual({
        passColor: '#123456',
        failColor: '#654321',
      });
    });

    /**
     * v0.9.6：圈图不再是校验自己的那一份 —— 它并进了主题的 `ring`。
     * 所以这里钉的是**两者互不干扰**：改颜色不碰 `ring`，换圆环也不碰颜色。
     */
    it('换圆环不动两档颜色，改颜色也不碰圆环', async () => {
      const created = await theme();
      uploadedThemeSymbolDirs.push(resolveUploadPath(`themes/${created.id}`));

      await api.patch(`/api/themes/${created.code}/check-style`).send({ passColor: '#111111' });

      const none = await api.post(`/api/themes/${created.code}/ring`);
      expect(none.status).toBe(400);

      const uploaded = await api
        .post(`/api/themes/${created.code}/ring`)
        .attach('file', TINY_PNG, 'ring.png');
      expect(uploaded.status).toBe(200);
      const path = uploaded.body.data.data.ring.image.path as string;
      expect(path).toMatch(new RegExp(`^themes/${created.id}/ring/[0-9a-f-]+\\.webp$`));
      // 作者挑的通过色没被这次上传改掉。
      expect(uploaded.body.data.data.checkStyle.passColor).toBe('#111111');

      // 再改颜色：圆环原样留着。
      const patch = await api
        .patch(`/api/themes/${created.code}/check-style`)
        .send({ failColor: '#222222' });
      expect(patch.status).toBe(200);
      expect(patch.body.data.data.ring.image.path).toBe(path);

      const cleared = await api.delete(`/api/themes/${created.code}/ring`);
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.data.ring).toBeUndefined();
      expect(cleared.body.data.data.checkStyle.passColor).toBe('#111111');
    });
  });

  /**
   * v0.8.7 §7：「清除 / 撤回 / 提交」三枚按钮的图标，主题与谜题两级配置，与禁止符号
   * 同一条路（只写一张 webp、读取侧兜底）。这里钉的是**接口契约**：
   *
   * ① 主题三枚逐枚写、互不干扰，删掉一枚另两枚还在，三枚都删干净则整个键消失；
   * ② 谜题只写文件（`{ path, url }`），草稿里要保存才落地；
   * ③ `:icon` 是枚举 —— 拼错是 400，不是「传上去了但哪儿也没变」。
   */
  describe('工具按钮图标的上传 (v0.8.7 §7)', () => {
    const THEME_CODE = 'test-tool-icons';

    afterAll(async () => {
      const { purgeTheme } = await import('./purge');
      await purgeTheme(THEME_CODE);
    });

    async function theme(): Promise<{ code: string; id: number }> {
      const created = await api
        .post('/api/themes')
        .send({ code: THEME_CODE, name: '工具图标测试主题' });
      if (created.status !== 200 && created.status !== 409) {
        throw new Error(`工具图标测试主题建不出来：${created.status}`);
      }
      const row = (await db('themes').where({ code: THEME_CODE }).first('id')) as
        | { id: string | number }
        | undefined;
      if (!row) throw new Error('工具图标测试主题读不出来');
      return { code: THEME_CODE, id: Number(row.id) };
    }

    it('主题三枚各写各的，删一枚另两枚还在，删空则整个键消失', async () => {
      const created = await theme();
      uploadedThemeSymbolDirs.push(resolveUploadPath(`themes/${created.id}`));

      const icons = ['clear', 'undo', 'submit'] as const;
      const paths: Record<string, string> = {};
      for (const icon of icons) {
        const uploaded = await api
          .post(`/api/themes/${created.code}/tool-icons/${icon}`)
          .attach('file', TINY_PNG, `${icon}.png`);
        expect(uploaded.status).toBe(200);
        const path = uploaded.body.data.data.toolIcons[icon].path as string;
        expect(path).toMatch(
          new RegExp(`^themes/${created.id}/tool-icons/${icon}/[0-9a-f-]+\\.webp$`),
        );
        paths[icon] = path;
      }
      // 回执是整份主题：三枚都在，而且上传一枚没把别的枚冲掉。
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.toolIcons).toEqual({
        clear: { path: paths.clear },
        undo: { path: paths.undo },
        submit: { path: paths.submit },
      });

      const one = await api.delete(`/api/themes/${created.code}/tool-icons/undo`);
      expect(one.status).toBe(200);
      expect(one.body.data.data.toolIcons).toEqual({
        clear: { path: paths.clear },
        submit: { path: paths.submit },
      });

      await api.delete(`/api/themes/${created.code}/tool-icons/clear`);
      const last = await api.delete(`/api/themes/${created.code}/tool-icons/submit`);
      expect(last.status).toBe(200);
      // 三枚都空 → 删键，与「从没配过」同一个写法。
      expect(last.body.data.data.toolIcons).toBeUndefined();
      expect((await api.get(`/api/themes/${created.code}`)).body.data.data.toolIcons).toBeUndefined();
    });

    it('谜题上传只写文件，保存草稿后才进 JSONB', async () => {
      const { draftId } = await puzzleWithVersion(`Icon ${uniqueCode('p')}`);
      uploadedPuzzleSymbolDirs.push(resolveUploadPath(`puzzles/${draftId}`));

      const uploaded = await api
        .post(`/api/puzzles/${draftId}/tool-icons/clear`)
        .attach('file', TINY_PNG, 'clear.png');
      expect(uploaded.status).toBe(200);
      const path = uploaded.body.data.path as string;
      expect(path).toMatch(new RegExp(`^puzzles/${draftId}/tool-icons/clear/[0-9a-f-]+\\.webp$`));
      expect((await api.get(new URL(uploaded.body.data.url as string).pathname)).status).toBe(200);
      // 只写文件：草稿的 JSON 没被这个端点动过。
      expect((await api.get(`/api/puzzles/${draftId}`)).body.data.data.toolIcons).toBeUndefined();

      const initial = await api.get(`/api/puzzles/${draftId}`);
      const saved = await api.put(`/api/puzzles/${draftId}`).send({
        data: { ...initial.body.data.data, toolIcons: { clear: { path } } },
        updatedAt: initial.body.data.updatedAt,
      });
      expect(saved.status).toBe(200);
      expect((await api.get(`/api/puzzles/${draftId}`)).body.data.data.toolIcons).toEqual({
        clear: { path },
      });
    });

    it('拼错的 :icon 是 400；没有文件是 400；未知谜题 404', async () => {
      const created = await theme();
      uploadedThemeSymbolDirs.push(resolveUploadPath(`themes/${created.id}`));

      const badName = await api
        .post(`/api/themes/${created.code}/tool-icons/erase`)
        .attach('file', TINY_PNG, 'erase.png');
      expect(badName.status).toBe(400);
      expect(badName.body.code).toBe(ErrorCode.VALIDATION_FAILED);

      const none = await api.post(`/api/themes/${created.code}/tool-icons/clear`);
      expect(none.status).toBe(400);
      expect(none.body.code).toBe(ErrorCode.VALIDATION_FAILED);

      const missing = await api
        .post('/api/puzzles/99999999/tool-icons/clear')
        .attach('file', TINY_PNG, 'clear.png');
      expect(missing.status).toBe(404);
      expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
    });
  });
});

// ---- v0.4.0 FEAT-G02 + v0.5.0 CONS-K16: the unit of deployment is a puzzle ----
describe('games API (FEAT-G02 + CONS-K16)', () => {
  it('deploys a puzzle and lists it on the games home page', async () => {
    const { versionId } = await deployablePuzzle(`Game ${uniqueCode('p')}`);
    const slug = uniqueSlug('mystery-castle');

    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', slug, difficulty: 4 });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.puzzleId).toBe(versionId);
    expect(deploy.body.data.name).toBe('神秘古堡');
    expect(deploy.body.data.difficulty).toBe(4);
    expect(deploy.body.data.gridSize).toBe(6);
    expect(deploy.body.data.coverUrl).toBeNull();
    expect(deploy.body.data.participantCount).toBe(1);
    // OPT-W04: an all-Chinese name derives no path, so the author typed one.
    expect(deploy.body.data.slug).toBe(slug);

    const list = await api.get('/api/games');
    expect(list.status).toBe(200);
    const row = (list.body.data as Array<{ puzzleId: number | null; name: string }>).find(
      (entry) => entry.puzzleId === versionId,
    );
    expect(row?.name).toBe('神秘古堡');

    // FEAT-G02 §5.1: the puzzle table now badges the row as deployed.
    const puzzles = await api.get('/api/puzzles');
    expect(
      (puzzles.body.data.list as Array<{ id: number; deployed: boolean }>).find(
        (entry) => entry.id === versionId,
      )?.deployed,
    ).toBe(true);

    const detail = await api.get(`/api/games/${deploy.body.data.id}`);
    expect(detail.status).toBe(200);
    // §7.3：游戏只引用谜题行，画布与名册直接读它 —— 没有快照拷贝。
    expect(detail.body.data.map.gridSize).toBe(6);
    expect(detail.body.data.puzzle.characterSlots[0]).not.toBeNull();
    expect(detail.body.data.puzzleVersionNo).toBe(1);
    expect(detail.body.data.snapshot).toBeUndefined();
  });

  it('defaults the game name to the puzzle name and the difficulty to medium', async () => {
    const { versionId, puzzleName } = await deployablePuzzle(`Defaulted ${uniqueCode('p')}`);

    const deploy = await api.post(`/api/puzzles/${versionId}/games`).send({});
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.name).toBe(puzzleName);
    expect(deploy.body.data.difficulty).toBe(3);
  });

  /**
   * v0.8.5 §7.4：请求里没有路径时，兜底**先看谜题编码**（`puzzle-{code}`），
   * 没有编码的存量谜题才退回按名称推导 —— 中文名推不出东西。
   */
  it('不给访问路径时用谜题编码派生', async () => {
    const { versionId, code } = await deployablePuzzle(`Coded ${uniqueCode('p')}`);

    const deploy = await api.post(`/api/puzzles/${versionId}/games`).send({});
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.slug).toBe(`puzzle-${code}`);
  });

  it('keeps one game per puzzle — a later deploy overwrites the earlier one', async () => {
    const { versionId } = await deployablePuzzle(`Overwrite ${uniqueCode('p')}`);

    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '第一版', slug: uniqueSlug('first'), difficulty: 2 });
    expect(first.status).toBe(200);

    const second = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '第二版', slug: uniqueSlug('second'), difficulty: 5 });
    expect(second.status).toBe(200);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    // 游戏挂在版本行上，所以摘要里的版本号就是那个版本。
    expect(second.body.data.puzzleVersionNo).toBe(1);

    const list = await api.get('/api/games');
    const rows = (list.body.data as Array<{ id: number; puzzleId: number | null }>).filter(
      (entry) => entry.puzzleId === versionId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(second.body.data.id);
  });

  it('rejects a deploy of a puzzle that does not exist', async () => {
    const res = await api.post('/api/puzzles/99999999/games').send({ name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('rejects an out-of-range difficulty and an empty name', async () => {
    const { versionId } = await deployablePuzzle(`Invalid ${uniqueCode('p')}`);

    // 7 不在内置五档里，也不在任何主题的分级里 —— schema 只拦「1…99 的整数」，
    // 「这一档存不存在」由服务端拿主题核对（见后面「难度分级由主题定义」）。
    const badDifficulty = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ difficulty: 7 });
    expect(badDifficulty.status).toBe(400);

    const emptyName = await api.post(`/api/puzzles/${versionId}/games`).send({ name: '   ' });
    expect(emptyName.status).toBe(400);
  });

  it('404s for an unknown game id', async () => {
    const res = await api.get('/api/games/999999999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('uploads a cover for a deployed game', async () => {
    const { versionId } = await deployablePuzzle(`Cover ${uniqueCode('p')}`);
    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '带封面', slug: uniqueSlug('with-cover') });
    const gameId = deploy.body.data.id as number;

    const uploaded = await api
      .post(`/api/games/${gameId}/cover`)
      .attach('file', TINY_PNG, 'cover.png');
    expect(uploaded.status).toBe(200);
    expect(uploaded.body.data.coverUrl).toBeTruthy();
    uploadedGameCoverDirs.push(resolveUploadPath(`games/${gameId}`));

    const detail = await api.get(`/api/games/${gameId}`);
    expect(detail.body.data.coverUrl).toBeTruthy();
  });
});

// ---- v0.4.1 OPT-W04: the access path (docs/v0.4.1.md §4) ----
describe('games API slug (OPT-W04)', () => {
  /** Short lowercase hex token — survives slugify untouched. */
  function token(): string {
    return Math.random().toString(16).slice(2, 10);
  }

  // v0.8.1：难度不进路径。v0.8.5 §7.4：兜底先看**谜题编码**，没有编码才退回名称。
  it('derives puzzle-{code} when the path is left untouched', async () => {
    const hex = token();
    const { versionId, code } = await deployablePuzzle(`Flower Garden ${hex}`);

    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: `Flower Garden ${hex}`, difficulty: 1 });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.slug).toBe(`puzzle-${code}`);
    expect(deploy.body.data.difficulty).toBe(1);

    // The list carries the slug so the card can link straight to it.
    const list = await api.get('/api/games');
    const row = (list.body.data as Array<{ puzzleId: number | null; slug: string }>).find(
      (entry) => entry.puzzleId === versionId,
    );
    expect(row?.slug).toBe(`puzzle-${code}`);

    // OPT-W04 §4.6: the game page resolves its game by path.
    const detail = await api.get(`/api/games/slug/puzzle-${code}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(deploy.body.data.id);
    expect(detail.body.data.slug).toBe(`puzzle-${code}`);
    expect(detail.body.data.puzzle.characterSlots[0]).not.toBeNull();

    // The by-id route still works (cover upload and internal callers).
    const byId = await api.get(`/api/games/${deploy.body.data.id}`);
    expect(byId.body.data.slug).toBe(detail.body.data.slug);
  });

  it('honours an explicitly typed path (Q15: no puzzle- prefix required)', async () => {
    const { versionId, puzzleName } = await deployablePuzzle(`Custom ${token()}`);
    const slug = `my-map-${token()}`;

    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 4 });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.slug).toBe(slug);
    // No name in the body → the puzzle's own name is used.
    expect(deploy.body.data.name).toBe(puzzleName);

    const detail = await api.get(`/api/games/slug/${slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(deploy.body.data.id);
  });

  it('rejects a path owned by another puzzle and stores nothing (Q12)', async () => {
    const slug = `shared-path-${token()}`;
    const first = await deployablePuzzle(`Owner ${token()}`);
    const ok = await api
      .post(`/api/puzzles/${first.versionId}/games`)
      .send({ slug, difficulty: 2 });
    expect(ok.status).toBe(200);

    const second = await deployablePuzzle(`Thief ${token()}`);
    const clash = await api
      .post(`/api/puzzles/${second.versionId}/games`)
      .send({ slug, difficulty: 2 });
    expect(clash.status).toBe(400);
    expect(clash.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(clash.body.message).toBe(`访问路径「${slug}」已被占用，请更换`);

    // Nothing was written for the second puzzle.
    const list = await api.get('/api/games');
    const rows = (list.body.data as Array<{ puzzleId: number | null }>).filter(
      (entry) => entry.puzzleId === second.versionId,
    );
    expect(rows).toHaveLength(0);
  });

  it('reports the occupying game in the conflict, then lets overwriteSlug take the path', async () => {
    const slug = `takeover-${token()}`;
    const owner = await deployablePuzzle(`Owner ${token()}`);
    const kept = await api
      .post(`/api/puzzles/${owner.versionId}/games`)
      .send({ name: '被顶掉的那一个', slug, difficulty: 2 });
    expect(kept.status).toBe(200);

    // v0.7.11：冲突除了说「被占用」，还要说清占位的是谁 —— 覆盖弹窗要问
    // 「覆盖它吗」，光有一条路径回答不了这句话。
    const claimant = await deployablePuzzle(`Claimant ${token()}`);
    const clash = await api
      .post(`/api/puzzles/${claimant.versionId}/games`)
      .send({ slug, difficulty: 4 });
    expect(clash.status).toBe(400);
    expect(clash.body.data).toMatchObject({ kind: 'slug-taken', slug, name: '被顶掉的那一个' });

    const takeover = await api
      .post(`/api/puzzles/${claimant.versionId}/games`)
      .send({ name: '新的主人', slug, difficulty: 4, overwriteSlug: true });
    expect(takeover.status).toBe(200);
    expect(takeover.body.data.slug).toBe(slug);

    // 旧的部署被假删：slug 归新主人，原谜题回到「未部署」。
    const detail = await api.get(`/api/games/slug/${slug}`);
    expect(detail.body.data.id).toBe(takeover.body.data.id);
    expect(detail.body.data.puzzleId).toBe(claimant.versionId);

    const list = await api.get('/api/games');
    const rows = list.body.data as Array<{ puzzleId: number | null; slug: string }>;
    expect(rows.some((entry) => entry.puzzleId === owner.versionId)).toBe(false);
    expect(rows.filter((entry) => entry.slug === slug)).toHaveLength(1);
  });

  it('lets the same puzzle re-deploy its own path — an overwrite is not a conflict', async () => {
    const slug = `mine-${token()}`;
    const { versionId } = await deployablePuzzle(`Mine ${token()}`);

    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 2 });
    expect(first.status).toBe(200);

    const second = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 4 });
    expect(second.status).toBe(200);
    expect(second.body.data.slug).toBe(slug);

    const list = await api.get('/api/games');
    const rows = (list.body.data as Array<{ puzzleId: number | null }>).filter(
      (entry) => entry.puzzleId === versionId,
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects an explicitly blank path instead of silently deriving one', async () => {
    const { versionId } = await deployablePuzzle(`Blank ${token()}`);
    const res = await api.post(`/api/puzzles/${versionId}/games`).send({ slug: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('访问路径必填');
  });

  it('rejects a malformed or over-long path before it reaches the database', async () => {
    const { versionId } = await deployablePuzzle(`Bad ${token()}`);
    const rejected = [
      'with space',
      'under_score',
      '-leading',
      'trailing-',
      'ab',
      '汉字',
      'x'.repeat(81),
    ];
    for (const slug of rejected) {
      const res = await api.post(`/api/puzzles/${versionId}/games`).send({ slug });
      expect(res.status, slug).toBe(400);
      expect(res.body.code, slug).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });

  it('folds an uppercase path to lowercase rather than rejecting it', async () => {
    // The dialog normalises while typing; the server is forgiving the same way.
    const { versionId } = await deployablePuzzle(`Fold ${token()}`);
    const hex = token();
    const res = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: `Puzzle-${hex.toUpperCase()}` });
    expect(res.status).toBe(200);
    expect(res.body.data.slug).toBe(`puzzle-${hex}`);
  });

  it('asks for a manual path when the puzzle has no code and the name derives nothing (Q13)', async () => {
    const { versionId, draftId } = await deployablePuzzle(`汉字项目 ${token()}`);
    /**
     * v0.8.5 §7.4：这一格现在兜得住中文名了（编码就是路径形状）。要复现 Q13 得退回
     * **没有编码的存量谜题** —— 接口已经造不出这种行，所以直接抹掉那一列。
     */
    await db('puzzles').where({ root_id: draftId }).update({ code: null });

    const res = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', difficulty: 3 });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');

    // …and taking the hint works.
    const typed = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', slug: `mystery-castle-${token()}`, difficulty: 3 });
    expect(typed.status).toBe(200);
  });

  it('404s for a path that does not exist', async () => {
    const res = await api.get(`/api/games/slug/no-such-game-${token()}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('404s for a malformed path segment rather than querying the database', async () => {
    const res = await api.get('/api/games/slug/Not%20A%20Slug');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });
});

/**
 * v0.8.3：展示顺序（`games.sort_weight`）。
 *
 * 三件事必须钉住：排序的两级（权重 → 路径）、重新部署**不**把顺序清掉、越界的
 * 数字被拒而不是静默改成 0。第三条最容易悄悄坏掉 —— 一个 `.default(0)` 就能让
 * 「这次没提」变成「就排 0」，作者排好的先后在下次改封面时就散了。
 */
describe('games API 展示顺序 (v0.8.3)', () => {
  function token(): string {
    return Math.random().toString(16).slice(2, 10);
  }

  const listOurs = async (hex: string): Promise<Array<{ slug: string; sortWeight: number }>> => {
    const list = await api.get('/api/games');
    return (list.body.data as Array<{ slug: string; sortWeight: number }>).filter((row) =>
      row.slug.endsWith(hex),
    );
  };

  it('按 sort_weight 升序排，同权重再按访问路径', async () => {
    const hex = token();
    const deploy = async (slug: string, sortWeight?: number): Promise<void> => {
      const { versionId } = await deployablePuzzle(`Ord ${slug} ${hex}`);
      const res = await api
        .post(`/api/puzzles/${versionId}/games`)
        .send(sortWeight === undefined ? { slug } : { slug, sortWeight });
      expect(res.status).toBe(200);
    };

    // 故意按「乱的顺序」部署：b(5) → a(5) → z(-1)。若还按 `created_at desc` 排，
    // 结果会是 z / a / b 之外的另一种顺序，这条断言就会失败。
    await deploy(`ord-b-${hex}`, 5);
    await deploy(`ord-a-${hex}`, 5);
    await deploy(`ord-z-${hex}`, -1);

    const ours = await listOurs(hex);
    expect(ours.map((row) => row.slug)).toEqual([
      `ord-z-${hex}`,
      `ord-a-${hex}`,
      `ord-b-${hex}`,
    ]);
    expect(ours.map((row) => row.sortWeight)).toEqual([-1, 5, 5]);
  });

  it('重新部署不带顺序时沿用上一次的值', async () => {
    const hex = token();
    const slug = `keep-${hex}`;
    const { versionId } = await deployablePuzzle(`Keep ${hex}`);

    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, sortWeight: 7 });
    expect(first.status).toBe(200);
    expect(first.body.data.sortWeight).toBe(7);

    // 只换难度、不提顺序 —— 行是 delete-then-insert，值必须由服务端带过去。
    const second = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 4 });
    expect(second.status).toBe(200);
    expect(second.body.data.sortWeight).toBe(7);
  });

  it('没设过顺序时是 0，且越界的数字被拒', async () => {
    const hex = token();
    const { versionId } = await deployablePuzzle(`Plain ${hex}`);

    const plain = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: `plain-${hex}` });
    expect(plain.body.data.sortWeight).toBe(0);

    for (const sortWeight of [1000, -1000, 1.5]) {
      const res = await api
        .post(`/api/puzzles/${versionId}/games`)
        .send({ slug: `plain-${hex}`, sortWeight });
      expect(res.status, String(sortWeight)).toBe(400);
      expect(res.body.code, String(sortWeight)).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });
});

/**
 * v0.8.5：部署页的顺序列直接 `PATCH /api/games/:id`，不再绕去部署弹窗重发整份负载。
 *
 * 这条端点只认 `sortWeight` 一个键 —— 重发整份负载会把名称 / 路径 / 难度一起写
 * 回去，而列表上的那些值可能已经比弹窗里的新。所以第一条用例顺手钉住「别的字段
 * 一个都不动」。
 */
describe('部署页就地改顺序 (v0.8.5)', () => {
  function token(): string {
    return Math.random().toString(16).slice(2, 10);
  }

  const ours = async (
    hex: string,
  ): Promise<Array<{ id: number; slug: string; name: string; sortWeight: number }>> => {
    const list = await api.get('/api/games');
    return (list.body.data as Array<{ id: number; slug: string; name: string; sortWeight: number }>)
      .filter((row) => row.slug.endsWith(hex));
  };

  it('改完顺序立刻反映在列表里，名称与路径一个都不动', async () => {
    const hex = token();
    const deploy = async (slug: string): Promise<number> => {
      const { versionId } = await deployablePuzzle(`Patch ${slug} ${hex}`);
      const res = await api.post(`/api/puzzles/${versionId}/games`).send({ slug });
      expect(res.status).toBe(200);
      return res.body.data.id as number;
    };

    await deploy(`wp-a-${hex}`);
    const secondId = await deploy(`wp-b-${hex}`);

    // 都还是 0 → 按路径排，a 在前。
    expect((await ours(hex)).map((row) => row.slug)).toEqual([`wp-a-${hex}`, `wp-b-${hex}`]);
    const secondBefore = (await ours(hex)).find((row) => row.id === secondId);

    const patched = await api.patch(`/api/games/${secondId}`).send({ sortWeight: -5 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.sortWeight).toBe(-5);
    expect(patched.body.data.id).toBe(secondId);
    // 只写一列：名称与路径原样回来，不是「被清空成缺省」。
    expect(patched.body.data.slug).toBe(`wp-b-${hex}`);
    expect(patched.body.data.name).toBe(secondBefore?.name);

    // 列表顺序跟着变，b 顶到前面。
    expect((await ours(hex)).map((row) => row.slug)).toEqual([`wp-b-${hex}`, `wp-a-${hex}`]);
  });

  it('缺键 / 越界 / 非整数都是 400，不落库', async () => {
    const hex = token();
    const { versionId } = await deployablePuzzle(`PatchBad ${hex}`);
    const created = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: `pb-${hex}`, sortWeight: 3 });
    expect(created.status).toBe(200);
    const id = created.body.data.id as number;

    for (const body of [{}, { sortWeight: 1000 }, { sortWeight: -1000 }, { sortWeight: 1.5 }, { sortWeight: '3' }]) {
      const res = await api.patch(`/api/games/${id}`).send(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.code, JSON.stringify(body)).toBe(ErrorCode.VALIDATION_FAILED);
    }

    // 值没被任何一次失败的请求改动。
    const row = (await ours(hex)).find((item) => item.id === id);
    expect(row?.sortWeight).toBe(3);
  });

  it('不存在或已取消部署的游戏是 404', async () => {
    expect((await api.patch('/api/games/99999999').send({ sortWeight: 1 })).status).toBe(404);

    const hex = token();
    const { versionId } = await deployablePuzzle(`PatchGone ${hex}`);
    const created = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: `pg-${hex}` });
    const id = created.body.data.id as number;
    expect((await api.delete(`/api/games/${id}`)).status).toBe(200);
    expect((await api.patch(`/api/games/${id}`).send({ sortWeight: 1 })).status).toBe(404);
  });
});

/**
 * v0.8.3（docs/v0.8.3.md §3）：难度分级归主题。
 *
 * 三个断言各钉一件事：自定义档能部署、没提难度时用主题的默认档（不是写死的
 * `medium`）、内置档在自定义主题里**同样**不合法（分级是整份替换，不是追加）。
 *
 * 主题用固定编码 + PATCH 覆盖 data：每跑一次都新建一个主题会把库变成垃圾场
 * （`fixtureTheme` 的注释里已经记过这笔账）。
 */
describe('难度分级由主题定义 (v0.8.3)', () => {
  const THEME_CODE = 'test-tiers';

  // v0.8.3 §15：主题是硬删了，固定编码的夹具不再「留着复用」—— 跑完直接收掉。
  // 走 `purgeTheme` 而不是接口：这个主题里还有地图 / 谜题 / 角色，接口只会回 409。
  afterAll(async () => {
    const { purgeTheme } = await import('./purge');
    await purgeTheme(THEME_CODE);
  });

  async function useTiers(levels: Array<{ level: number; label: string }>): Promise<void> {
    const created = await api.post('/api/themes').send({ code: THEME_CODE, name: '分级测试主题' });
    if (created.status !== 200 && created.status !== 409) {
      throw new Error(`分级测试主题建不出来：${created.status}`);
    }
    const patched = await api
      .patch(`/api/themes/${THEME_CODE}`)
      .send({ data: { version: 1, difficultyLevels: levels } });
    expect(patched.status).toBe(200);
  }

  /** 与 `deployablePuzzle` 同款，只是把主题换掉 —— 发布要求名册上至少有一个人。 */
  async function deployableInTheme(name: string, themeCode: string): Promise<number> {
    const mapId = await createMap({ name, gridSize: 6, themeCode });
    const versionNo = await publish(mapId);
    const draftId = await createPuzzle({ name: `${name} 谜题`, mapId, mapVersionNo: versionNo });
    const characterId = await createCharacterWithAvatar({ themeCode });
    const initial = await api.get(`/api/puzzles/${draftId}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = { characterId };
    const saved = await api
      .put(`/api/puzzles/${draftId}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(saved.status).toBe(200);
    return publishPuzzle(draftId);
  }

  it('自定义档能部署；没提难度时取正中间那一档；内置档被拒', async () => {
    await useTiers([
      { level: 1, label: '热身' },
      { level: 2, label: '地狱' },
    ]);
    const versionId = await deployableInTheme(`Tiered ${uniqueCode('t')}`, THEME_CODE);

    const auto = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: uniqueSlug('tier-auto') });
    expect(auto.status).toBe(200);
    // 两档的「正中间」落在第一档 —— 关键是它**来自主题**，而不是写死的 medium。
    expect(auto.body.data.difficulty).toBe(1);

    const custom = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: uniqueSlug('tier-custom'), difficulty: 2 });
    expect(custom.status).toBe(200);
    expect(custom.body.data.difficulty).toBe(2);

    // 第 3 档是内置五档里的 —— 但这个主题只有两档，整份替换，不是「内置 + 追加」。
    const rejected = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: uniqueSlug('tier-nope'), difficulty: 3 });
    expect(rejected.status).toBe(400);
    expect(rejected.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(rejected.body.message).toContain('不是这个主题的难度分级');
  });
});

/**
 * v0.7.1 §5.2 / §7.1：谜题有了版本，部署的单位从「谜题」变成「谜题版本行」。
 *
 * 这一组钉住四层拦截的第三层（服务端 400）与两个唯一约束的分工：
 * 草稿行不能部署、版本行只读、号不回收、删掉的 slug 可以重用。
 */
describe('v0.7.1 谜题版本与部署', () => {
  it('草稿行不能部署 —— 只有已发布的版本可以', async () => {
    const { draftId } = await puzzleWithVersion(`DraftDeploy ${uniqueCode('p')}`);
    const res = await api
      .post(`/api/puzzles/${draftId}/games`)
      .send({ name: 'X', slug: uniqueSlug('draft-deploy') });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toBe('只有已发布的谜题版本可以部署');
  });

  it('发布产生版本行：名册为空拒绝，号 MAX+1 且不回收，版本行只读', async () => {
    const { draftId } = await puzzleWithVersion(`Publish ${uniqueCode('p')}`);

    // 名册一位参与者都没有 —— 部署出去也没法玩，发布前就挡住。
    const empty = await api.post(`/api/puzzles/${draftId}/versions`).send({});
    expect(empty.status).toBe(422);
    expect(empty.body.code).toBe(ErrorCode.PUBLISH_VALIDATION_FAILED);
    expect(empty.body.message).toBe('发布校验未通过');

    const characterId = await createCharacter();
    const initial = await api.get(`/api/puzzles/${draftId}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = { characterId, linkages: [] };
    const saved = await api
      .put(`/api/puzzles/${draftId}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(saved.status).toBe(200);

    const v1 = await api.post(`/api/puzzles/${draftId}/versions`).send({});
    expect(v1.status).toBe(200);
    expect(v1.body.data.kind).toBe('version');
    expect(v1.body.data.versionNo).toBe(1);
    // 发布 = INSERT 一条新行，草稿行不动。
    expect(v1.body.data.id).not.toBe(draftId);
    createdPuzzles.push(v1.body.data.id as number);

    // 版本行只读：改名 / 保存 / 封面上传一律 400。
    const patched = await api.patch(`/api/puzzles/${v1.body.data.id}`).send({ name: '改名' });
    expect(patched.status).toBe(400);
    const rewritten = await api
      .put(`/api/puzzles/${v1.body.data.id}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(rewritten.status).toBe(400);
    const cover = await api.delete(`/api/puzzles/${v1.body.data.id}/cover`);
    expect(cover.status).toBe(400);

    // 号可自定义（填空洞），活行重号 400，软删之后仍然不许复用。
    const v5 = await api.post(`/api/puzzles/${draftId}/versions`).send({ version: 5 });
    expect(v5.body.data.versionNo).toBe(5);
    createdPuzzles.push(v5.body.data.id as number);
    const dupe = await api.post(`/api/puzzles/${draftId}/versions`).send({ version: 5 });
    expect(dupe.status).toBe(400);
    expect(dupe.body.message).toContain('已存在');

    await api.delete(`/api/puzzles/${draftId}/versions/5`);
    const reuse = await api.post(`/api/puzzles/${draftId}/versions`).send({ version: 5 });
    expect(reuse.status).toBe(400);
    const next = await api.post(`/api/puzzles/${draftId}/versions`).send({});
    expect(next.body.data.versionNo).toBe(6);
    createdPuzzles.push(next.body.data.id as number);

    // 血统的版本历史按号倒序，软删的 v5 不出现。
    const lineage = await api.get(`/api/puzzles/${draftId}/versions`);
    expect(lineage.body.data.map((row: { versionNo: number }) => row.versionNo)).toEqual([6, 1]);
  });

  /**
   * v0.7.2 §3.3：编辑器 `?v=` 态「保存才 fork」，所以 fork 端点要能接住作者
   * 此刻的草稿。底图不认客户端那份 —— 永远以版本行里的 `map` 为准。
   */
  it('fork 可以带着编辑后的草稿落库，底图仍取版本自己的画布', async () => {
    const { versionId } = await deployablePuzzle(`ForkData ${uniqueCode('p')}`);
    const version = await api.get(`/api/puzzles/${versionId}/versions/1`);
    expect(version.status).toBe(200);

    const edited = version.body.data.data;
    edited.description = '作者刚改过的描述';
    const forked = await api
      .post(`/api/puzzles/${versionId}/versions/1/fork`)
      .send({ data: edited });
    expect(forked.status).toBe(200);
    createdPuzzles.push(forked.body.data.id as number);

    const draft = forked.body.data;
    expect(draft.kind).toBe('draft');
    expect(draft.data.description).toBe('作者刚改过的描述');
    // 行名与 JSON 名同源（都由服务端生成）。
    expect(draft.data.name).toBe(draft.name);
    expect(draft.name).toContain('自 v1');
    // 底图不接受客户端版本：送来的那份与版本快照一致。
    expect(draft.data.map).toEqual(version.body.data.data.map);
  });

  /**
   * v0.7.3 §3.4：「引入新地图」只交**来源**，画布由服务端从那份已发布版本读。
   * 换的只是 `data.map`，谜题自己的字段一个都不许动。
   */
  it('保存带 mapSource 换底图：画布来自新版本，谜题字段一个不动', async () => {
    const { draftId } = await deployablePuzzle(`Swap ${uniqueCode('p')}`);
    const otherMapId = await createMap({ name: `Other ${uniqueCode('p')}`, gridSize: 6 });
    const canvas = (await api.get(`/api/maps/${otherMapId}/map`)).body.data.draft;
    await saveCanvas(otherMapId, {
      ...canvas,
      regions: [{ id: 'rg_swap01', name: '新区域', cells: [[0, 0]] }],
    });
    const otherVersionNo = await publish(otherMapId);

    const before = await api.get(`/api/puzzles/${draftId}`);
    const edited = before.body.data.data;
    edited.description = '换底图但不改描述';
    const saved = await api.put(`/api/puzzles/${draftId}`).send({
      data: edited,
      updatedAt: before.body.data.updatedAt,
      mapSource: { mapId: otherMapId, versionNo: otherVersionNo },
    });
    expect(saved.status).toBe(200);

    const after = saved.body.data.data;
    expect(after.map.mapId).toBe(otherMapId);
    expect(after.map.versionNo).toBe(otherVersionNo);
    // 画布真的换了：新版本上的区域过来了，旧画布是空的。
    expect(after.map.data.regions.map((region: { id: string }) => region.id)).toEqual([
      'rg_swap01',
    ]);
    // 「仅替换地图信息」：名册、描述、调色板照旧，尺寸还是 6。
    expect(after.description).toBe('换底图但不改描述');
    expect(after.characterSlots).toHaveLength(6);
    expect(after.characterSlots[0]).not.toBeNull();
    expect(saved.body.data.gridSize).toBe(6);
  });

  it('换底图只接受同尺寸的已发布版本', async () => {
    const { draftId } = await deployablePuzzle(`SwapSize ${uniqueCode('p')}`);
    const before = await api.get(`/api/puzzles/${draftId}`);

    // 尺寸不同：底图尺寸决定名册长度与所有坐标，不是 UI 的客气。
    const wideMapId = await createMap({ name: `Wide ${uniqueCode('p')}`, gridSize: 9 });
    const wideVersionNo = await publish(wideMapId);
    const mismatched = await api.put(`/api/puzzles/${draftId}`).send({
      data: before.body.data.data,
      updatedAt: before.body.data.updatedAt,
      mapSource: { mapId: wideMapId, versionNo: wideVersionNo },
    });
    expect(mismatched.status).toBe(400);
    expect(mismatched.body.message).toContain('方格尺寸相同');

    // 版本不存在（同尺寸地图但号是编的）。
    const ghostMapId = await createMap({ name: `Ghost ${uniqueCode('p')}`, gridSize: 6 });
    const ghost = await api.put(`/api/puzzles/${draftId}`).send({
      data: before.body.data.data,
      updatedAt: before.body.data.updatedAt,
      mapSource: { mapId: ghostMapId, versionNo: 9 },
    });
    expect(ghost.status).toBe(400);
    expect(ghost.body.message).toContain('地图版本不存在');

    // 两次都没写进去。
    const unchanged = await api.get(`/api/puzzles/${draftId}`);
    expect(unchanged.body.data.data.map.mapId).toBe(before.body.data.data.map.mapId);
  });

  it('fork 也可以带着换过的底图落库', async () => {
    const { versionId } = await deployablePuzzle(`ForkSwap ${uniqueCode('p')}`);
    const otherMapId = await createMap({ name: `ForkOther ${uniqueCode('p')}`, gridSize: 6 });
    const otherVersionNo = await publish(otherMapId);

    const version = await api.get(`/api/puzzles/${versionId}/versions/1`);
    const forked = await api.post(`/api/puzzles/${versionId}/versions/1/fork`).send({
      data: version.body.data.data,
      mapSource: { mapId: otherMapId, versionNo: otherVersionNo },
    });
    expect(forked.status).toBe(200);
    createdPuzzles.push(forked.body.data.id as number);
    expect(forked.body.data.data.map.mapId).toBe(otherMapId);
    expect(forked.body.data.data.map.versionNo).toBe(otherVersionNo);
  });

  it('编辑此版本 = fork 出新草稿行，版本行不动', async () => {
    const { draftId, versionId } = await deployablePuzzle(`Fork ${uniqueCode('p')}`);
    const owner = await api.get(`/api/puzzles/${draftId}`);

    const forked = await api.post(`/api/puzzles/${versionId}/versions/1/fork`);
    expect(forked.status).toBe(200);
    createdPuzzles.push(forked.body.data.id as number);
    expect(forked.body.data.kind).toBe('draft');
    expect(forked.body.data.versionNo).toBeNull();
    expect(forked.body.data.rootId).toBe(owner.body.data.rootId);
    // 名字带来源，血统里多份草稿才分得清。
    expect(forked.body.data.name).toContain('自 v1');
    // 名册跟着复制过来（fork 的是内容，不是空壳）。
    expect(forked.body.data.data.characterSlots[0]).not.toBeNull();
  });

  it('同一谜题两个版本的默认路径相同 —— 第二个被服务端挡住（Q10）', async () => {
    const { draftId, versionId, puzzleName } = await deployablePuzzle(`Same ${uniqueCode('p')}`);
    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: puzzleName, difficulty: 3 });
    expect(first.status).toBe(200);

    // 从 v1 fork 出草稿，直接发布成 v2（名册已复制，校验能过）。
    const forked = await api.post(`/api/puzzles/${versionId}/versions/1/fork`);
    const forkedId = forked.body.data.id as number;
    createdPuzzles.push(forkedId);
    const v2 = await publishPuzzle(forkedId);

    // 中段不带版本号，所以名称相同 ⇒ 默认路径相同。
    const clash = await api
      .post(`/api/puzzles/${v2}/games`)
      .send({ name: puzzleName, difficulty: 3 });
    expect(clash.status).toBe(400);
    expect(clash.body.message).toContain('已被占用');

    // 作者在中段里写点别的即可。
    const ok = await api
      .post(`/api/puzzles/${v2}/games`)
      .send({ name: puzzleName, slug: uniqueSlug('same-second'), difficulty: 3 });
    expect(ok.status).toBe(200);
  });

  it('取消部署是假删：列表消失、玩家链接 404、同一 slug 可以再用', async () => {
    const { draftId, versionId } = await deployablePuzzle(`Cancel ${uniqueCode('p')}`);
    const slug = uniqueSlug('cancel');
    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 2 });
    expect(deploy.status).toBe(200);
    const gameId = deploy.body.data.id as number;

    // 版本行挂着游戏时不许删 —— 否则在线链接会指向不存在的谜题。
    const blocked = await api.delete(`/api/puzzles/${versionId}/versions/1`);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toContain('取消部署');

    // 取消部署：行还在（假删），三个可见面同时消失。
    const cancelled = await api.delete(`/api/games/${gameId}`);
    expect(cancelled.status).toBe(200);
    expect((await api.get(`/api/games/${gameId}`)).status).toBe(404);
    expect((await api.get(`/api/games/slug/${slug}`)).status).toBe(404);
    const list = await api.get('/api/games');
    expect(
      (list.body.data as Array<{ id: number }>).some((row) => row.id === gameId),
    ).toBe(false);
    // 谜题列表的「已部署」徽标同步消失。
    const puzzles = await api.get('/api/puzzles?kind=version');
    expect(
      (puzzles.body.data.list as Array<{ id: number; deployed: boolean }>).find(
        (row) => row.id === versionId,
      )?.deployed,
    ).toBe(false);

    // slug 被释放：同一路径可以重新部署。
    const again = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 2 });
    expect(again.status).toBe(200);
    expect(again.body.data.slug).toBe(slug);

    // 取消之后版本行才删得掉（软删 → 详情 404）。
    await api.delete(`/api/games/${again.body.data.id as number}`);
    const removed = await api.delete(`/api/puzzles/${versionId}/versions/1`);
    expect(removed.status).toBe(200);
    expect((await api.get(`/api/puzzles/${versionId}`)).status).toBe(404);
    // 草稿行不受影响。
    expect((await api.get(`/api/puzzles/${draftId}`)).status).toBe(200);
  });
});

/**
 * v0.5.8 第三阶段（docs/map-table-merge-design.md）：`map_versions` 并入
 * `maps` 之后，版本行就是合法的 `maps` 行 —— 于是有两条新契约要钉住：
 * 号可自定义但不可复用（软删行仍占号），以及版本行虽然能被 id 直达，但写
 * 入口一律 400。
 */
describe('v0.5.8 第三阶段：版本行与草稿行同表', () => {
  it('自定义版本号：能填空洞号，活行与软删行重号都 400', async () => {
    const name = `MergeNo ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });

    const v1 = await publishVersion(mapId);
    expect(v1.body.data.versionNo).toBe(1);
    const v2 = await publishVersion(mapId);
    expect(v2.body.data.versionNo).toBe(2);

    // 跳过 3~6，直接给 7 —— 版本号不必连续。
    const custom = await publishVersion(mapId, 7);
    expect(custom.body.data.versionNo).toBe(7);

    // 活行重号
    const dupe = await api.post(`/api/maps/${mapId}/versions`).send({ version: 7 });
    expect(dupe.status).toBe(400);
    expect(dupe.body.message).toContain('已存在');

    // 软删之后号仍被占用（软删行参与 MAX、占唯一位）
    const removed = await api.delete(`/api/maps/${mapId}/versions/7`);
    expect(removed.status).toBe(200);
    const reuse = await api.post(`/api/maps/${mapId}/versions`).send({ version: 7 });
    expect(reuse.status).toBe(400);
    expect(reuse.body.message).toContain('已存在');

    // 默认号 = 血统 MAX（含软删行）+ 1
    const next = await publishVersion(mapId);
    expect(next.body.data.versionNo).toBe(8);

    // 入参校验：0 / 非整数一律 400（schema 是 .strict() + 正整数）
    const invalid = await api.post(`/api/maps/${mapId}/versions`).send({ version: 0 });
    expect(invalid.status).toBe(400);
  });

  it('软删的版本在四个可见面消失，但直达读取与 fork 源仍可用', async () => {
    const name = `SoftDel ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    await publish(mapId);
    const v2 = await publishVersion(mapId);
    const v2RowId = v2.body.data.id as number;

    const removed = await api.delete(`/api/maps/${mapId}/versions/2`);
    expect(removed.status).toBe(200);

    // ① /maps 列表
    const list = await api.get(`/api/maps?keyword=${encodeURIComponent(name)}`);
    const rows = list.body.data.list as Array<{ kind: string; versionNo: number | null }>;
    expect(rows.filter((row) => row.kind === 'version').map((row) => row.versionNo)).toEqual([1]);

    // ② 创建谜题的可选地图列表（按发布时的名字快照查）
    const picker = await api.get('/api/maps/versions');
    expect(
      (picker.body.data as Array<{ mapName: string; versionNo: number }>).some(
        (entry) => entry.mapName === name && entry.versionNo === 2,
      ),
    ).toBe(false);

    // ③ 版本历史面板
    const lineage = await api.get(`/api/maps/${mapId}/versions`);
    expect(lineage.body.data.map((entry: { versionNo: number }) => entry.versionNo)).toEqual([1]);

    // ④ 版本详情直达 → 404（「不可见」包含直达入口）
    const gone = await api.get(`/api/maps/${mapId}/versions/2`);
    expect(gone.status).toBe(404);

    // 号不回收：默认号仍是 3
    const next = await publishVersion(mapId);
    expect(next.body.data.versionNo).toBe(3);

    // fork 源不过滤软删（过滤管可见性，不管直达读取）→ 版本行 id 也能当 :id
    const forked = await api.post(`/api/maps/${v2RowId}/versions/2/fork`);
    expect(forked.status).toBe(200);
    createdMapEntries.push(forked.body.data.id as number);
  });

  it('版本行是只读行：条目级与画布级写入口一律 400', async () => {
    const name = `ReadOnly ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    const versionRowId = (await publishVersion(mapId)).body.data.id as number;

    // 详情与画布读取仍然允许（只读渲染要能用）
    const detail = await api.get(`/api/maps/${versionRowId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.versionNo).toBe(1);
    const canvas = await api.get(`/api/maps/${versionRowId}/map`);
    expect(canvas.status).toBe(200);

    const patched = await api.patch(`/api/maps/${versionRowId}`).send({ name: '改名' });
    expect(patched.status).toBe(400);

    const saved = await api.put(`/api/maps/${versionRowId}/map`).send({ data: emptyDraft(6) });
    expect(saved.status).toBe(400);

    const resized = await api.patch(`/api/maps/${versionRowId}/grid-size`).send({ gridSize: 8 });
    expect(resized.status).toBe(400);

    const cover = await api.delete(`/api/maps/${versionRowId}/cover`);
    expect(cover.status).toBe(400);

    const republish = await api.post(`/api/maps/${versionRowId}/versions`).send({});
    expect(republish.status).toBe(400);
    expect(republish.body.message).toContain('草稿');

    const duplicated = await api.post(`/api/maps/${versionRowId}/duplicate`);
    expect(duplicated.status).toBe(400);

    const region = await api.post(`/api/maps/${versionRowId}/regions`).send({
      name: 'Lounge',
      cells: [[0, 0]],
    });
    expect(region.status).toBe(400);

    // 通用 DELETE 对版本行分流成软删：行还在（详情 404），但号不回收。
    const deleted = await api.delete(`/api/maps/${versionRowId}`);
    expect(deleted.status).toBe(200);
    expect((await api.get(`/api/maps/${versionRowId}`)).status).toBe(404);
    const revived = await api.post(`/api/maps/${mapId}/versions`).send({ version: 1 });
    expect(revived.status).toBe(400);
  });

  it('删工作条目保留它的版本行（不再级联）', async () => {
    const name = `KeepVersions ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });
    await publishVersion(mapId);
    await publishVersion(mapId);

    const removed = await api.delete(`/api/maps/${mapId}`);
    expect(removed.status).toBe(200);

    // 列表里草稿行没了，版本行还在。
    const list = await api.get(`/api/maps?keyword=${encodeURIComponent(name)}`);
    const rows = list.body.data.list as Array<{ kind: string; versionNo: number | null }>;
    expect(rows.filter((row) => row.kind === 'draft')).toHaveLength(0);
    expect(rows.map((row) => row.versionNo).sort()).toEqual([1, 2]);
  });

  it('草稿行的 versionNo 短路成 null，status 由血统推导（设计 §15 P0-2）', async () => {
    const name = `DraftNo ${uniqueCode('p')}`;
    const mapId = await createMap({ name, gridSize: 6 });

    const fresh = await api.get(`/api/maps/${mapId}`);
    expect(fresh.body.data.versionNo).toBeNull();
    expect(fresh.body.data.status).toBe('draft');
    expect(fresh.body.data.currentVersionNo).toBeNull();

    await publishVersion(mapId);
    const after = await api.get(`/api/maps/${mapId}`);
    // 草稿行仍然没有自己的版本号，但血统已经发布了 v1。
    expect(after.body.data.versionNo).toBeNull();
    expect(after.body.data.status).toBe('published');
    expect(after.body.data.currentVersionNo).toBe(1);
  });
});

describe('v0.5.8 第四阶段：草稿与版本两块各自分页', () => {
  it('kind 过滤只返回一类，两块 total 各算各的', async () => {
    const token = uniqueCode('p');
    const first = await createMap({ name: `Split A ${token}`, gridSize: 6 });
    await publishVersion(first);
    await publishVersion(first);
    const second = await createMap({ name: `Split B ${token}`, gridSize: 6 });
    await publishVersion(second);

    const drafts = await api.get(`/api/maps?kind=draft&keyword=${token}`);
    expect(drafts.status).toBe(200);
    expect(drafts.body.data.total).toBe(2);
    expect(
      (drafts.body.data.list as Array<{ kind: string }>).every((row) => row.kind === 'draft'),
    ).toBe(true);

    const versions = await api.get(`/api/maps?kind=version&keyword=${token}`);
    expect(versions.body.data.total).toBe(3);
    expect(
      (versions.body.data.list as Array<{ kind: string }>).every((row) => row.kind === 'version'),
    ).toBe(true);

    // 不传 kind 仍是并集口径，且两块 total 之和等于并集 total。
    const union = await api.get(`/api/maps?keyword=${token}`);
    expect(union.body.data.total).toBe(5);

    // 非法 kind 值被 schema 拦下。
    expect((await api.get('/api/maps?kind=nope')).status).toBe(400);
  });

  it('版本块默认按时间倒序，并跟随 sort/order（不再固定血统顺序）', async () => {
    const token = uniqueCode('p');
    const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));
    const first = await createMap({ name: `Order A ${token}`, gridSize: 6 });
    await publishVersion(first);
    await tick();
    await publishVersion(first);
    await tick();
    const second = await createMap({ name: `Order B ${token}`, gridSize: 6 });
    await publishVersion(second);

    type Row = {
      id: number;
      kind: string;
      name: string;
      rootId: number;
      versionNo: number;
      updatedAt: string;
    };

    // 默认（不传 sort/order）＝ 按更新时间倒序，最新发布的在最上面。
    const query = `/api/maps?kind=version&keyword=${token}&pageSize=2`;
    const page1 = await api.get(`${query}&page=1`);
    const page2 = await api.get(`${query}&page=2`);
    const rows = [...page1.body.data.list, ...page2.body.data.list] as Row[];

    // 各自翻页不重叠、不遗漏。
    expect(page1.body.data.list).toHaveLength(2);
    expect(page2.body.data.list).toHaveLength(1);

    // 跨页拼回来时间单调不增 —— 排序在服务端，不是客户端只排当前页。
    const times = rows.map((row) => new Date(row.updatedAt).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    // 发布顺序是 A.v1 → A.v2 → B.v1，倒序之后就是反过来。
    expect(rows.map((row) => row.versionNo)).toEqual([1, 2, 1]);
    expect(rows.map((row) => row.rootId)).toEqual([second, first, first]);

    // 显式写 updatedAt desc 与默认等价。
    const explicit = await api.get(`${query}&sort=updatedAt&order=desc`);
    expect((explicit.body.data.list as Row[]).map((row) => row.id)).toEqual(
      (page1.body.data.list as Row[]).map((row) => row.id),
    );

    // 版本块现在也听 sort：按名称升序，A 血统（中间才发布）反而排在前面。
    const byName = await api.get(
      `/api/maps?kind=version&keyword=${token}&sort=name&order=asc`,
    );
    const names = (byName.body.data.list as Row[]).map((row) => row.name);
    expect(names).toEqual([...names].sort());
    expect(names[0]).toBe(`Order A ${token}`);
  });
});

/**
 * v0.8.3（docs/v0.8.3.md §15）：删主题 = **物理删除**，编码立刻回到可用状态。
 *
 * 以前是软删：行还在、`themes.code`（普通 UNIQUE）仍被占着，同编码重建只能撞唯一
 * 约束 —— 接口回的是 500「服务器内部错误」。四条用例各钉一件事：编码释放、数量
 * 护栏、软删子行（外键）不挡路。
 */
describe('删除主题是硬删 (v0.8.3 §15)', () => {
  /** 用例自己建的主题：跑完一律物理清掉（游戏 / 谜题的外键也由它一并处理）。 */
  const createdThemes: string[] = [];

  afterEach(async () => {
    const { purgeTheme } = await import('./purge');
    for (const code of createdThemes) await purgeTheme(code);
    createdThemes.length = 0;
  });

  async function newTheme(prefix: string, name = '一次性主题'): Promise<string> {
    const code = `${prefix}-${uniqueCode('t')}`;
    const res = await api.post('/api/themes').send({ code, name });
    expect(res.status).toBe(200);
    createdThemes.push(code);
    return code;
  }

  /** 一个能在指定主题里部署的谜题版本：发布要有名册，名册上得有位带头像的人。 */
  async function deployableIn(code: string, name: string): Promise<number> {
    const mapId = await createMap({ name, gridSize: 6, themeCode: code });
    const versionNo = await publish(mapId);
    const draftId = await createPuzzle({ name: `${name} 谜题`, mapId, mapVersionNo: versionNo });
    const characterId = await createCharacterWithAvatar({ themeCode: code });
    const initial = await api.get(`/api/puzzles/${draftId}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = { characterId };
    const saved = await api
      .put(`/api/puzzles/${draftId}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    expect(saved.status).toBe(200);
    return publishPuzzle(draftId);
  }

  it('空主题删掉之后，同一个编码可以立刻重建', async () => {
    const code = await newTheme('hard');

    const removed = await api.delete(`/api/themes/${code}`);
    expect(removed.status).toBe(200);
    expect((await api.get(`/api/themes/${code}`)).status).toBe(404);

    // 软删时代这一句就是 500：尸体行还占着 `themes.code`。
    const again = await api.post('/api/themes').send({ code, name: '同编码重建' });
    expect(again.status).toBe(200);
    expect(again.body.data.code).toBe(code);
  });

  it('主题里还有资源时拒绝，并说清数量', async () => {
    const code = await newTheme('busy');
    await createAsset({ themeCode: code });

    const res = await api.delete(`/api/themes/${code}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('1 个资源');
    // 拦住了就什么都没动。
    expect((await api.get(`/api/themes/${code}`)).status).toBe(200);
  });

  it('只剩软删的地图 / 谜题 / 游戏行时，仍然删得掉', async () => {
    const code = await newTheme('zombie');
    const name = `僵尸 ${uniqueCode('z')}`;
    const mapId = await createMap({ name, gridSize: 6, themeCode: code });
    const versionNo = await publish(mapId);
    const draftId = await createPuzzle({ name, mapId, mapVersionNo: versionNo });
    const characterId = await createCharacterWithAvatar({ themeCode: code });
    const initial = await api.get(`/api/puzzles/${draftId}`);
    const draft = initial.body.data.data;
    draft.characterSlots[0] = { characterId };
    await api
      .put(`/api/puzzles/${draftId}`)
      .send({ data: draft, updatedAt: initial.body.data.updatedAt });
    const versionId = await publishPuzzle(draftId);

    // 部署 → 取消部署：`games` 行留着（软删），谜题版本行接着也软删。
    const game = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug: uniqueSlug('zombie') });
    expect(game.status).toBe(200);
    expect((await api.delete(`/api/games/${game.body.data.id as number}`)).status).toBe(200);

    // 版本行软删、草稿行硬删 —— 作者眼里这个主题已经空了。
    expect((await api.delete(`/api/puzzles/${versionId}`)).status).toBe(200);
    expect((await api.delete(`/api/puzzles/${draftId}`)).status).toBe(200);
    expect((await api.delete(`/api/maps/${mapId}/versions/${versionNo}`)).status).toBe(200);
    expect((await api.delete(`/api/maps/${mapId}`)).status).toBe(200);
    // 角色走的是「停用」不是删除（停用的角色仍然属于这个主题，卡片也数它），
    // 要真抬走得显式 `hard=true` —— 否则主题会以「1 个角色」被拦。
    expect(
      (await api.delete(`/api/characters/${characterId}?hard=true&clearReferences=true`)).status,
    ).toBe(200);

    const counts = (await api.get(`/api/themes/${code}`)).body.data.counts as Record<string, number>;
    expect(counts).toEqual({ assets: 0, maps: 0, characters: 0, puzzles: 0, games: 0 });

    // 计数是 0，但软删行还挂着 `theme_id`：不先抬走它们，`DELETE` 会撞 23503。
    expect((await api.delete(`/api/themes/${code}`)).status).toBe(200);
    expect((await api.get(`/api/themes/${code}`)).status).toBe(404);
  });
});

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  // 游戏先删：`games.puzzle_id` 是 ON DELETE RESTRICT，谜题还挂着游戏时删不掉。
  if (createdPuzzles.length) {
    await db('games').whereIn('puzzle_id', createdPuzzles).del();
    await db('puzzles').whereIn('id', createdPuzzles).del();
  }
  // v0.5.8 第三阶段：先删这批用例自己记账的版本行（有些工作条目已被删，按
  // root_id 扫不到），再按血统兜一遍，最后删草稿行。
  if (createdVersionRows.length) await db('maps').whereIn('id', createdVersionRows).del();
  if (createdMapEntries.length) {
    const roots = db('maps').whereIn('id', createdMapEntries).select('root_id');
    await db('maps').whereNot('version', 'draft').whereIn('root_id', roots).del();
    await db('maps').whereIn('id', createdMapEntries).del();
  }
  if (createdAssets.length) await db('assets').whereIn('id', createdAssets).del();
  if (createdCharacters.length) await db('characters').whereIn('id', createdCharacters).del();
  await db.destroy();
  for (const dir of uploadedAvatarDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  for (const dir of uploadedGameCoverDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  for (const dir of uploadedMapCoverDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  for (const dir of uploadedPuzzleSymbolDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  for (const dir of uploadedThemeSymbolDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
