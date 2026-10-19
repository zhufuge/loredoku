import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  assetsApi,
  assetFormsApi,
  type CreateAssetFormPayload,
  type CreateAssetPayload,
  type ListAssetsParams,
  type UpdateAssetFormPayload,
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

// ---- v0.6.1: forms ----

export function useCreateAssetForm() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, payload }: { assetId: number; payload: CreateAssetFormPayload }) =>
      assetFormsApi.create(assetId, payload),
    onSuccess: () => {
      toast.success('形态已添加');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '添加失败')),
  });
}

export function useUpdateAssetForm() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({
      assetId,
      formId,
      payload,
    }: {
      assetId: number;
      formId: number;
      payload: UpdateAssetFormPayload;
    }) => assetFormsApi.update(assetId, formId, payload),
    onSuccess: () => {
      toast.success('形态已保存');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '保存失败')),
  });
}

export function useDeleteAssetForm() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, formId }: { assetId: number; formId: number }) =>
      assetFormsApi.remove(assetId, formId),
    onSuccess: () => {
      toast.success('形态已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

export function useUploadAssetFormImage() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, formId, file }: { assetId: number; formId: number; file: File }) =>
      assetFormsApi.uploadImage(assetId, formId, file),
    onSuccess: () => {
      toast.success('图片已上传');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '上传失败')),
  });
}

export function useDeleteAssetFormImage() {
  const invalidate = useInvalidateAssets();
  return useMutation({
    mutationFn: ({ assetId, formId }: { assetId: number; formId: number }) =>
      assetFormsApi.deleteImage(assetId, formId),
    onSuccess: () => {
      toast.success('图片已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
