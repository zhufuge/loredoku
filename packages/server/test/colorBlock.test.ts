import { afterAll, describe, expect, it } from 'vitest';
import { rm } from 'node:fs/promises';
import { ErrorCode } from '@loredoku/shared';
import { api } from './helpers';
import { resolveUploadPath } from '../src/utils/paths';

/**
 * v0.5.1 FEAT-L01 / FEAT-L02 — colour blocks, end to end through the HTTP API.
 *
 * The two rules that matter:
 * - `bgColor` round-trips through create / patch and is rejected when malformed;
 * - deleting the media no longer deactivates an entry that is a colour block
 *   (the v0.3.5 OPT-305 rule is narrowed, not removed).
 *
 * 物品 and 角色 are the same contract twice, so they share one table.
 */

const created: Array<{ table: 'items' | 'characters'; id: number }> = [];
const uploadedDirs: string[] = [];

/** 1×1 PNG — the smallest thing the image pipeline accepts. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

const subjects = [
  {
    kind: 'items',
    table: 'items' as const,
    media: 'image',
    url: 'imageUrl',
    uploadPath: 'items',
    colour: '#FF8800',
    create: (body: Record<string, unknown> = {}) =>
      api.post('/api/items').send({ code: uniqueCode('item'), name: 'Item', ...body }),
  },
  {
    kind: 'characters',
    table: 'characters' as const,
    media: 'avatar',
    url: 'avatarUrl',
    uploadPath: 'characters',
    colour: '#123456',
    create: (body: Record<string, unknown> = {}) =>
      api.post('/api/characters').send({ code: uniqueCode('char'), name: 'Character', ...body }),
  },
];

describe.each(subjects)('$kind 纯色块（v0.5.1 FEAT-L01 / FEAT-L02）', (s) => {
  async function create(body: Record<string, unknown> = {}): Promise<number> {
    const res = await s.create(body);
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    created.push({ table: s.table, id });
    return id;
  }

  async function upload(id: number): Promise<void> {
    const res = await api.post(`/api/${s.kind}/${id}/${s.media}`).attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(200);
    uploadedDirs.push(resolveUploadPath(`${s.uploadPath}/${id}`));
  }

  it('creates with a colour and reads it back', async () => {
    const res = await s.create({ name: '色块', bgColor: s.colour });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    created.push({ table: s.table, id });
    expect(res.body.data.bgColor).toBe(s.colour);

    const detail = await api.get(`/api/${s.kind}/${id}`);
    expect(detail.body.data.bgColor).toBe(s.colour);
  });

  it('omits bgColor when it is not given', async () => {
    const id = await create();
    const detail = await api.get(`/api/${s.kind}/${id}`);
    expect(detail.body.data.bgColor).toBeNull();
  });

  it('sets and clears the colour on patch', async () => {
    const id = await create();
    const set = await api.patch(`/api/${s.kind}/${id}`).send({ bgColor: '#00AABB' });
    expect(set.body.data.bgColor).toBe('#00AABB');
    const cleared = await api.patch(`/api/${s.kind}/${id}`).send({ bgColor: null });
    expect(cleared.body.data.bgColor).toBeNull();
  });

  it('rejects a malformed colour', async () => {
    const posted = await s.create({ name: 'Bad', bgColor: '#GGG' });
    expect(posted.status).toBe(400);
    expect(posted.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const id = await create();
    const patched = await api.patch(`/api/${s.kind}/${id}`).send({ bgColor: 'white' });
    expect(patched.status).toBe(400);
  });

  it('keeps a colour block active after the media is deleted', async () => {
    const id = await create({ bgColor: '#FFFFFF' });
    await upload(id);
    const activated = await api.patch(`/api/${s.kind}/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/${s.kind}/${id}/${s.media}`);
    expect(removed.status).toBe(200);
    expect(removed.body.data[s.url]).toBeNull();
    // A colour block does not depend on the media.
    expect(removed.body.data.bgColor).toBe('#FFFFFF');
    expect(removed.body.data.isActive).toBe(true);
  });

  it('still deactivates a media-only entry when the media is deleted', async () => {
    const id = await create();
    await upload(id);
    const activated = await api.patch(`/api/${s.kind}/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/${s.kind}/${id}/${s.media}`);
    expect(removed.status).toBe(200);
    // OPT-305 unchanged for entries that are not colour blocks.
    expect(removed.body.data.bgColor).toBeNull();
    expect(removed.body.data.isActive).toBe(false);
  });
});

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  for (const { table, id } of created) {
    await db(table).where('id', id).del();
  }
  await db.destroy();
  for (const dir of uploadedDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
