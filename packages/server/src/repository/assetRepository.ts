import type { Knex } from 'knex';
import { blockingFor } from '@loredoku/shared';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type { Asset, AssetRow, AssetType, AssetUsage, AssetFitMode, MapDraft } from '@loredoku/shared';

export interface ListAssetsParams {
  keyword?: string;
  isActive?: boolean;
  type?: string;
}

export interface CreateAssetData {
  code: string;
  name: string;
  type: AssetType;
  widthCells: number;
  heightCells: number;
  blocking: boolean;
  fitMode: AssetFitMode;
  /** v0.5.1 FEAT-L01: colour-block colour; `null` / omitted = image mode. */
  bgColor?: string | null;
  /**
   * v0.5.3 FEAT-N06: create enabled when the caller already supplied an
   * appearance; omitted keeps the OPT-305 default (`false`).
   */
  isActive?: boolean;
}

export interface UpdateAssetData {
  name?: string;
  type?: AssetType;
  widthCells?: number;
  heightCells?: number;
  blocking?: boolean;
  fitMode?: AssetFitMode;
  /** v0.5.1 FEAT-L01: `null` clears the colour block (back to image mode). */
  bgColor?: string | null;
  isActive?: boolean;
}

export interface AssetImageData {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

function toAsset(row: AssetRow): Asset {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    type: row.type,
    widthCells: row.width_cells,
    heightCells: row.height_cells,
    blocking: row.blocking,
    fitMode: row.fit_mode,
    imagePath: row.image_path,
    imageUrl: row.image_path ? buildFileUrl(row.image_path) : null,
    imageThumbUrl: row.image_path ? buildThumbUrl(row.image_path) : null,
    imageMime: row.image_mime,
    imageSize: row.image_size,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    bgColor: row.bg_color ?? null,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function listAssets(params: ListAssetsParams): Promise<Asset[]> {
  const query = db<AssetRow>('assets');
  if (params.isActive !== undefined) query.where('is_active', params.isActive);
  if (params.type) query.where('type', params.type);
  if (params.keyword) {
    const pattern = `%${params.keyword}%`;
    query.where((builder) => {
      builder.where('name', 'ilike', pattern).orWhere('code', 'ilike', pattern);
    });
  }

  // v0.5.2 FEAT-M03: triggers lived in their own table and needed a second
  // round trip per list — one row set is now all there is.
  const rows = await query.orderBy('updated_at', 'desc').select('*');
  return rows.map(toAsset);
}

export async function findById(id: number): Promise<AssetRow | undefined> {
  return db<AssetRow>('assets').where({ id }).first();
}

export async function findByCode(code: string): Promise<AssetRow | undefined> {
  return db<AssetRow>('assets').where({ code }).first();
}

export async function getAsset(id: number): Promise<Asset | null> {
  const row = await findById(id);
  if (!row) return null;
  return toAsset(row);
}

export async function create(data: CreateAssetData): Promise<number> {
  const [row] = await db('assets')
    .insert({
      code: data.code,
      name: data.name,
      type: data.type,
      width_cells: data.widthCells,
      height_cells: data.heightCells,
      // v0.5.2 FEAT-M04: a background asset never blocks.
      blocking: blockingFor(data.type, data.blocking),
      fit_mode: data.fitMode,
      bg_color: data.bgColor ?? null,
      // OPT-305: 新建资源未上传图片，初始状态为停用。
      // v0.5.3 FEAT-N06: 上传了图片或选了纯色块 → 直接启用。
      is_active: data.isActive ?? false,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(id: number, data: UpdateAssetData): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.type !== undefined) patch.type = data.type;
  if (data.widthCells !== undefined) patch.width_cells = data.widthCells;
  if (data.heightCells !== undefined) patch.height_cells = data.heightCells;
  if (data.blocking !== undefined) patch.blocking = data.blocking;
  if (data.fitMode !== undefined) patch.fit_mode = data.fitMode;
  if (data.bgColor !== undefined) patch.bg_color = data.bgColor;
  if (data.isActive !== undefined) patch.is_active = data.isActive;
  // v0.5.2 FEAT-M04: switching an asset to 「背景」 makes it non-blocking;
  // leaving the type alone keeps whatever `blocking` the caller sent.
  if (data.type === 'background') patch.blocking = false;
  const affected = await db('assets').where({ id }).update(patch);
  return affected > 0;
}

export async function setImage(id: number, image: ProcessedImageAlias): Promise<void> {
  await db('assets').where({ id }).update({
    image_path: image.path,
    image_mime: image.mime,
    image_size: image.size,
    image_width: image.width,
    image_height: image.height,
    updated_at: db.fn.now(),
  });
}

export async function clearImage(id: number): Promise<void> {
  await db('assets').where({ id }).update({
    image_path: null,
    image_mime: null,
    image_size: null,
    image_width: null,
    image_height: null,
    // OPT-305: 删除图片后自动停用（数据引用保留）。
    // v0.5.1 FEAT-L01 收窄：纯色块（有 bg_color）不依赖图片，删图只是删图。
    is_active: db.raw('CASE WHEN bg_color IS NULL THEN false ELSE is_active END'),
    updated_at: db.fn.now(),
  });
}

export interface ProcessedImageAlias {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export async function clearAssetFromDrafts(trx: Knex.Transaction, id: number): Promise<void> {
  const mapRows = (await trx('maps')
    .where('version', 'draft')
    .whereNotNull('data')
    .select('id', 'data')) as Array<{ id: string | number; data: unknown }>;
  for (const mapRow of mapRows) {
    const draft = mapRow.data as MapDraft | null;
    if (!draft?.cells) continue;
    let changed = false;
    for (const key of Object.keys(draft.cells)) {
      const cell = draft.cells[key];
      if (!cell) continue;
      if (cell.item?.assetId === id || cell.background?.assetId === id) {
        const next = { ...cell };
        if (cell.item?.assetId === id) delete next.item;
        if (cell.background?.assetId === id) delete next.background;
        if (!next.item && !next.itemRef && !next.background) delete draft.cells[key];
        else draft.cells[key] = next;
        changed = true;
      }
    }
    if (changed) {
      await trx('maps').where({ id: mapRow.id }).update({ data: draft });
    }
  }
}

export async function setActive(id: number, isActive: boolean): Promise<boolean> {
  const affected = await db('assets')
    .where({ id })
    .update({ is_active: isActive, updated_at: db.fn.now() });
  return affected > 0;
}

export async function softDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await clearAssetFromDrafts(trx, id);
    }
    const affected = await trx('assets')
      .where({ id })
      .update({ is_active: false, updated_at: trx.fn.now() });
    return affected > 0;
  });
}

