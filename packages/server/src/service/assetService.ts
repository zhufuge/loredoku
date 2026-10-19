import type {
  Asset,
  AssetUsage,
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from '@loredoku/shared';
import { DEFAULT_ASSET_FORM_NAME } from '@loredoku/shared';
import * as repo from '../repository/assetRepository';
import { AppError } from '../utils/AppError';

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

/**
 * v0.6.1: creating an asset creates its first form in the same transaction
 * (docs/v0.6.1.md §5.2). Its footprint is fixed at 1×1 — a bigger one belongs to
 * the form and is edited afterwards in the detail pane.
 */
export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  if (await repo.findByCode(input.code)) {
    throw AppError.conflict('业务 ID 已存在');
  }
  const id = await repo.create({
    code: input.code,
    name: input.name,
    type: input.type,
    blocking: input.blocking,
    isActive: input.isActive,
    initialForm: {
      name: DEFAULT_ASSET_FORM_NAME,
      widthCells: 1,
      heightCells: 1,
      fitMode: input.fitMode,
      bgColor: input.bgColor ?? null,
    },
  });
  return getAsset(id);
}

/**
 * v0.6.1: switching the type keeps every form — a background asset may own
 * several forms just like an item, so there is nothing to ask the caller to
 * drop first. What does change is what the forms are allowed to do: a
 * background form's footprint stays pinned at 1×1 (`assetFormService`).
 */
export async function updateAsset(id: number, input: UpdateAssetInput): Promise<Asset> {
  const row = await repo.findById(id);
  if (!row) {
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

export async function getUsages(id: number): Promise<AssetUsage[]> {
  if (!(await repo.findById(id))) {
    throw AppError.notFound('资源不存在');
  }
  return repo.getUsages(id);
}
