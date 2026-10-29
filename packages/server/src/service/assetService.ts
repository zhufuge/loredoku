import type {
  Asset,
  AssetUsage,
  CreateAssetInput,
  ListAssetsQuery,
  UpdateAssetInput,
} from '@loredoku/shared';
import { DEFAULT_ASSET_VARIANT_NAME } from '@loredoku/shared';
import * as repo from '../repository/assetRepository';
import * as themeService from './themeService';
import { AppError } from '../utils/AppError';

export async function listAssets(query: ListAssetsQuery): Promise<Asset[]> {
  // §19：接口按编码筛，仓储按 `theme_id` 筛 —— 翻译只发生在这一层。
  const { themeCode, ...rest } = query;
  return repo.listAssets({ ...rest, themeId: await themeService.filterThemeId(themeCode) });
}

export async function getAsset(id: number): Promise<Asset> {
  const asset = await repo.getAsset(id);
  if (!asset) {
    throw AppError.notFound('资源不存在');
  }
  return asset;
}

/**
 * v0.6.1: creating an asset creates its first variant in the same transaction
 * (docs/v0.6.1.md §5.2). v0.7.6: that variant says nothing about size — every
 * placement is 1×1 and 「大小」 only changes how big it looks.
 */
export async function createAsset(input: CreateAssetInput): Promise<Asset> {
  // v0.8.0：`code` 只在主题内唯一（docs/v0.8.0.md §3.2），所以查重带主题。
  // §19：主题必填且用编码 —— 没有默认主题可落。
  const themeId = await themeService.requireThemeId(input.themeCode);
  if (await repo.findByCode(input.code, themeId)) {
    throw AppError.conflict('业务 ID 已存在');
  }
  const id = await repo.create({
    themeId,
    code: input.code,
    name: input.name,
    type: input.type,
    blocking: input.blocking,
    isActive: input.isActive,
    initialVariant: {
      name: DEFAULT_ASSET_VARIANT_NAME,
      fitMode: input.fitMode,
      bgColor: input.bgColor ?? null,
    },
  });
  return getAsset(id);
}

/**
 * v0.6.1: switching the type keeps every variant — a background asset may own
 * several variants just like an item, so there is nothing to ask the caller to
 * drop first. (v0.7.6: the footprint clause is gone — no variant declares one
 * any more, and every placement is 1×1.)
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
