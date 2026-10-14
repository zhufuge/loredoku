import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ItemTriggerInput } from '@murdoku/shared';
import {
  itemsApi,
  type CreateItemPayload,
  type ListItemsParams,
  type UpdateItemPayload,
} from '@/api/items';

export const itemKeys = {
  all: ['items'] as const,
  list: (params: ListItemsParams) => [...itemKeys.all, 'list', params] as const,
  usages: (id: number) => [...itemKeys.all, 'usages', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useItems(params: ListItemsParams = {}) {
  return useQuery({
    queryKey: itemKeys.list(params),
    queryFn: () => itemsApi.list(params),
  });
}

export function useItemUsages(id: number | null) {
  return useQuery({
    queryKey: itemKeys.usages(id ?? 0),
    queryFn: () => itemsApi.usages(id as number),
    enabled: id !== null,
  });
}

function useInvalidateItems(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: itemKeys.all });
  };
}

export function useCreateItem(onSuccess?: (item: { id: number }) => void) {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (payload: CreateItemPayload) => itemsApi.create(payload),
    onSuccess: (item) => {
      toast.success('物品创建成功');
      invalidate();
      onSuccess?.(item);
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateItemPayload }) =>
      itemsApi.update(id, payload),
    onSuccess: () => {
      toast.success('物品已更新');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}

export function useReplaceItemTriggers(onSuccess?: () => void) {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, triggers }: { id: number; triggers: ItemTriggerInput[] }) =>
      itemsApi.replaceTriggers(id, triggers),
    onSuccess: () => {
      invalidate();
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '触发信息保存失败')),
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, clearReferences }: { id: number; clearReferences: boolean }) =>
      itemsApi.remove(id, clearReferences),
    onSuccess: () => {
      toast.success('物品已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useUploadItemImage() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => itemsApi.uploadImage(id, file),
    onSuccess: () => {
      toast.success('图片已上传');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '上传失败')),
  });
}

export function useDeleteItemImage() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (id: number) => itemsApi.deleteImage(id),
    onSuccess: () => {
      toast.success('图片已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