export async function hardDelete(id: number, clearReferences: boolean): Promise<boolean> {
  return db.transaction(async (trx) => {
    if (clearReferences) {
      await clearAssetFromDrafts(trx, id);
    }
    const affected = await trx('assets').where({ id }).del();
    return affected > 0;
  });
}

export async function isReferenced(id: number): Promise<boolean> {
  const usages = await getUsages(id);
  return usages.length > 0;
}

export async function getUsages(assetId: number): Promise<AssetUsage[]> {
  const mapRows = (await db('maps')
    .where('version', 'draft')
    .whereNotNull('data')
    .select('id', 'name', 'data')) as Array<{
    id: string | number;
    name: string;
    data: MapDraft | null;
  }>;

  const usages: AssetUsage[] = [];
  for (const mapRow of mapRows) {
    const draft = mapRow.data;
    if (!draft?.cells) continue;
    const cells: Array<{ x: number; y: number }> = [];
    for (const key of Object.keys(draft.cells)) {
      const cell = draft.cells[key];
      if (cell?.item?.assetId === assetId || cell?.background?.assetId === assetId) {
        const [xs, ys] = key.split(',');
        cells.push({ x: Number(xs), y: Number(ys) });
      }
    }
    if (cells.length > 0) {
      usages.push({ mapId: Number(mapRow.id), mapName: mapRow.name, cells });
    }
  }
  return usages;
}

export async function existingAssetIds(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = (await db('assets').whereIn('id', ids).select('id')) as Array<{ id: number | string }>;
  return new Set(rows.map((row) => Number(row.id)));
}

export interface AssetMeta {
  blocking: boolean;
  isActive: boolean;
}

export async function assetMetaByIds(ids: number[]): Promise<Map<number, AssetMeta>> {
  if (ids.length === 0) return new Map();
  const rows = (await db('assets').whereIn('id', ids).select('id', 'blocking', 'is_active')) as Array<{
    id: number | string;
    blocking: boolean;
    is_active: boolean;
  }>;
  return new Map(rows.map((row) => [Number(row.id), { blocking: row.blocking, isActive: row.is_active }]));
}
