import type { Asset, AssetForm, AssetType, AssetFitMode, AssetUsage } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListAssetsParams {
  keyword?: string;
  isActive?: boolean;
  type?: AssetType;
}

/**
 * v0.6.1: the footprint and the look are no longer asset fields — what is left
 * here is identity, behaviour, and the **initial** form's look (docs/v0.6.1.md
 * §5.2). A larger footprint is a property of the form, edited after creation.
 */
export interface CreateAssetPayload {
  code: string;
  name: string;
  type?: AssetType;
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
  blocking?: boolean;
  isActive?: boolean;
}

export interface CreateAssetFormPayload {
  name: string;
  widthCells?: number;
  heightCells?: number;
}

export interface UpdateAssetFormPayload {
  name?: string;
  widthCells?: number;
  heightCells?: number;
  fitMode?: AssetFitMode;
  /** v0.5.1 FEAT-L01: `null` drops back to the image mode. */
  bgColor?: string | null;
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
};

/** v0.6.1: forms live under their asset, one level below `assetsApi`. */
export const assetFormsApi = {
  list(assetId: number): Promise<AssetForm[]> {
    return apiGet<AssetForm[]>(`/assets/${assetId}/forms`);
  },
  create(assetId: number, payload: CreateAssetFormPayload): Promise<AssetForm> {
    return apiPost<AssetForm>(`/assets/${assetId}/forms`, payload);
  },
  update(assetId: number, formId: number, payload: UpdateAssetFormPayload): Promise<AssetForm> {
    return apiPatch<AssetForm>(`/assets/${assetId}/forms/${formId}`, payload);
  },
  remove(assetId: number, formId: number): Promise<null> {
    return apiDelete<null>(`/assets/${assetId}/forms/${formId}`);
  },
  usages(assetId: number, formId: number): Promise<AssetUsage[]> {
    return apiGet<AssetUsage[]>(`/assets/${assetId}/forms/${formId}/usages`);
  },
  uploadImage(assetId: number, formId: number, file: File): Promise<Asset> {
    const form = new FormData();
    form.append('file', file);
    return apiPost<Asset>(`/assets/${assetId}/forms/${formId}/image`, form);
  },
  deleteImage(assetId: number, formId: number): Promise<Asset> {
    return apiDelete<Asset>(`/assets/${assetId}/forms/${formId}/image`);
  },
};
