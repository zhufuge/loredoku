import type { Knex } from 'knex';
import { db } from '../db/knex';
import { buildFileUrl, buildThumbUrl } from '../utils/paths';
import type { AssetFitMode, AssetVariant, AssetVariantRow, AssetUsage, MapDraft } from '@loredoku/shared';

/**
 * v0.6.1 (docs/v0.6.1.md §3): `asset_variants` (then `asset_forms`) — how an asset
 * looks. The repository owns the rows; the rules about *how many* variants an
 * asset may have live in `assetVariantService`.
 *
 * v0.7.6 (docs/v0.7.6.md §9): the upload receipt (mime / size / width / height)
 * is gone. v0.10.6: the footprint returns as `w` / `h` on the variant (default
 * 1×1) — a bed spanning two cells belongs to the look, not to one placement.
 */

export interface CreateAssetVariantData {
  name: string;
  /** Only the initial variant created alongside the asset carries a look. */
  fitMode?: AssetFitMode;
  bgColor?: string | null;
  /** v0.10.6: 占格足迹；缺省由 DB 列的 DEFAULT 1 落。 */
  w?: number;
  h?: number;
}

export interface UpdateAssetVariantData {
  name?: string;
  fitMode?: AssetFitMode;
  /** `null` clears the colour block (back to image mode). */
  bgColor?: string | null;
  /** v0.10.6: 占格足迹。 */
  w?: number;
  h?: number;
}

export function toAssetVariant(row: AssetVariantRow): AssetVariant {
  return {
    id: Number(row.id),
    assetId: Number(row.asset_id),
    name: row.name,
    sortOrder: row.sort_order,
    w: Number(row.w ?? 1),
    h: Number(row.h ?? 1),
    fitMode: row.fit_mode,
    imagePath: row.image_path,
    imageUrl: row.image_path ? buildFileUrl(row.image_path) : null,
    imageThumbUrl: row.image_path ? buildThumbUrl(row.image_path) : null,
    bgColor: row.bg_color ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/** 六个列表/详情端点都内嵌形态，一次 `IN (…)` 取完，不做 N+1。 */
export async function listByAssetIds(assetIds: number[]): Promise<Map<number, AssetVariant[]>> {
  const grouped = new Map<number, AssetVariant[]>();
  if (assetIds.length === 0) return grouped;
  const rows = (await db<AssetVariantRow>('asset_variants')
    .whereIn('asset_id', assetIds)
    .orderBy(['asset_id', 'sort_order', 'id'])) as AssetVariantRow[];
  for (const row of rows) {
    const assetId = Number(row.asset_id);
    const list = grouped.get(assetId);
    if (list) list.push(toAssetVariant(row));
    else grouped.set(assetId, [toAssetVariant(row)]);
  }
  return grouped;
}

export async function listByAsset(assetId: number): Promise<AssetVariant[]> {
  const grouped = await listByAssetIds([assetId]);
  return grouped.get(assetId) ?? [];
}

/**
 * v0.8.0（§11.2）：打包时按 id 取形态 —— 用来补「只被 variantId 引用、没被
 * assetId 引用」的资源（正常草稿不会这样，但体检要能兜住）。
 */
export async function listByIds(ids: number[]): Promise<AssetVariant[]> {
  if (ids.length === 0) return [];
  const rows = (await db<AssetVariantRow>('asset_variants')
    .whereIn('id', ids)
    .orderBy(['asset_id', 'sort_order', 'id'])) as AssetVariantRow[];
  return rows.map(toAssetVariant);
}

export async function findById(assetId: number, variantId: number): Promise<AssetVariantRow | undefined> {
  return db<AssetVariantRow>('asset_variants').where({ id: variantId, asset_id: assetId }).first();
}

export async function findByAssetAndName(
  assetId: number,
  name: string,
): Promise<AssetVariantRow | undefined> {
  return db<AssetVariantRow>('asset_variants').where({ asset_id: assetId, name }).first();
}

export async function countByAsset(assetId: number): Promise<number> {
  const row = await db('asset_variants').where({ asset_id: assetId }).count<{ count: string }>('id as count').first();
  return Number(row?.count ?? 0);
}

/** 新形态排在末尾；同一资源下 `sort_order` 允许并列，响应再按 id 兜底排序。 */
export async function nextSortOrder(assetId: number): Promise<number> {
  const row = await db('asset_variants')
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
  data: CreateAssetVariantData,
  sortOrder: number,
): Promise<number> {
  const [row] = await runner('asset_variants')
    .insert({
      asset_id: assetId,
      name: data.name,
      fit_mode: data.fitMode ?? 'cover',
      bg_color: data.bgColor ?? null,
      w: data.w ?? 1,
      h: data.h ?? 1,
      sort_order: sortOrder,
    })
    .returning('id');
  return Number((row as { id: number | string }).id);
}

export async function update(
  assetId: number,
  variantId: number,
  data: UpdateAssetVariantData,
): Promise<boolean> {
  const patch: Record<string, unknown> = { updated_at: db.fn.now() };
  if (data.name !== undefined) patch.name = data.name;
  if (data.fitMode !== undefined) patch.fit_mode = data.fitMode;
  if (data.bgColor !== undefined) patch.bg_color = data.bgColor;
  if (data.w !== undefined) patch.w = data.w;
  if (data.h !== undefined) patch.h = data.h;
  const affected = await db('asset_variants').where({ id: variantId, asset_id: assetId }).update(patch);
  return affected > 0;
}

export async function remove(assetId: number, variantId: number): Promise<boolean> {
  const affected = await db('asset_variants').where({ id: variantId, asset_id: assetId }).del();
  return affected > 0;
}

export async function setImage(
  assetId: number,
  variantId: number,
  relativePath: string,
): Promise<void> {
  await db('asset_variants')
    .where({ id: variantId, asset_id: assetId })
    .update({
      image_path: relativePath,
      updated_at: db.fn.now(),
    });
}

/**
 * 删图不删纯色块：`bg_color` 在的话这个形态仍有外观，`updated_at` 之外什么都不变。
 * 资源是否因此停用由 service 判定（要看**所有**形态）。
 */
export async function clearImage(assetId: number, variantId: number): Promise<void> {
  await db('asset_variants')
    .where({ id: variantId, asset_id: assetId })
    .update({
      image_path: null,
      updated_at: db.fn.now(),
    });
}

/** 资源下是否还有任何一个形态带外观（图片或纯色）。 */
export async function assetHasAppearance(assetId: number): Promise<boolean> {
  const row = await db('asset_variants')
    .where({ asset_id: assetId })
    .where((builder) => {
      builder.whereNotNull('image_path').orWhereNotNull('bg_color');
    })
    .first('id');
  return row !== undefined;
}

/** 形态被哪些草稿画布引用——删除前的占用检查（docs/v0.6.1.md §4.7）。 */
export async function getUsages(variantId: number): Promise<AssetUsage[]> {
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
      if (draft.cells[key]?.item?.variantId !== variantId) continue;
      const [xs, ys] = key.split(',');
      cells.push({ x: Number(xs), y: Number(ys) });
    }
    if (cells.length > 0) {
      usages.push({ mapId: Number(mapRow.id), mapName: mapRow.name, cells });
    }
  }
  return usages;
}
