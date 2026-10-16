import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode } from '@loredoku/shared';
import type { MapDraft } from '@loredoku/shared';
import { api } from './helpers';
import { resolveUploadPath } from '../src/utils/paths';

const createdProjects: number[] = [];
const createdItems: number[] = [];
const createdCharacters: number[] = [];
const uploadedAvatarDirs: string[] = [];
const uploadedGameCoverDirs: string[] = [];

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

  // v0.3.8 FEAT-D02: the map style block round-trips through the draft JSON.
  it('persists and reloads the map style, and still accepts a style-less draft', async () => {
    const projectId = await createProject({ name: `Style ${uniqueCode('p')}`, gridSize: 6 });

    const initial = await api.get(`/api/projects/${projectId}/map`);
    const updatedAt = initial.body.data.updatedAt as string;

    const draft = {
      ...emptyDraft(6),
      version: 2,
      style: {
        cellSize: 150,
        canvasFrame: { width: 8, color: '#112233' },
        regionHighlight: { width: 6, color: '#0B7E74' },
        linkageColors: [
          { key: 'red', label: '红', color: '#EF9A9A' },
          { key: 'teal', label: '青', color: '#0B7E74' },
        ],
      },
    };
    const saved = await api.put(`/api/projects/${projectId}/map`).send({ data: draft, updatedAt });
    expect(saved.status).toBe(200);
    expect(saved.body.data.draft.style.cellSize).toBe(150);
    expect(saved.body.data.draft.style.canvasFrame.color).toBe('#112233');

    const reloaded = await api.get(`/api/projects/${projectId}/map`);
    expect(reloaded.body.data.draft.style.regionHighlight.width).toBe(6);
    expect(reloaded.body.data.draft.style.linkageColors.map((entry: { key: string }) => entry.key)).toEqual(
      ['red', 'teal'],
    );

    // A v0.3.7-era payload (no style block) is still accepted.
    const legacy = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ data: emptyDraft(6), updatedAt: reloaded.body.data.updatedAt as string });
    expect(legacy.status).toBe(200);
    expect(legacy.body.data.draft.style).toBeUndefined();
  });

  it('rejects a style whose linkage colour is not in the palette', async () => {
    const projectId = await createProject({ name: `StyleBad ${uniqueCode('p')}`, gridSize: 6 });
    const characterId = await createCharacterWithAvatar();
    const draft = emptyDraft(6);
    draft.characterSlots[0] = {
      characterId,
      themeColor: '#FFFFFF',
      clue: '',
      linkages: [{ type: 'cell', cells: [[0, 0]], effect: 'highlight', color: 'teal' }],
    };
    const res = await api.put(`/api/projects/${projectId}/map`).send({ data: draft });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
  });

  it('rejects an out-of-range style value', async () => {
    const projectId = await createProject({ name: `StyleRange ${uniqueCode('p')}`, gridSize: 6 });
    const res = await api
      .put(`/api/projects/${projectId}/map`)
      .send({ data: { ...emptyDraft(6), style: { cellSize: 500 } } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);
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
    const characterId = await createCharacterWithAvatar();

    const draft = emptyDraft(6);
    draft.characterSlots[0] = { characterId };
    // P3: a region must be a connected blob ((0,0) and (3,3) are not adjacent).
    draft.regions = [
      {
        id: 'rg_split',
        name: '断裂区',
        color: '#000000',
        borderWidth: 6,
        fillOpacity: 0,
        cells: [[0, 0], [3, 3]],
      },
    ];
    await api.put(`/api/projects/${projectId}/map`).send({ data: draft });

    const res = await api.post(`/api/projects/${projectId}/versions`).send({});
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

  // OPT-904 (docs/v0.3.4.md §4.1): a non-standable item IS allowed on the
  // object layer — the v0.3.1 `object_can_stand` rule was removed.
  it('OPT-904: publishes a non-standable item placed on the object layer', async () => {
    const projectId = await createProject({ name: `NoStand ${uniqueCode('p')}`, gridSize: 6 });
    const characterId = await createCharacterWithAvatar();
    const itemId = await createItem({ category: 'object', canStand: false });

    const draft = emptyDraft(6);
    draft.cells['2,2'] = { object: { itemId, w: 2, h: 2 } };
    draft.characterSlots[0] = { characterId };
    const saved = await api.put(`/api/projects/${projectId}/map`).send({ data: draft });
    expect(saved.status).toBe(200);

    const res = await api.post(`/api/projects/${projectId}/versions`).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.versionNo).toBe(1);
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

// OPT-905 (docs/v0.3.4.md §5): the works table lists every map's works.
describe('works API (OPT-905)', () => {
  it('lists published works from all maps together with their map names', async () => {
    const projectA = await createProject({ name: `WorksA ${uniqueCode('p')}`, gridSize: 6 });
    const projectB = await createProject({ name: `WorksB ${uniqueCode('p')}`, gridSize: 6 });
    const characterId = await createCharacterWithAvatar();

    const draft = emptyDraft(6);
    draft.characterSlots[0] = { characterId };
    await api.put(`/api/projects/${projectA}/map`).send({ data: draft });
    await api.put(`/api/projects/${projectB}/map`).send({ data: draft });

    await api.post(`/api/projects/${projectA}/versions`).send({ notes: 'A1' });
    await api.post(`/api/projects/${projectB}/versions`).send({ notes: 'B1' });

    const res = await api.get('/api/versions');
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{
      projectId: number;
      projectName: string;
      versionNo: number;
      notes: string | null;
      publishedAt: string;
      deployed: boolean;
    }>;
    const a = rows.find((row) => row.projectId === projectA);
    const b = rows.find((row) => row.projectId === projectB);
    expect(a?.projectName).toContain('WorksA');
    expect(a?.versionNo).toBe(1);
    expect(b?.projectName).toContain('WorksB');
    // FEAT-G02: a freshly published work carries no badge. Scoped to the two
    // rows this test created — the assertion must not depend on what else
    // lives in the (shared, manually seeded) dev database.
    expect(a?.deployed).toBe(false);
    expect(b?.deployed).toBe(false);
    // §5.3 default ordering: newest first.
    expect(rows[0]!.publishedAt >= rows[rows.length - 1]!.publishedAt).toBe(true);
  });
});

// ---- v0.4.0 FEAT-G02: deployed games (docs/v0.4.0.md §5) ----
describe('games API (FEAT-G02)', () => {
  /** A publishable draft: one participant with an avatar, nothing else. */
  async function publishableProject(name: string): Promise<{ projectId: number; draft: MapDraft }> {
    const projectId = await createProject({ name, gridSize: 6 });
    const characterId = await createCharacterWithAvatar();
    const draft = emptyDraft(6);
    draft.characterSlots[0] = { characterId };
    await api.put(`/api/projects/${projectId}/map`).send({ data: draft });
    await api.post(`/api/projects/${projectId}/versions`).send({ notes: 'v1' });
    return { projectId, draft };
  }

  it('deploys a published work and lists it on the games home page', async () => {
    const { projectId } = await publishableProject(`Game ${uniqueCode('p')}`);

    const deploy = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 1, name: '神秘古堡', difficulty: 'hard' });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.name).toBe('神秘古堡');
    expect(deploy.body.data.difficulty).toBe('hard');
    expect(deploy.body.data.gridSize).toBe(6);
    expect(deploy.body.data.coverUrl).toBeNull();

    const list = await api.get('/api/games');
    expect(list.status).toBe(200);
    const rows = list.body.data as Array<{ id: number; projectId: number; name: string }>;
    const row = rows.find((entry) => entry.projectId === projectId);
    expect(row?.name).toBe('神秘古堡');

    // FEAT-G02 §5.1: the works table now badges the map as deployed.
    const works = await api.get('/api/versions');
    const work = (works.body.data as Array<{ projectId: number; deployed: boolean }>).find(
      (entry) => entry.projectId === projectId,
    );
    expect(work?.deployed).toBe(true);

    const detail = await api.get(`/api/games/${deploy.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.data.characterSlots[0]).not.toBeNull();
  });

  it('defaults the game name to the map name and the difficulty to medium', async () => {
    const name = `Defaulted ${uniqueCode('p')}`;
    const { projectId } = await publishableProject(name);

    const deploy = await api.post(`/api/projects/${projectId}/games`).send({ versionNo: 1 });
    expect(deploy.status).toBe(200);
    expect(deploy.body.data.name).toBe(name);
    expect(deploy.body.data.difficulty).toBe('medium');
  });

  it('keeps one game per map — a later deploy overwrites the earlier one', async () => {
    const { projectId } = await publishableProject(`Overwrite ${uniqueCode('p')}`);

    const first = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 1, name: '第一版', difficulty: 'easy' });
    expect(first.status).toBe(200);

    // Publish a second version of the same map, then deploy that one.
    await api.post(`/api/projects/${projectId}/versions`).send({ notes: 'v2' });
    const second = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 2, name: '第二版', difficulty: 'expert' });
    expect(second.status).toBe(200);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.body.data.versionNo).toBe(2);

    const list = await api.get('/api/games');
    const rows = (list.body.data as Array<{ id: number; projectId: number }>).filter(
      (entry) => entry.projectId === projectId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(second.body.data.id);
  });

  it('rejects a deploy of a version that does not exist', async () => {
    const { projectId } = await publishableProject(`Missing ${uniqueCode('p')}`);
    const res = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 99, name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('rejects an unknown difficulty and an empty name', async () => {
    const { projectId } = await publishableProject(`Invalid ${uniqueCode('p')}`);
    const badDifficulty = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 1, difficulty: 'nightmare' });
    expect(badDifficulty.status).toBe(400);

    const emptyName = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 1, name: '   ' });
    expect(emptyName.status).toBe(400);
  });

  it('404s for an unknown game id', async () => {
    const res = await api.get('/api/games/999999999');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });

  it('uploads a cover for a deployed game', async () => {
    const { projectId } = await publishableProject(`Cover ${uniqueCode('p')}`);
    const deploy = await api
      .post(`/api/projects/${projectId}/games`)
      .send({ versionNo: 1, name: '带封面' });
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

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  if (createdProjects.length) await db('map_projects').whereIn('id', createdProjects).del();
  if (createdItems.length) await db('items').whereIn('id', createdItems).del();
  if (createdCharacters.length) await db('characters').whereIn('id', createdCharacters).del();
  await db.destroy();
  for (const dir of uploadedAvatarDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  for (const dir of uploadedGameCoverDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
