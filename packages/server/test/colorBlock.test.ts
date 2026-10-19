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
 * 角色 carries the colour on the row itself. 资源 carries it on a **form** since
 * v0.6.1, so its contract runs through `/api/assets/:id/forms/:formId` — same
 * rules, one level deeper.
 */

const created: Array<{ table: 'assets' | 'characters'; id: number }> = [];
const uploadedDirs: string[] = [];

/** 1×1 PNG — the smallest thing the image pipeline accepts. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

interface AssetFixture {
  id: number;
  formId: number;
  bgColor: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

function readAsset(body: { data: Record<string, unknown> }): AssetFixture {
  const forms = body.data.forms as Array<Record<string, unknown>>;
  const form = forms[0]!;
  return {
    id: body.data.id as number,
    formId: form.id as number,
    bgColor: form.bgColor as string | null,
    imageUrl: form.imageUrl as string | null,
    isActive: body.data.isActive as boolean,
  };
}

describe('assets 纯色块（形态级）', () => {
  async function create(body: Record<string, unknown> = {}): Promise<AssetFixture> {
    const res = await api
      .post('/api/assets')
      .send({ code: uniqueCode('block'), name: 'Asset', ...body });
    expect(res.status).toBe(200);
    const asset = readAsset(res.body);
    created.push({ table: 'assets', id: asset.id });
    return asset;
  }

  async function upload(asset: AssetFixture): Promise<void> {
    const res = await api
      .post(`/api/assets/${asset.id}/forms/${asset.formId}/image`)
      .attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(200);
    uploadedDirs.push(resolveUploadPath(`assets/${asset.id}/forms/${asset.formId}`));
  }

  async function setActive(asset: AssetFixture, isActive: boolean): Promise<AssetFixture> {
    const res = await api.patch(`/api/assets/${asset.id}`).send({ isActive });
    expect(res.status).toBe(200);
    return readAsset(res.body);
  }

  it('creates with a colour and reads it back on the initial form', async () => {
    const asset = await create({ bgColor: '#FF8800' });
    expect(asset.bgColor).toBe('#FF8800');

    const detail = await api.get(`/api/assets/${asset.id}`);
    expect(readAsset(detail.body).bgColor).toBe('#FF8800');
  });

  it('omits bgColor when it is not given', async () => {
    const asset = await create();
    expect(asset.bgColor).toBeNull();
  });

  it('sets and clears the colour on the form', async () => {
    const asset = await create();
    const set = await api
      .patch(`/api/assets/${asset.id}/forms/${asset.formId}`)
      .send({ bgColor: '#00AABB' });
    expect(set.body.data.bgColor).toBe('#00AABB');
    const cleared = await api
      .patch(`/api/assets/${asset.id}/forms/${asset.formId}`)
      .send({ bgColor: null });
    expect(cleared.body.data.bgColor).toBeNull();
  });

  it('rejects a malformed colour', async () => {
    const posted = await api
      .post('/api/assets')
      .send({ code: uniqueCode('bad'), name: 'Bad', bgColor: '#GGG' });
    expect(posted.status).toBe(400);
    expect(posted.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const asset = await create();
    const patched = await api
      .patch(`/api/assets/${asset.id}/forms/${asset.formId}`)
      .send({ bgColor: 'white' });
    expect(patched.status).toBe(400);
  });

  it('keeps a colour block active after the media is deleted', async () => {
    const asset = await create({ bgColor: '#FFFFFF' });
    await upload(asset);
    expect((await setActive(asset, true)).isActive).toBe(true);

    const removed = await api.delete(`/api/assets/${asset.id}/forms/${asset.formId}/image`);
    expect(removed.status).toBe(200);
    const after = readAsset(removed.body);
    // A colour block does not depend on the media.
    expect(after.imageUrl).toBeNull();
    expect(after.bgColor).toBe('#FFFFFF');
    expect(after.isActive).toBe(true);
  });

  it('still deactivates a media-only asset when the last look is deleted', async () => {
    const asset = await create();
    await upload(asset);
    expect((await setActive(asset, true)).isActive).toBe(true);

    const removed = await api.delete(`/api/assets/${asset.id}/forms/${asset.formId}/image`);
    expect(removed.status).toBe(200);
    const after = readAsset(removed.body);
    // OPT-305 unchanged for assets that are not colour blocks.
    expect(after.bgColor).toBeNull();
    expect(after.isActive).toBe(false);
  });
});

describe('characters 纯色块（v0.5.1 FEAT-L02）', () => {
  async function create(body: Record<string, unknown> = {}): Promise<number> {
    const res = await api
      .post('/api/characters')
      .send({ code: uniqueCode('char'), name: 'Character', ...body });
    expect(res.status).toBe(200);
    const id = res.body.data.id as number;
    created.push({ table: 'characters', id });
    return id;
  }

  async function upload(id: number): Promise<void> {
    const res = await api.post(`/api/characters/${id}/avatar`).attach('file', TINY_PNG, 'x.png');
    expect(res.status).toBe(200);
    uploadedDirs.push(resolveUploadPath(`characters/${id}`));
  }

  it('creates with a colour and reads it back', async () => {
    const id = await create({ bgColor: '#123456' });
    const detail = await api.get(`/api/characters/${id}`);
    expect(detail.body.data.bgColor).toBe('#123456');
  });

  it('omits bgColor when it is not given', async () => {
    const id = await create();
    const detail = await api.get(`/api/characters/${id}`);
    expect(detail.body.data.bgColor).toBeNull();
  });

  it('sets and clears the colour on patch', async () => {
    const id = await create();
    const set = await api.patch(`/api/characters/${id}`).send({ bgColor: '#00AABB' });
    expect(set.body.data.bgColor).toBe('#00AABB');
    const cleared = await api.patch(`/api/characters/${id}`).send({ bgColor: null });
    expect(cleared.body.data.bgColor).toBeNull();
  });

  it('rejects a malformed colour', async () => {
    const posted = await api
      .post('/api/characters')
      .send({ code: uniqueCode('bad'), name: 'Bad', bgColor: '#GGG' });
    expect(posted.status).toBe(400);
    expect(posted.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    const id = await create();
    const patched = await api.patch(`/api/characters/${id}`).send({ bgColor: 'white' });
    expect(patched.status).toBe(400);
  });

  it('keeps a colour block active after the media is deleted', async () => {
    const id = await create({ bgColor: '#FFFFFF' });
    await upload(id);
    const activated = await api.patch(`/api/characters/${id}`).send({ isActive: true });
    expect(activated.body.data.isActive).toBe(true);

    const removed = await api.delete(`/api/characters/${id}/avatar`);
    expect(removed.status).toBe(200);
    expect(removed.body.data.avatarUrl).toBeNull();
    expect(removed.body.data.bgColor).toBe('#FFFFFF');
    expect(removed.body.data.isActive).toBe(true);
  });

  it('still deactivates a media-only entry when the media is deleted', async () => {
    const id = await create();
    await upload(id);
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
  for (const { table, id } of created) {
    await db(table).where('id', id).del();
  }
  await db.destroy();
  for (const dir of uploadedDirs) {
    await rm(dir, { recursive: true, force: true });
  }
});
