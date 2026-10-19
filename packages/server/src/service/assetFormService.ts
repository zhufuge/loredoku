import type {
  Asset,
  AssetForm,
  AssetUsage,
  CreateAssetFormInput,
  UpdateAssetFormInput,
} from '@loredoku/shared';
import { db } from '../db/knex';
import * as assetRepo from '../repository/assetRepository';
import * as formRepo from '../repository/assetFormRepository';
import { AppError } from '../utils/AppError';
import { processAssetFormImage } from '../utils/image';
import { getAsset } from './assetService';

/**
 * v0.6.1 (docs/v0.6.1.md §4) — the form rules that need the sibling rows, so
 * they cannot live in zod:
 *   - an asset keeps at least one form;
 *   - a form may only be deleted while no draft canvas points at it.
 */

async function requireAsset(assetId: number): Promise<Asset> {
  const asset = await assetRepo.getAsset(assetId);
  if (!asset) {
    throw AppError.notFound('资源不存在');
  }
  return asset;
}

export async function listForms(assetId: number): Promise<AssetForm[]> {
  await requireAsset(assetId);
  return formRepo.listByAsset(assetId);
}

export async function createForm(
  assetId: number,
  input: CreateAssetFormInput,
): Promise<AssetForm> {
  await requireAsset(assetId);
  if (await formRepo.findByAssetAndName(assetId, input.name)) {
    throw AppError.conflict('同一资源下形态名称不能重复');
  }
  const sortOrder = await formRepo.nextSortOrder(assetId);
  const id = await formRepo.create(db, assetId, input, sortOrder);
  const row = await formRepo.findById(assetId, id);
  return formRepo.toAssetForm(row!);
}

export async function updateForm(
  assetId: number,
  formId: number,
  input: UpdateAssetFormInput,
): Promise<AssetForm> {
  const asset = await requireAsset(assetId);
  const row = await formRepo.findById(assetId, formId);
  if (!row) {
    throw AppError.notFound('形态不存在');
  }
  // 背景层的占格从不参与渲染，允许改它就是在撒谎。
  if (asset.type === 'background' && (input.widthCells !== undefined || input.heightCells !== undefined)) {
    throw AppError.validation('背景资源的形态占格恒为 1×1，不能修改');
  }
  if (input.name !== undefined && input.name !== row.name) {
    const clash = await formRepo.findByAssetAndName(assetId, input.name);
    if (clash && Number(clash.id) !== formId) {
      throw AppError.conflict('同一资源下形态名称不能重复');
    }
  }
  await formRepo.update(assetId, formId, input);
  const updated = await formRepo.findById(assetId, formId);
  return formRepo.toAssetForm(updated!);
}

export async function deleteForm(assetId: number, formId: number): Promise<void> {
  await requireAsset(assetId);
  if (!(await formRepo.findById(assetId, formId))) {
    throw AppError.notFound('形态不存在');
  }
  if ((await formRepo.countByAsset(assetId)) <= 1) {
    throw AppError.conflict('资源至少要保留一个形态');
  }
  const usages = await formRepo.getUsages(formId);
  if (usages.length > 0) {
    const mapNames = usages.map((usage) => usage.mapName).join('、');
    throw AppError.conflict(`该形态已被地图使用（${mapNames}），请先在画布上移除`);
  }
  await formRepo.remove(assetId, formId);
}

export async function getFormUsages(assetId: number, formId: number): Promise<AssetUsage[]> {
  await requireAsset(assetId);
  if (!(await formRepo.findById(assetId, formId))) {
    throw AppError.notFound('形态不存在');
  }
  return formRepo.getUsages(formId);
}

export async function uploadImage(
  assetId: number,
  formId: number,
  buffer: Buffer,
): Promise<Asset> {
  await requireAsset(assetId);
  if (!(await formRepo.findById(assetId, formId))) {
    throw AppError.notFound('形态不存在');
  }
  const processed = await processAssetFormImage(assetId, formId, buffer);
  await formRepo.setImage(assetId, formId, {
    path: processed.relativePath,
    mime: processed.mime,
    size: processed.size,
    width: processed.width,
    height: processed.height,
  });
  return getAsset(assetId);
}

/**
 * v0.6.1 (docs/v0.6.1.md §4.5): deleting the last look leaves nothing to render,
 * so the asset deactivates — the v0.5.1 rule, widened from "no image and no
 * colour" to "no form has either".
 */
export async function deleteImage(assetId: number, formId: number): Promise<Asset> {
  await requireAsset(assetId);
  if (!(await formRepo.findById(assetId, formId))) {
    throw AppError.notFound('形态不存在');
  }
  await formRepo.clearImage(assetId, formId);
  if (!(await formRepo.assetHasAppearance(assetId))) {
    await assetRepo.setActive(assetId, false);
  }
  return getAsset(assetId);
}
