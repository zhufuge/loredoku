import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  assetsApi,
  assetVariantsApi,
  type CreateAssetVariantPayload,
  type CreateAssetPayload,
  type ListAssetsParams,
  type UpdateAssetVariantPayload,
  type UpdateAssetPayload,
} from '@/api/assets';

export const assetKeys = {
  all: ['assets'] as const,
  list: (params: ListAssetsParams) => [...assetKeys.all, 'list', params] as const,
  usages: (id: number) => [...assetKeys.all, 'usages', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAssets(params: ListAssetsParams = {}) {
  return useQuery({
    queryKey: assetKeys.list(params),
    queryFn: () => assetsApi.list(params),
  });
}

export function useAssetUsages(id: number | null) {
  return useQuery({
    queryKey: assetKeys.usages(id ?? 0),
    queryFn: () => assetsApi.usages(id as number),
    enabled: id !== null,
  });
}

function useInvalidateAssets(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: assetKeys.all });
  };
}

export function useCreateAsset(onSuccess?: (asset: { id: number }) => void) {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: (payload: CreateAssetPayload) => assetsApi.create(payload),
    onSuccess: (asset) => {
      // v0.5.2 FEAT-M05: the image can now be picked inside the create dialog,
      // so "go upload it afterwards" is no longer the only path.
      toast.success('资源创建成功');
      invalidate();
      onSuccess?.(asset);
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateAssetPayload }) =>
      assetsApi.update(id, payload),
    onSuccess: () => {
      toast.success('资源已更新');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}


export function useDeleteAsset() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({
      id,
      hard,
      clearReferences,
    }: {
      id: number;
      hard?: boolean;
      clearReferences?: boolean;
    }) => assetsApi.remove(id, { hard, clearReferences }),
    onSuccess: (_data, variables) => {
      toast.success(variables.hard ? '资源已删除' : '资源已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useSetAssetActive() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? assetsApi.enable(id) : assetsApi.disable(id),
    onSuccess: (_data, variables) => {
      toast.success(variables.active ? '资源已启用' : '资源已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

// ---- v0.6.1: variants ----

export function useCreateAssetVariant() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: number; payload: CreateAssetVariantPayload }) =>
      assetVariantsApi.create(assetId, payload),
    onSuccess: () => {
      toast.success('形态已添加');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '添加失败')),
  });
}

export function useUpdateAssetVariant() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({
      assetId,
      variantId,
      payload,
    }: {
      assetId: number;
      variantId: number;
      payload: UpdateAssetVariantPayload;
    }) => assetVariantsApi.update(assetId, variantId, payload),
    onSuccess: () => {
      toast.success('形态已保存');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '保存失败')),
  });
}

export function useDeleteAssetVariant() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, variantId }: { assetId: number; variantId: number }) =>
      assetVariantsApi.remove(assetId, variantId),
    onSuccess: () => {
      toast.success('形态已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

export function useUploadAssetVariantImage() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, variantId, file }: { assetId: number; variantId: number; file: File }) =>
      assetVariantsApi.uploadImage(assetId, variantId, file),
    onSuccess: () => {
      toast.success('图片已上传');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '上传失败')),
  });
}

export function useDeleteAssetVariantImage() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, variantId }: { assetId: number; variantId: number }) =>
      assetVariantsApi.deleteImage(assetId, variantId),
    onSuccess: () => {
      toast.success('图片已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
