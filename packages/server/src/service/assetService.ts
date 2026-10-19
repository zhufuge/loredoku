import type {
  Asset,
  AssetUsage,
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from '@loredoku/shared';
import * as repo from '../repository/assetRepository';
import { AppError } from '../utils/AppError';
import { processAssetImage } from '../utils/image';

export async function listAssets(query: ListAssetsQuery): Promise<Asset[]> {
  return repo.listAssets(query);
}

export async function getAsset(id: number): Promise<Asset> {
  const asset = await repo.getAsset(id);
  if (!asset) {
    throw AppError.notFound('资源不存在');
  }
  return asset;
}

export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  if (await repo.findByCode(input.code)) {
    throw AppError.conflict('业务 ID 已存在');
  }
  const id = await repo.create(input);
  return getAsset(id);
}

export async function updateAsset(id: number, input: UpdateAssetInput): Promise<Asset> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  await repo.update(id, input);
  return getAsset(id);
}

export async function deleteAsset(id: number, clearReferences: boolean): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  await repo.softDelete(id, clearReferences);
}

export async function setAssetActive(id: number, isActive: boolean): Promise<Asset> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  await repo.setActive(id, isActive);
  return getAsset(id);
}

export async function hardDeleteAsset(id: number, clearReferences: boolean): Promise<void> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  await repo.hardDelete(id, clearReferences);
}

export async function uploadImage(id: number, buffer: Buffer): Promise<Asset> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  const processed = await processAssetImage(id, buffer);
  await repo.setImage(id, {
    path: processed.relativePath,
    mime: processed.mime,
    size: processed.size,
    width: processed.width,
    height: processed.height,
  });
  return getAsset(id);
}

export async function deleteImage(id: number): Promise<Asset> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  await repo.clearImage(id);
  return getAsset(id);
}

export async function getUsages(id: number): Promise<AssetUsage[]> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  return repo.getUsages(id);
}
