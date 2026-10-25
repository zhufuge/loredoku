import { afterAll, describe, expect, it } from 'vitest';
import { ErrorCode } from '@loredoku/shared';
import { api } from './helpers';

/**
 * v0.6.1 (docs/v0.6.1.md §4 / §5.3) — the form rules, end to end.
 *
 * Everything here is a rule that needs the sibling rows, so it cannot live in
 * zod: how many forms an asset keeps, whether the name is taken, and whether a
 * draft canvas still points at the form being deleted.
 */

const createdAssets: number[] = [];
const createdMaps: number[] = [];

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

async function createAsset(body: Record<string, unknown> = {}): Promise<{
  id: number;
  formId: number;
  forms: Array<Record<string, unknown>>;
}> {
  const res = await api
    .post('/api/assets')
    .send({ code: uniqueCode('form'), name: 'Asset', type: 'item', ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdAssets.push(id);
  const forms = res.body.data.forms as Array<Record<string, unknown>>;
  return { id, formId: forms[0]!.id as number, forms };
}

async function addForm(assetId: number, body: Record<string, unknown>): Promise<number> {
  const res = await api.post(`/api/assets/${assetId}/forms`).send(body);
  expect(res.status).toBe(200);
  return res.body.data.id as number;
}

describe('asset forms API', () => {
  it('creates an asset with one 1×1 默认 form', async () => {
    const asset = await createAsset();
    expect(asset.forms).toHaveLength(1);
    expect(asset.forms[0]).toMatchObject({
      name: '默认',
      widthCells: 1,
      heightCells: 1,
      sortOrder: 0,
      bgColor: null,
    });
  });

  it('appends forms in creation order and lists them by sort_order', async () => {
    const asset = await createAsset();
    const open = await addForm(asset.id, { name: '打开', widthCells: 2, heightCells: 2 });

    const list = await api.get(`/api/assets/${asset.id}/forms`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((form: { name: string }) => form.name)).toEqual(['默认', '打开']);

    const detail = await api.get(`/api/assets/${asset.id}`);
    expect(detail.body.data.forms.map((form: { id: number }) => form.id)).toEqual([
      asset.formId,
      open,
    ]);
  });

  it('rejects a duplicate name inside one asset, but not across assets', async () => {
    const asset = await createAsset();
    const clash = await api.post(`/api/assets/${asset.id}/forms`).send({ name: '默认' });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe(ErrorCode.CONFLICT);

    // The same name is fine on a different asset.
    const other = await createAsset();
    const ok = await api.post(`/api/assets/${other.id}/forms`).send({ name: '打开' });
    expect(ok.status).toBe(200);
    const sameOnOther = await api.post(`/api/assets/${other.id}/forms`).send({ name: '打开' });
    expect(sameOnOther.status).toBe(409);
  });

  it('renames and refits a form', async () => {
    const asset = await createAsset();
    const formId = await addForm(asset.id, { name: '横放', widthCells: 2, heightCells: 1 });

    const res = await api
      .patch(`/api/assets/${asset.id}/forms/${formId}`)
      .send({ name: '竖放', widthCells: 1, heightCells: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: '竖放', widthCells: 1, heightCells: 2 });
  });

  it('rejects an empty patch', async () => {
    const asset = await createAsset();
    const res = await api.patch(`/api/assets/${asset.id}/forms/${asset.formId}`).send({});
    expect(res.status).toBe(400);
  });

  it('keeps at least one form', async () => {
    const asset = await createAsset();
    const res = await api.delete(`/api/assets/${asset.id}/forms/${asset.formId}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCode.CONFLICT);

    // Two forms → the extra one can go.
    const extra = await addForm(asset.id, { name: '打开' });
    const removed = await api.delete(`/api/assets/${asset.id}/forms/${extra}`);
    expect(removed.status).toBe(200);

    const list = await api.get(`/api/assets/${asset.id}/forms`);
    expect(list.body.data).toHaveLength(1);
  });

  it('lets a background asset own several forms, each with its own look', async () => {
    const asset = await createAsset({ type: 'background' });
    const add = await api.post(`/api/assets/${asset.id}/forms`).send({ name: '第二个' });
    expect(add.status).toBe(200);
    expect(add.body.data.widthCells).toBe(1);

    // The look of the second form is editable, like any other.
    const look = await api
      .patch(`/api/assets/${asset.id}/forms/${add.body.data.id}`)
      .send({ bgColor: '#AABBCC' });
    expect(look.status).toBe(200);
    expect(look.body.data.bgColor).toBe('#AABBCC');

    // Only the footprint stays off limits — a background cell is always one cell.
    const footprint = await api
      .patch(`/api/assets/${asset.id}/forms/${add.body.data.id}`)
      .send({ widthCells: 2 });
    expect(footprint.status).toBe(400);
    expect(footprint.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    // The extra form can go again; the last one cannot.
    const remove = await api.delete(`/api/assets/${asset.id}/forms/${add.body.data.id}`);
    expect(remove.status).toBe(200);
    const last = await api.delete(`/api/assets/${asset.id}/forms/${asset.formId}`);
    expect(last.status).toBe(409);
  });

  it('switches to background without asking the extra forms to go', async () => {
    const asset = await createAsset();
    await addForm(asset.id, { name: '打开' });

    const switched = await api.patch(`/api/assets/${asset.id}`).send({ type: 'background' });
    expect(switched.status).toBe(200);
    expect(switched.body.data.type).toBe('background');
    expect(switched.body.data.blocking).toBe(false);

    const forms = await api.get(`/api/assets/${asset.id}/forms`);
    expect(forms.body.data).toHaveLength(2);
  });

  it('refuses to delete a form a draft canvas still points at', async () => {
    const asset = await createAsset();
    const formId = await addForm(asset.id, { name: '打开', widthCells: 2, heightCells: 2 });

    const map = await api.post('/api/maps').send({ name: `Forms ${uniqueCode('m')}` });
    const mapId = map.body.data.id as number;
    createdMaps.push(mapId);
    await api.patch(`/api/maps/${mapId}/grid-size`).send({ gridSize: 4 });
    const saved = await api.put(`/api/maps/${mapId}/map`).send({
      data: {
        version: 5,
        gridSize: 4,
        regions: [],
        cells: { '0,0': { item: { assetId: asset.id, formId, w: 2, h: 2 } } },
      },
    });
    expect(saved.status).toBe(200);

    const res = await api.delete(`/api/assets/${asset.id}/forms/${formId}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('已被地图使用');
  });

  it('404s for a form that belongs to another asset', async () => {
    const asset = await createAsset();
    const other = await createAsset();
    const res = await api
      .patch(`/api/assets/${other.id}/forms/${asset.formId}`)
      .send({ name: '偷换' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(ErrorCode.NOT_FOUND);
  });
});

afterAll(async () => {
  const { db } = await import('../src/db/knex');
  for (const id of createdMaps) await db('maps').where('id', id).del();
  for (const id of createdAssets) await db('assets').where('id', id).del();
  await db.destroy();
});
