import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode } from '@murdoku/shared';
import type { MapDraft } from '@murdoku/shared';
import { api } from './helpers';
import { resolveUploadPath } from '../src/utils/paths';

const createdProjects: number[] = [];
const createdItems: number[] = [];
const createdCharacters: number[] = [];
const uploadedAvatarDirs: string[] = [];

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function emptyDraft(gridSize: number): MapDraft {
  return {
    version: 1,
    gridSize,
    cells: {},
    regions: [],
    characterSlots: Array.from({ length: gridSize }, () => null),
  };
}

async function createProject(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api.post('/api/projects').send(body);
  expect(res.status).toBe(200);
  expect(res.body.code).toBe(ErrorCode.OK);
  const id = res.body.data.id as number;
  createdProjects.push(id);
  return id;
}

async function createItem(body: Record<string, unknown> = {}): Promise<number> {
  const res = await api
    .post('/api/items')
    .send({ code: uniqueCode('item'), name: 'Item', ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdItems.push(id);
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

/**
 * v0.3.1 P2: only characters with an avatar count as participants, so a
 * publishable draft needs a character whose avatar has been uploaded.
 */
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

describe('projects API', () => {
  it('creates a project with the default grid size', async () => {
    const res = await api.post('/api/projects').send({ name: `Smoke ${uniqueCode('p')}` });
    expect(res.status).toBe(200);
    expect(res.body.data.gridSize).toBe(6);
    createdProjects.push(res.body.data.id);
  });

  it('rejects an out-of-range grid size', async () => {
    const res = await api.post('/api/projects').send({ name: `Bad ${uniqueCode('p')}`, gridSize: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('lists, reads, updates, duplicates and deletes a project', async () => {
    const name = `Lifecycle ${uniqueCode('p')}`;
    const id = await createProject({ name, gridSize: 8 });

    const list = await api.get('/api/projects');
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body.data.list)).toBe(true);
    expect(list.body.data.list.some((p: { id: number }) => p.id === id)).toBe(true);

    const detail = await api.get(`/api/projects/${id}`);
    expect(detail.body.data.gridSize).toBe(8);

    const updated = await api.patch(`/api/projects/${id}`).send({ name: `${name} v2` });
    expect(updated.body.data.name).toBe(`${name} v2`);

    const dup = await api.post(`/api/projects/${id}/duplicate`);
    expect(dup.status).toBe(200);
    expect(dup.body.data.gridSize).toBe(8);
    createdProjects.push(dup.body.data.id);

    const removed = await api.delete(`/api/projects/${id}`);
    expect(removed.status).toBe(200);
    const missing = await api.get(`/api/projects/${id}`);
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('items API', () => {
  it('creates an item with triggers and manages its lifecycle', async () => {
    const res = await api.post('/api/items').send({
      code: uniqueCode('candlestick'),
      name: 'Candlestick',
      category: 'object',
      widthCells: 2,
      heightCells: 1,
      canStand: true,
      triggers: [
        { triggerKey: 'material', triggerValue: 'brass', effectType: 'highlight', effectConfig: {} },
      ],
    });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    createdItems.push(id);
    expect(res.body.data.triggers).toHaveLength(1);
    expect(res.body.data.widthCells).toBe(2);

    const patched = await api.patch(`/api/items/${id}`).send({ name: 'Candlestick Holder' });
    expect(patched.body.data.name).toBe('Candlestick Holder');

    const replaced = await api
      .put(`/api/items/${id}/triggers`)
      .send([
        { triggerKey: 'color', triggerValue: 'gold', effectType: 'glow', effectConfig: {} },
        { triggerKey: 'state', triggerValue: 'lit', effectType: 'blink', effectConfig: {} },
      ]);
    expect(replaced.body.data.triggers).toHaveLength(2);

    const usages = await api.get(`/api/items/${id}/usages`);
    expect(usages.status).toBe(200);
    expect(usages.body.data).toEqual([]);

    const removed = await api.delete(`/api/items/${id}`);
    expect(removed.status).toBe(200);
  });

  it('rejects an invalid item code', async () => {
    const res = await api.post('/api/items').send({ code: 'bad code', name: 'Bad' });
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
  it('loads, saves with optimistic concurrency, and rejects stale writes', async () => {
    const projectId = await createProject({ name: `Map ${uniqueCode('p')}`, gridSize: 6 });
    const itemId = await createItem({ category: 'object', canStand: true });

    const initial = await api.get(`/api/projects/${projectId}/map`);
    expect(initial.status).toBe(200);
    expect(initial.body.data.draft.cells).toEqual({});
    const updatedAt = initial.body.data.updatedAt as string;

    const draft = emptyDraft(6);
    draft.cells['0,0'] = { object: { itemId, w: 1, h: 1 } };
    draft.regions = [
      { id: 'rg_a', name: 'Lounge', color: '#000000', borderWidth: 4, fillOpacity: 1, cells: [[0, 0]] },
    ];

    const saved = await api.put(`/api/projects/${projectId}/map`).send({ data: draft, updatedAt });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.cells['0,0'].object.itemId).toBe(itemId);
    expect(saved.body.data.draft.regions).toHaveLength(1);

    const loaded = await api.get(`/api/projects/${projectId}/map`);
    expect(loaded.body.data.draft.regions[0].name).toBe('Lounge');

    const stale = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ data: emptyDraft(6), updatedAt });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe(ErrorCode.DRAFT_CONFLICT);
  });

  it('rejects out-of-bounds cells and unknown item references', async () => {
    const projectId = await createProject({ name: `Bounds ${uniqueCode('p')}`, gridSize: 4 });

    const outOfBounds = emptyDraft(4);
    outOfBounds.cells['10,0'] = { background: { itemId: await createItem({ category: 'background' }) } };
    const boundsRes = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ data: outOfBounds });
    expect(boundsRes.status).toBe(400);
    expect(boundsRes.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const unknown = emptyDraft(4);
    unknown.cells['0,0'] = { object: { itemId: 99999999, w: 1, h: 1 } };
    const unknownRes = await api.put(`/api/projects/${projectId}/map`).send({ data: unknown });
    expect(unknownRes.status).toBe(400);
    expect(unknownRes.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('rejects overlapping regions within one save', async () => {
    const projectId = await createProject({ name: `Overlap ${uniqueCode('p')}`, gridSize: 5 });
    const draft = emptyDraft(5);
    draft.regions = [
      { id: 'rg_a', name: 'A', color: '#000000', borderWidth: 4, fillOpacity: 1, cells: [[0, 0]] },
      { id: 'rg_b', name: 'B', color: '#000000', borderWidth: 4, fillOpacity: 1, cells: [[0, 0]] },
    ];
    const res = await api.put(`/api/projects/${projectId}/map`).send({ data: draft });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCode.REGION_OVERLAP);
  });

  it('manages individual regions and blocks conflicts', async () => {
    const projectId = await createProject({ name: `Regions ${uniqueCode('p')}`, gridSize: 5 });

    const first = await api.post(`/api/projects/${projectId}/regions`).send({
      name: 'Study',
      color: '#3b82f6',
      borderWidth: 4,
      fillOpacity: 0.1,
      cells: [
        [0, 0],
        [1, 0],
      ],
    });
    expect(first.status).toBe(200);
    const regionId = first.body.data.id as string;
    expect(typeof regionId).toBe('string');

    const conflict = await api
      .post(`/api/projects/${projectId}/regions`)
      .send({ name: 'Clash', cells: [[1, 0]] });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBe(ErrorCode.REGION_OVERLAP);

    const list = await api.get(`/api/projects/${projectId}/regions`);
    expect(list.body.data).toHaveLength(1);

    const patched = await api
      .patch(`/api/projects/${projectId}/regions/${regionId}`)
      .send({ name: 'Library' });
    expect(patched.body.data.name).toBe('Library');

    const removed = await api.delete(`/api/projects/${projectId}/regions/${regionId}`);
    expect(removed.status).toBe(200);
    const after = await api.get(`/api/projects/${projectId}/regions`);
    expect(after.body.data).toHaveLength(0);
  });

  it('returns 404 for a missing project', async () => {
    const res = await api.get('/api/projects/99999999/map');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

describe('versions API', () => {
  it('publishes, lists, reads and restores a draft from a version', async () => {
    const projectId = await createProject({ name: `Versions ${uniqueCode('p')}`, gridSize: 6 });
    const itemId = await createItem({ category: 'object', canStand: true });
    // v0.3.1 P1/P2: publishing needs at least one participant whose character has an avatar.
    const characterId = await createCharacterWithAvatar();

    const draft = emptyDraft(6);
    draft.cells['1,1'] = { object: { itemId, w: 1, h: 1 } };
    draft.characterSlots[0] = { characterId };
    await api.put(`/api/projects/${projectId}/map`).send({ data: draft });

    const published = await api.post(`/api/projects/${projectId}/versions`).send({ notes: 'first' });
    expect(published.status).toBe(200);
    expect(published.body.data.versionNo).toBe(1);
    expect(published.body.data.participantCount).toBe(1);

    const list = await api.get(`/api/projects/${projectId}/versions`);
    expect(list.body.data).toHaveLength(1);

    const detail = await api.get(`/api/projects/${projectId}/versions/1`);
    expect(detail.body.data.data.cells['1,1'].object.itemId).toBe(itemId);

    await api.put(`/api/projects/${projectId}/map`).send({ data: emptyDraft(6) });
    const restored = await api.post(`/api/projects/${projectId}/versions/1/draft`);
    expect(restored.status).toBe(200);
    expect(restored.body.data.draft.cells['1,1'].object.itemId).toBe(itemId);
  });

  it('rejects publishing when validation fails', async () => {
    const projectId = await createProject({ name: `PubFail ${uniqueCode('p')}`, gridSize: 6 });
    const itemId = await createItem({ category: 'object', canStand: false });

    const draft = emptyDraft(6);
    draft.cells['0,0'] = { object: { itemId, w: 1, h: 1 } };
    await api.put(`/api/projects/${projectId}/map`).send({ data: draft });

    const res = await api.post(`/api/projects/${projectId}/versions`).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.PUBLISH_VALIDATION_FAILED);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('rejects publishing when the only participant has no avatar', async () => {
    const projectId = await createProject({ name: `NoAvatar ${uniqueCode('p')}`, gridSize: 6 });
    const characterId = await createCharacter();

    const draft = emptyDraft(6);
    draft.characterSlots[0] = { characterId };
    await api.put(`/api/projects/${projectId}/map`).send({ data: draft });

    const res = await api.post(`/api/projects/${projectId}/versions`).send({});
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(ErrorCode.PUBLISH_VALIDATION_FAILED);
    expect(
      (res.body.data as Array<{ rule: string }>).some(
        (violation) => violation.rule === 'participant_required',
      ),
    ).toBe(true);
  });
});

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  if (createdProjects.length) await db('map_projects').whereIn('id', createdProjects).del();
  if (createdItems.length) await db('items').whereIn('id', createdItems).del();
  if (createdCharacters.length) await db('characters').whereIn('id', createdCharacters).del();
  await db.destroy();
  for (const dir of uploadedAvatarDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
