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
 * - deleting the image no longer deactivates an entry that is a colour block
 *   (the v0.3.5 OPT-305 rule is narrowed, not removed).
 */

const createdItems: number[] = [];
const createdCharacters: number[] = [];
const uploadedDirs: string[] = [];

/** 1×1 PNG — the smallest thing the image pipeline accepts. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
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

async function uploadItemImage(id: number): Promise<void> {
  const res = await api.post(`/api/items/${id}/image`).attach('file', TINY_PNG, 'i.png');
  expect(res.status).toBe(200);
  uploadedDirs.push(resolveUploadPath(`items/${id}`));
}

async function uploadCharacterAvatar(id: number): Promise<void> {
  const res = await api.post(`/api/characters/${id}/avatar`).attach('file', TINY_PNG, 'a.png');
  expect(res.status).toBe(200);
  uploadedDirs.push(resolveUploadPath(`characters/${id}`));
}

describe('items 纯色块（v0.5.1 FEAT-L01）', () => {
  it('creates an item with a colour and reads it back', async () => {
    const res = await api
      .post('/api/items')
      .send({ code: uniqueCode('block'), name: '色块', bgColor: '#FF8800' });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    createdItems.push(id);
    expect(res.body.data.bgColor).toBe('#FF8800');

    const detail = await api.get(`/api/items/${id}`);
    expect(detail.body.data.bgColor).toBe('#FF8800');
  });

  it('omits bgColor when it is not given', async () => {
    const id = await createItem();
    const detail = await api.get(`/api/items/${id}`);
    expect(detail.body.data.bgColor).toBeNull();
  });

  it('sets and clears the colour on patch', async () => {
    const id = await createItem();
    const set = await api.patch(`/api/items/${id}`).send({ bgColor: '#00AABB' });
    expect(set.body.data.bgColor).toBe('#00AABB');
    const cleared = await api.patch(`/api/items/${id}`).send({ bgColor: null });
    expect(cleared.body.data.bgColor).toBeNull();
  });

  it('rejects a malformed colour', async () => {
    const res = await api
      .post('/api/items')
      .send({ code: uniqueCode('bad'), name: 'Bad', bgColor: '#GGG' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const id = await createItem();
    const patched = await api.patch(`/api/items/${id}`).send({ bgColor: 'white' });
    expect(patched.status).toBe(400);
  });

  it('keeps a colour block active after the image is deleted', async () => {
    const id = await createItem({ bgColor: '#FFFFFF' });
    await uploadItemImage(id);
    const activated = await api.patch(`/api/items/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/items/${id}/image`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.imageUrl).toBeNull();
    // FEAT-L01 §1.2: a colour block does not depend on the image.
    expect(removed.body.data.bgColor).toBe('#FFFFFF');
    expect(removed.body.data.isActive).toBe(true);
  });

  it('still deactivates an image-only item when the image is deleted', async () => {
    const id = await createItem();
    await uploadItemImage(id);
    const activated = await api.patch(`/api/items/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/items/${id}/image`);
    expect(removed.status).toBe(200);
    // OPT-305 unchanged for entries that are not colour blocks.
    expect(removed.body.data.bgColor).toBeNull();
    expect(removed.body.data.isActive).toBe(false);
  });
});

describe('characters 纯色块（v0.5.1 FEAT-L02）', () => {
  it('creates a character with a colour and reads it back', async () => {
    const res = await api
      .post('/api/characters')
      .send({ code: uniqueCode('blockc'), name: '色块人', bgColor: '#123456' });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    createdCharacters.push(id);
    expect(res.body.data.bgColor).toBe('#123456');

    const detail = await api.get(`/api/characters/${id}`);
    expect(detail.body.data.bgColor).toBe('#123456');
  });

  it('omits bgColor when it is not given', async () => {
    const id = await createCharacter();
    const detail = await api.get(`/api/characters/${id}`);
    expect(detail.body.data.bgColor).toBeNull();
  });

  it('sets and clears the colour on patch', async () => {
    const id = await createCharacter();
    const set = await api.patch(`/api/characters/${id}`).send({ bgColor: '#ABCDEF' });
    expect(set.body.data.bgColor).toBe('#ABCDEF');
    const cleared = await api.patch(`/api/characters/${id}`).send({ bgColor: null });
    expect(cleared.body.data.bgColor).toBeNull();
  });

  it('rejects a malformed colour', async () => {
    const res = await api
      .post('/api/characters')
      .send({ code: uniqueCode('badc'), name: 'Bad', bgColor: '#GGG' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const id = await createCharacter();
    const patched = await api.patch(`/api/characters/${id}`).send({ bgColor: 'red' });
    expect(patched.status).toBe(400);
  });

  it('keeps a colour block active after the avatar is deleted', async () => {
    const id = await createCharacter({ bgColor: '#FFFFFF' });
    await uploadCharacterAvatar(id);
    const activated = await api.patch(`/api/characters/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/characters/${id}/avatar`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.avatarUrl).toBeNull();
    // FEAT-L02: a colour block does not depend on the avatar.
    expect(removed.body.data.bgColor).toBe('#FFFFFF');
    expect(removed.body.data.isActive).toBe(true);
  });

  it('still deactivates an avatar-only character when the avatar is deleted', async () => {
    const id = await createCharacter();
    await uploadCharacterAvatar(id);
    const activated = await api.patch(`/api/characters/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/characters/${id}/avatar`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.bgColor).toBeNull();
    expect(removed.body.data.isActive).toBe(false);
  });
});

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  if (createdItems.length) await db('items').whereIn('id', createdItems).del();
  if (createdCharacters.length) await db('characters').whereIn('id', createdCharacters).del();
  await db.destroy();
  for (const dir of uploadedDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
