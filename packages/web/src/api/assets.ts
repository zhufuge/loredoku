import type { Asset, AssetType, AssetFitMode, AssetUsage } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListAssetsParams {
  keyword?: string;
  isActive?: boolean;
  type?: AssetType;
}

export interface CreateAssetPayload {
  code: string;
  name: string;
  type?: AssetType;
  widthCells?: number;
  heightCells?: number;
  blocking?: boolean;
  fitMode?: AssetFitMode;
  /** v0.5.1 FEAT-L01: colour-block colour; `null` = image mode. */
  bgColor?: string | null;
  /** v0.5.3 FEAT-N06: `true` creates the asset already enabled. */
  isActive?: boolean;
  // v0.5.2 FEAT-M03: `meta` and `triggers` were deleted with the columns.
}

export interface UpdateAssetPayload {
  name?: string;
  type?: AssetType;
  widthCells?: number;
  heightCells?: number;
  blocking?: boolean;
  fitMode?: AssetFitMode;
  /** v0.5.1 FEAT-L01: `null` drops back to the image mode. */
  bgColor?: string | null;
  isActive?: boolean;
}

export const assetsApi = {
  list(params: ListAssetsParams = {}): Promise<Asset[]> {
    return apiGet<Asset[]>('/assets', { params });
  },
  detail(id: number): Promise<Asset> {
    return apiGet<Asset>(`/assets/${id}`);
  },
  create(payload: CreateAssetPayload): Promise<Asset> {
    return apiPost<Asset>('/assets', payload);
  },
  update(id: number, payload: UpdateAssetPayload): Promise<Asset> {
    return apiPatch<Asset>(`/assets/${id}`, payload);
  },
  remove(id: number, options: { hard?: boolean; clearReferences?: boolean } = {}): Promise<null> {
    return apiDelete<null>(`/assets/${id}`, {
      params: { hard: options.hard ?? false, clearReferences: options.clearReferences ?? false },
    });
  },
  enable(id: number): Promise<Asset> {
    return apiPost<Asset>(`/assets/${id}/enable`, {});
  },
  disable(id: number): Promise<Asset> {
    return apiPost<Asset>(`/assets/${id}/disable`, {});
  },
  usages(id: number): Promise<AssetUsage[]> {
    return apiGet<AssetUsage[]>(`/assets/${id}/usages`);
  },
  uploadImage(id: number, file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Asset>(`/assets/${id}/image`, form);
  },
  deleteImage(id: number): Promise<Asset> {
    return apiDelete<Asset>(`/assets/${id}/image`);
  },
};
