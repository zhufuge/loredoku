import { afterAll, describe, expect, it } from 'vitest';
import { ErrorCode } from '@loredoku/shared';
import { db } from '../src/db/knex';
import { api, fixtureTheme } from './helpers';

/**
 * v0.6.1 (docs/v0.6.1.md §4 / §5.3) — the variant rules, end to end.
 *
 * Everything here is a rule that needs the sibling rows, so it cannot live in
 * zod: how many variants an asset keeps, whether the name is taken, and whether a
 * draft canvas still points at the variant being deleted.
 */

const createdAssets: number[] = [];
const createdMaps: number[] = [];

function uniqueCode(prefix: string): string {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

async function createAsset(body: Record<string, unknown> = {}): Promise<{
  id: number;
  variantId: number;
  variants: Array<Record<string, unknown>>;
}> {
  const res = await api
    .post('/api/assets')
    .send({ code: uniqueCode('variant'), name: 'Asset', type: 'item', themeCode: await fixtureTheme(), ...body });
  expect(res.status).toBe(200);
  const id = res.body.data.id as number;
  createdAssets.push(id);
  const variants = res.body.data.variants as Array<Record<string, unknown>>;
  return { id, variantId: variants[0]!.id as number, variants };
}

async function addVariant(assetId: number, body: Record<string, unknown>): Promise<number> {
  const res = await api.post(`/api/assets/${assetId}/variants`).send(body);
  expect(res.status).toBe(200);
  return res.body.data.id as number;
}

describe('asset variants API', () => {
  it('v0.7.6：表叫 asset_variants，旧的 /forms 路由已经不存在', async () => {
    const rows = (await db('information_schema.columns')
      .where({ table_name: 'asset_variants', table_schema: 'public' })
      .select('column_name')) as Array<{ column_name: string }>;
    expect(rows.map((row) => row.column_name)).toEqual(
      expect.arrayContaining(['asset_id', 'name', 'fit_mode', 'image_path', 'bg_color']),
    );
    for (const gone of [
      'width_cells',
      'height_cells',
      'image_mime',
      'image_size',
      'image_width',
      'image_height',
    ]) {
      expect(rows.map((row) => row.column_name)).not.toContain(gone);
    }
    const legacy = await db('information_schema.tables')
      .where({ table_name: 'asset_forms', table_schema: 'public' })
      .select('table_name');
    expect(legacy).toHaveLength(0);

    const asset = await createAsset();
    expect((await api.get(`/api/assets/${asset.id}/variants`)).status).toBe(200);
    expect((await api.get(`/api/assets/${asset.id}/forms`)).status).toBe(404);
  });

  it('creates an asset with one 默认 variant, and no footprint to report', async () => {
    const asset = await createAsset();
    expect(asset.variants).toHaveLength(1);
    expect(asset.variants[0]).toMatchObject({
      name: '默认',
      sortOrder: 0,
      bgColor: null,
    });
    // v0.7.6: 形态不再声明占格。
    expect(asset.variants[0]).not.toHaveProperty('widthCells');
    expect(asset.variants[0]).not.toHaveProperty('heightCells');
  });

  it('appends variants in creation order and lists them by sort_order', async () => {
    const asset = await createAsset();
    const open = await addVariant(asset.id, { name: '打开' });

    const list = await api.get(`/api/assets/${asset.id}/variants`);
    expect(list.status).toBe(200);
    expect(list.body.data.map((variant: { name: string }) => variant.name)).toEqual(['默认', '打开']);

    const detail = await api.get(`/api/assets/${asset.id}`);
    expect(detail.body.data.variants.map((variant: { id: number }) => variant.id)).toEqual([
      asset.variantId,
      open,
    ]);
  });

  it('rejects a duplicate name inside one asset, but not across assets', async () => {
    const asset = await createAsset();
    const clash = await api.post(`/api/assets/${asset.id}/variants`).send({ name: '默认' });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe(ErrorCode.CONFLICT);

    // The same name is fine on a different asset.
    const other = await createAsset();
    const ok = await api.post(`/api/assets/${other.id}/variants`).send({ name: '打开' });
    expect(ok.status).toBe(200);
    const sameOnOther = await api.post(`/api/assets/${other.id}/variants`).send({ name: '打开' });
    expect(sameOnOther.status).toBe(409);
  });

  it('renames and refits a variant', async () => {
    const asset = await createAsset();
    const variantId = await addVariant(asset.id, { name: '横放' });

    const res = await api
      .patch(`/api/assets/${asset.id}/variants/${variantId}`)
      .send({ name: '竖放', fitMode: 'contain' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: '竖放', fitMode: 'contain' });
  });

  it('rejects an empty patch', async () => {
    const asset = await createAsset();
    const res = await api.patch(`/api/assets/${asset.id}/variants/${asset.variantId}`).send({});
    expect(res.status).toBe(400);
  });

  it('keeps at least one variant', async () => {
    const asset = await createAsset();
    const res = await api.delete(`/api/assets/${asset.id}/variants/${asset.variantId}`);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe(ErrorCode.CONFLICT);

    // Two variants → the extra one can go.
    const extra = await addVariant(asset.id, { name: '打开' });
    const removed = await api.delete(`/api/assets/${asset.id}/variants/${extra}`);
    expect(removed.status).toBe(200);

    const list = await api.get(`/api/assets/${asset.id}/variants`);
    expect(list.body.data).toHaveLength(1);
  });

  it('lets a background asset own several variants, each with its own look', async () => {
    const asset = await createAsset({ type: 'background' });
    const add = await api.post(`/api/assets/${asset.id}/variants`).send({ name: '第二个' });
    expect(add.status).toBe(200);
    expect(add.body.data.name).toBe('第二个');

    // The look of the second variant is editable, like any other.
    const look = await api
      .patch(`/api/assets/${asset.id}/variants/${add.body.data.id}`)
      .send({ bgColor: '#AABBCC' });
    expect(look.status).toBe(200);
    expect(look.body.data.bgColor).toBe('#AABBCC');

    // v0.7.6: `widthCells` 已不存在 —— 老客户端发过来会被 schema 剥掉，
    // 剥完是空补丁，按「至少要修改一个字段」拒掉。
    const footprint = await api
      .patch(`/api/assets/${asset.id}/variants/${add.body.data.id}`)
      .send({ widthCells: 2 });
    expect(footprint.status).toBe(400);
    expect(footprint.body.code).toBe(ErrorCode.VALIDATION_FAILED);

    // The extra variant can go again; the last one cannot.
    const remove = await api.delete(`/api/assets/${asset.id}/variants/${add.body.data.id}`);
    expect(remove.status).toBe(200);
    const last = await api.delete(`/api/assets/${asset.id}/variants/${asset.variantId}`);
    expect(last.status).toBe(409);
  });

  it('switches to background without asking the extra variants to go', async () => {
    const asset = await createAsset();
    await addVariant(asset.id, { name: '打开' });

    const switched = await api.patch(`/api/assets/${asset.id}`).send({ type: 'background' });
    expect(switched.status).toBe(200);
    expect(switched.body.data.type).toBe('background');
    expect(switched.body.data.blocking).toBe(false);

    const variants = await api.get(`/api/assets/${asset.id}/variants`);
    expect(variants.body.data).toHaveLength(2);
  });

  it('refuses to delete a variant a draft canvas still points at', async () => {
    const asset = await createAsset();
    const variantId = await addVariant(asset.id, { name: '打开' });

    const map = await api
      .post('/api/maps')
      .send({ name: `Variants ${uniqueCode('m')}`, themeCode: await fixtureTheme() });
    const mapId = map.body.data.id as number;
    createdMaps.push(mapId);
    await api.patch(`/api/maps/${mapId}/grid-size`).send({ gridSize: 4 });
    const saved = await api.put(`/api/maps/${mapId}/map`).send({
      data: {
        version: 5,
        gridSize: 4,
        regions: [],
        cells: { '0,0': { item: { assetId: asset.id, variantId, w: 2, h: 2 } } },
      },
    });
    expect(saved.status).toBe(200);

    const res = await api.delete(`/api/assets/${asset.id}/variants/${variantId}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('已被地图使用');
  });

  it('404s for a variant that belongs to another asset', async () => {
    const asset = await createAsset();
    const other = await createAsset();
    const res = await api
      .patch(`/api/assets/${other.id}/variants/${asset.variantId}`)
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
