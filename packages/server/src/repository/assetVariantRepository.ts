import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type { AssetFitMode, AssetForm, AssetFormRow, AssetUsage, MapDraft } from '@loredoku/shared';

/**
 * v0.6.1 (docs/v0.6.1.md §3): `asset_forms` — how an asset looks and how many
 * cells it covers. The repository owns the rows; the rules about *how many*
 * forms an asset may have live in `assetFormService`.
 */

export interface CreateAssetFormData {
  name: string;
  widthCells: number;
  heightCells: number;
  /** Only the initial form created alongside the asset carries a look. */
  fitMode?: AssetFitMode;
  bgColor?: string | null;
}

export interface UpdateAssetFormData {
  name?: string;
  widthCells?: number;
  heightCells?: number;
  fitMode?: AssetFitMode;
  /** `null` clears the colour block (back to image mode). */
  bgColor?: string | null;
}

export interface FormImageData {
  path: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
}

export function toAssetForm(row: AssetFormRow): AssetForm {
  return {
    id: Number(row.id),
    assetId: Number(row.asset_id),
    name: row.name,
    widthCells: row.width_cells,
    heightCells: row.height_cells,
    sortOrder: row.sort_order,
    fitMode: row.fit_mode,
    imagePath: row.image_path,
    imageUrl: row.image_path ? buildFileUrl(row.image_path) : null,
    imageThumbUrl: row.image_path ? buildThumbUrl(row.image_path) : null,
    imageMime: row.image_mime,
    imageSize: row.image_size,
    imageWidth: row.image_width,
    imageHeight: row.image_height,
    bgColor: row.bg_color ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** 六个列表/详情端点都内嵌形态，一次 `IN (…)` 取完，不做 N+1。 */
export async function listByAssetIds(assetIds: number[]): Promise<Map<number, AssetForm[]>> {
  const grouped = new Map<number, AssetForm[]>();
  if (assetIds.length === 0) return grouped;
  const rows = (await db<AssetFormRow>('asset_forms')
    .whereIn('asset_id', assetIds)
    .orderBy(['asset_id', 'sort_order', 'id'])) as AssetFormRow[];
  for (const row of rows) {
    const assetId = Number(row.asset_id);
    const list = grouped.get(assetId);
    if (list) list.push(toAssetForm(row));
    else grouped.set(assetId, [toAssetForm(row)]);
  }
  return grouped;
}

export async function listByAsset(assetId: number): Promise<AssetForm[]> {
  const grouped = await listByAssetIds([assetId]);
  return grouped.get(assetId) ?? [];
}

export async function findById(assetId: number, formId: number): Promise<AssetFormRow | undefined> {
  return db<AssetFormRow>('asset_forms').where({ id: formId, asset_id: assetId }).first();
}

export async function findByAssetAndName(
  assetId: number,
  name: string,
): Promise<AssetFormRow | undefined> {
  return db<AssetFormRow>('asset_forms').where({ asset_id: assetId, name }).first();
}

export async function countByAsset(assetId: number): Promise<number> {
  const row = await db('asset_forms').where({ asset_id: assetId }).count<{ count: string }>('id as count').first();
  return Number(row?.count ?? 0);
}

/** 新形态排在末尾；同一资源下 `sort_order` 允许并列，响应再按 id 兜底排序。 */
export async function nextSortOrder(assetId: number): Promise<number> {
  const row = await db('asset_forms')
    .where({ asset_id: assetId })
    .max<{ max: number | null }>('sort_order as max')
    .first();
  return Number(row?.max ?? -1) + 1;
}

/**
 * 建资源时用同一个事务插首形态；后续单独加形态时传 `db` 即可（没有配套写入，
 * 一行自成事务）。
 */
export async function create(
  runner: Knex | Knex.Transaction,
  assetId: number,
  data: CreateAssetFormData,
  sortOrder: number,
): Promise<number> {
  const [row] = await runner('asset_forms')
    .insert({
      asset_id: assetId,
      name: data.name,
      width_cells: data.widthCells,
      height_cells: data.heightCells,
      fit_mode: data.fitMode ?? 'cover',
      bg_color: data.bgColor ?? null,
      sort_order: sortOrder,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(
  assetId: number,
  formId: number,
  data: UpdateAssetFormData,
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.widthCells !== undefined) patch.width_cells = data.widthCells;
  if (data.heightCells !== undefined) patch.height_cells = data.heightCells;
  if (data.fitMode !== undefined) patch.fit_mode = data.fitMode;
  if (data.bgColor !== undefined) patch.bg_color = data.bgColor;
  const affected = await db('asset_forms').where({ id: formId, asset_id: assetId }).update(patch);
  return affected > 0;
}

export async function remove(assetId: number, formId: number): Promise<boolean> {
  const affected = await db('asset_forms').where({ id: formId, asset_id: assetId }).del();
  return affected > 0;
}

export async function setImage(
  assetId: number,
  formId: number,
  image: FormImageData,
): Promise<void> {
  await db('asset_forms')
    .where({ id: formId, asset_id: assetId })
    .update({
      image_path: image.path,
      image_mime: image.mime,
      image_size: image.size,
      image_width: image.width,
      image_height: image.height,
      updated_at: db.fn.now(),
    });
}

/**
 * 删图不删纯色块：`bg_color` 在的话这个形态仍有外观，`updated_at` 之外什么都不变。
 * 资源是否因此停用由 service 判定（要看**所有**形态）。
 */
export async function clearImage(assetId: number, formId: number): Promise<void> {
  await db('asset_forms')
    .where({ id: formId, asset_id: assetId })
    .update({
      image_path: null,
      image_mime: null,
      image_size: null,
      image_width: null,
      image_height: null,
      updated_at: db.fn.now(),
    });
}

/** 资源下是否还有任何一个形态带外观（图片或纯色）。 */
export async function assetHasAppearance(assetId: number): Promise<boolean> {
  const row = await db('asset_forms')
    .where({ asset_id: assetId })
    .where((builder) => {
      builder.whereNotNull('image_path').orWhereNotNull('bg_color');
    })
    .first('id');
  return row !== undefined;
}

/** 形态被哪些草稿画布引用——删除前的占用检查（docs/v0.6.1.md §4.7）。 */
export async function getUsages(formId: number): Promise<AssetUsage[]> {
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
      if (draft.cells[key]?.item?.formId !== formId) continue;
      const [xs, ys] = key.split(',');
      cells.push({ x: Number(xs), y: Number(ys) });
    }
    if (cells.length > 0) {
      usages.push({ mapId: Number(mapRow.id), mapName: mapRow.name, cells });
    }
  }
  return usages;
}
