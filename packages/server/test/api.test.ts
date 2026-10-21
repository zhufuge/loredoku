import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode, MAP_JSON_VERSION } from '@loredoku/shared';
import type { MapDraft } from '@loredoku/shared';
import { api } from './helpers';
import { resolveUploadPath } from '../src/utils/paths';

const createdMapEntries: number[] = [];
const createdAssets: number[] = [];
const createdCharacters: number[] = [];
/** Deleted before `maps` — `puzzles.map_project_id` is ON DELETE RESTRICT. */
const createdPuzzles: number[] = [];
const uploadedAvatarDirs: string[] = [];
const uploadedGameCoverDirs: string[] = [];
const uploadedMapCoverDirs: string[] = [];

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
  const res = await api.post('/api/maps').send(body);
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
    .send({ code: uniqueCode('item'), name: 'Asset', ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdAssets.push(id);
  return id;
}

async function createCharacter(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api
    .post('/api/characters')
    .send({ code: uniqueCode('char'), name: 'Character', ...body });
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
  const res = await api.post('/api/puzzles').send(body);
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
): Promise<{ mapId: number; draftId: number; puzzleName: string }> {
  const mapId = await createMap({ name, gridSize: 6 });
  const versionNo = await publish(mapId);
  const puzzleName = `${name} 谜题`;
  const draftId = await createPuzzle({
    name: puzzleName,
    mapId: mapId,
    mapVersionNo: versionNo,
  });
  return { mapId, draftId, puzzleName };
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
    const res = await api.post('/api/maps').send({ name: `Smoke ${uniqueCode('p')}` });
    expect(res.status).toBe(200);
    // 创建时不再写尺寸 —— 第一次进编辑器时才由初始化弹窗写入草稿。
    expect(res.body.data.gridSize).toBeNull();
    createdMapEntries.push(res.body.data.id);
  });

  it('v0.5.8 §1: ignores a legacy gridSize field instead of validating it', async () => {
    const res = await api.post('/api/maps').send({ name: `Bad ${uniqueCode('p')}`, gridSize: 1 });
    // schema 不再认识这个字段（非 strict，直接忽略），尺寸仍为空。
    expect(res.status).toBe(200);
    expect(res.body.data.gridSize).toBeNull();
    createdMapEntries.push(res.body.data.id);
  });

  it('v0.5.8 第六阶段: 允许同名创建与同名改名，但复制仍自动避开重名', async () => {
    const name = `Twin ${uniqueCode('p')}`;

    const first = await api.post('/api/maps').send({ name });
    const second = await api.post('/api/maps').send({ name });
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
    // v0.6.1: the footprint and the look moved to the initial form.
    expect(res.body.data).not.toHaveProperty('widthCells');
    expect(res.body.data.forms).toHaveLength(1);
    expect(res.body.data.forms[0]).toMatchObject({
      name: '默认',
      widthCells: 1,
      heightCells: 1,
    });

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
      code: uniqueCode('inactive'),
      name: 'Inactive Item',
      type: 'item',
    });
    expect(plain.status).toBe(200);
    createdAssets.push(plain.body.data.id as number);
    // OPT-305 stands: no appearance, no `isActive` → 停用.
    expect(plain.body.data.isActive).toBe(false);

    const enabled = await api.post('/api/assets').send({
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
    const res = await api.post('/api/assets').send({ code: 'bad code', name: 'Bad' });
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
    const res = await api.post('/api/characters').send({ code: 'bad code', name: 'Bad' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
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
      .send({ name: '无版本', mapId: mapId, mapVersionNo: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.message).toContain('地图版本');
  });

  it('rejects a puzzle with a blank name', async () => {
    const { mapId, versionNo } = await publishedMapWithItem(`BadName ${uniqueCode('p')}`);
    const res = await api
      .post('/api/puzzles')
      .send({ name: '   ', mapId: mapId, mapVersionNo: versionNo });
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
      .send({ name: '待删', mapId: mapId, mapVersionNo: versionNo });
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
});

// ---- v0.4.0 FEAT-G02 + v0.5.0 CONS-K16: the unit of deployment is a puzzle ----
describe('games API (FEAT-G02 + CONS-K16)', () => {
  it('deploys a puzzle and lists it on the games home page', async () => {
    const { versionId } = await deployablePuzzle(`Game ${uniqueCode('p')}`);
    const slug = uniqueSlug('mystery-castle');

    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', slug, difficulty: 'hard' });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.puzzleId).toBe(versionId);
    expect(deploy.body.data.name).toBe('神秘古堡');
    expect(deploy.body.data.difficulty).toBe('hard');
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
    expect(deploy.body.data.difficulty).toBe('medium');
  });

  it('keeps one game per puzzle — a later deploy overwrites the earlier one', async () => {
    const { versionId } = await deployablePuzzle(`Overwrite ${uniqueCode('p')}`);

    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '第一版', slug: uniqueSlug('first'), difficulty: 'easy' });
    expect(first.status).toBe(200);

    const second = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '第二版', slug: uniqueSlug('second'), difficulty: 'expert' });
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

  it('rejects an unknown difficulty and an empty name', async () => {
    const { versionId } = await deployablePuzzle(`Invalid ${uniqueCode('p')}`);

    const badDifficulty = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ difficulty: 'nightmare' });
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

  it('derives puzzle-{name}-{difficulty} when the path is left untouched', async () => {
    const hex = token();
    const { versionId } = await deployablePuzzle(`Flower Garden ${hex}`);

    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: `Flower Garden ${hex}`, difficulty: 'veryEasy' });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.slug).toBe(`puzzle-flower-garden-${hex}-very-easy`);

    // The list carries the slug so the card can link straight to it.
    const list = await api.get('/api/games');
    const row = (list.body.data as Array<{ puzzleId: number | null; slug: string }>).find(
      (entry) => entry.puzzleId === versionId,
    );
    expect(row?.slug).toBe(`puzzle-flower-garden-${hex}-very-easy`);

    // OPT-W04 §4.6: the game page resolves its game by path.
    const detail = await api.get(`/api/games/slug/puzzle-flower-garden-${hex}-very-easy`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(deploy.body.data.id);
    expect(detail.body.data.slug).toBe(`puzzle-flower-garden-${hex}-very-easy`);
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
      .send({ slug, difficulty: 'hard' });
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
      .send({ slug, difficulty: 'easy' });
    expect(ok.status).toBe(200);

    const second = await deployablePuzzle(`Thief ${token()}`);
    const clash = await api
      .post(`/api/puzzles/${second.versionId}/games`)
      .send({ slug, difficulty: 'easy' });
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

  it('lets the same puzzle re-deploy its own path — an overwrite is not a conflict', async () => {
    const slug = `mine-${token()}`;
    const { versionId } = await deployablePuzzle(`Mine ${token()}`);

    const first = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 'easy' });
    expect(first.status).toBe(200);

    const second = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 'hard' });
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

  it('asks for a manual path when the name derives nothing (Q13)', async () => {
    const { versionId } = await deployablePuzzle(`汉字项目 ${token()}`);
    const res = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', difficulty: 'medium' });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('无法根据名称生成访问路径，请手动填写（仅限小写字母、数字与连字符）');

    // …and taking the hint works.
    const typed = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ name: '神秘古堡', slug: `mystery-castle-${token()}`, difficulty: 'medium' });
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
      .send({ name: puzzleName, difficulty: 'medium' });
    expect(first.status).toBe(200);

    // 从 v1 fork 出草稿，直接发布成 v2（名册已复制，校验能过）。
    const forked = await api.post(`/api/puzzles/${versionId}/versions/1/fork`);
    const forkedId = forked.body.data.id as number;
    createdPuzzles.push(forkedId);
    const v2 = await publishPuzzle(forkedId);

    // 中段不带版本号，所以名称相同 ⇒ 默认路径相同。
    const clash = await api
      .post(`/api/puzzles/${v2}/games`)
      .send({ name: puzzleName, difficulty: 'medium' });
    expect(clash.status).toBe(400);
    expect(clash.body.message).toContain('已被占用');

    // 作者在中段里写点别的即可。
    const ok = await api
      .post(`/api/puzzles/${v2}/games`)
      .send({ name: puzzleName, slug: uniqueSlug('same-second'), difficulty: 'medium' });
    expect(ok.status).toBe(200);
  });

  it('取消部署是假删：列表消失、玩家链接 404、同一 slug 可以再用', async () => {
    const { draftId, versionId } = await deployablePuzzle(`Cancel ${uniqueCode('p')}`);
    const slug = uniqueSlug('cancel');
    const deploy = await api
      .post(`/api/puzzles/${versionId}/games`)
      .send({ slug, difficulty: 'easy' });
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
      .send({ slug, difficulty: 'easy' });
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
});
