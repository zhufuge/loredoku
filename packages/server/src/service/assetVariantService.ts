import type {
  Asset,
  AssetVariant,
  AssetUsage,
  CreateAssetVariantInput,
  UpdateAssetVariantInput,
} from '@loredoku/shared';
import { db } from '../db/knex';
import * as assetRepo from '../repository/assetRepository';
import * as variantRepo from '../repository/assetVariantRepository';
import { AppError } from '../utils/AppError';
import { processAssetVariantImage } from '../utils/image';
import { getAsset } from './assetService';

/**
 * v0.6.1 (docs/v0.6.1.md §4) — the variant rules that need the sibling rows, so
 * they cannot live in zod:
 *   - an asset keeps at least one variant;
 *   - a variant may only be deleted while no draft canvas points at it.
 */

async function requireAsset(assetId: number): Promise<Asset> {
  const asset = await assetRepo.getAsset(assetId);
  if (!asset) {
    throw AppError.notFound('资源不存在');
  }
  return asset;
}

export async function listVariants(assetId: number): Promise<AssetVariant[]> {
  await requireAsset(assetId);
  return variantRepo.listByAsset(assetId);
}

export async function createVariant(
  assetId: number,
  input: CreateAssetVariantInput,
): Promise<AssetVariant> {
  await requireAsset(assetId);
  if (await variantRepo.findByAssetAndName(assetId, input.name)) {
    throw AppError.conflict('同一资源下形态名称不能重复');
  }
  const sortOrder = await variantRepo.nextSortOrder(assetId);
  const id = await variantRepo.create(db, assetId, input, sortOrder);
  const row = await variantRepo.findById(assetId, id);
  return variantRepo.toAssetVariant(row!);
}

export async function updateVariant(
  assetId: number,
  variantId: number,
  input: UpdateAssetVariantInput,
): Promise<AssetVariant> {
  await requireAsset(assetId);
  const row = await variantRepo.findById(assetId, variantId);
  if (!row) {
    throw AppError.notFound('形态不存在');
  }
  if (input.name !== undefined && input.name !== row.name) {
    const clash = await variantRepo.findByAssetAndName(assetId, input.name);
    if (clash && Number(clash.id) !== variantId) {
      throw AppError.conflict('同一资源下形态名称不能重复');
    }
  }
  await variantRepo.update(assetId, variantId, input);
  const updated = await variantRepo.findById(assetId, variantId);
  return variantRepo.toAssetVariant(updated!);
}

export async function deleteVariant(assetId: number, variantId: number): Promise<void> {
  await requireAsset(assetId);
  if (!(await variantRepo.findById(assetId, variantId))) {
    throw AppError.notFound('形态不存在');
  }
  if ((await variantRepo.countByAsset(assetId)) <= 1) {
    throw AppError.conflict('资源至少要保留一个形态');
  }
  const usages = await variantRepo.getUsages(variantId);
  if (usages.length > 0) {
    const mapNames = usages.map((usage) => usage.mapName).join('、');
    throw AppError.conflict(`该形态已被地图使用（${mapNames}），请先在画布上移除`);
  }
  await variantRepo.remove(assetId, variantId);
}

export async function getVariantUsages(assetId: number, variantId: number): Promise<AssetUsage[]> {
  await requireAsset(assetId);
  if (!(await variantRepo.findById(assetId, variantId))) {
    throw AppError.notFound('形态不存在');
  }
  return variantRepo.getUsages(variantId);
}

export async function uploadImage(
  assetId: number,
  variantId: number,
  buffer: Buffer,
): Promise<Asset> {
  await requireAsset(assetId);
  if (!(await variantRepo.findById(assetId, variantId))) {
    throw AppError.notFound('形态不存在');
  }
  const processed = await processAssetVariantImage(assetId, variantId, buffer);
  await variantRepo.setImage(assetId, variantId, processed.relativePath);
  return getAsset(assetId);
}

/**
 * v0.6.1 (docs/v0.6.1.md §4.5): deleting the last look leaves nothing to render,
 * so the asset deactivates — the v0.5.1 rule, widened from "no image and no
 * colour" to "no variant has either".
 */
export async function deleteImage(assetId: number, variantId: number): Promise<Asset> {
  await requireAsset(assetId);
  if (!(await variantRepo.findById(assetId, variantId))) {
    throw AppError.notFound('形态不存在');
  }
  await variantRepo.clearImage(assetId, variantId);
  if (!(await variantRepo.assetHasAppearance(assetId))) {
    await assetRepo.setActive(assetId, false);
  }
  return getAsset(assetId);
}
