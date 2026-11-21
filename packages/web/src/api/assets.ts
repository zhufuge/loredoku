import type { Asset, AssetVariant, AssetType, AssetFitMode, AssetUsage } from '@loredoku/shared';
import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ListAssetsParams {
  keyword?: string;
  isActive?: boolean;
  type?: AssetType;
  /** v0.8.0 §19：按主题**编码**筛（`/hlm/assets` 里那一段就是它）。 */
  themeCode?: string;
}

/** 建资源只写身份 / 行为 / **初始**形态的样子（docs/v0.6.1.md §5.2）；v0.7.6 起也不写「占地」—— 每次放置都是 1×1，「大小」只改看着多大。 */
export interface CreateAssetPayload {
  code: string;
  name: string;
  /** v0.8.0 §19：这条资源属于哪个主题。**必填**，用编码 —— 没有默认主题可落。 */
  themeCode: string;
  type?: AssetType;
  blocking?: boolean;
  /** 「背景修饰」— an item asset placed on the decoration layer. */
  decoration?: boolean;
  fitMode?: AssetFitMode;
  /** Colour-block colour; `null` = image mode. */
  bgColor?: string | null;
  /** `true` creates the asset already enabled. */
  isActive?: boolean;
}

export interface UpdateAssetPayload {
  name?: string;
  type?: AssetType;
  blocking?: boolean;
  /** 「背景修饰」— an item asset placed on the decoration layer. */
  decoration?: boolean;
  isActive?: boolean;
}

export interface CreateAssetVariantPayload {
  name: string;
}

export interface UpdateAssetVariantPayload {
  name?: string;
  fitMode?: AssetFitMode;
  /** `null` drops back to the image mode. */
  bgColor?: string | null;
  /** 占格足迹（缺省 1×1），仅物品形态有意义。 */
  w?: number;
  h?: number;
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

/** Variants live under their asset, one level below `assetsApi`. */
export const assetVariantsApi = {
  list(assetId: number): Promise<AssetVariant[]> {
    return apiGet<AssetVariant[]>(`/assets/${assetId}/variants`);
  },
  create(assetId: number, payload: CreateAssetVariantPayload): Promise<AssetVariant> {
    return apiPost<AssetVariant>(`/assets/${assetId}/variants`, payload);
  },
  update(assetId: number, variantId: number, payload: UpdateAssetVariantPayload): Promise<AssetVariant> {
    return apiPatch<AssetVariant>(`/assets/${assetId}/variants/${variantId}`, payload);
  },
  remove(assetId: number, variantId: number): Promise<null> {
    return apiDelete<null>(`/assets/${assetId}/variants/${variantId}`);
  },
  usages(assetId: number, variantId: number): Promise<AssetUsage[]> {
    return apiGet<AssetUsage[]>(`/assets/${assetId}/variants/${variantId}/usages`);
  },
  uploadImage(assetId: number, variantId: number, file: File): Promise<Asset> {
    const variant = new FormData();
    variant.append('file', file);
    return apiPost<Asset>(`/assets/${assetId}/variants/${variantId}/image`, variant);
  },
  deleteImage(assetId: number, variantId: number): Promise<Asset> {
    return apiDelete<Asset>(`/assets/${assetId}/variants/${variantId}/image`);
  },
};
