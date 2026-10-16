import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
      // v0.5.2 FEAT-M05: the image can now be picked inside the create dialog,
      // so "go upload it afterwards" is no longer the only path.
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

// v0.5.2 FEAT-M03: `useReplaceItemTriggers` went away with the
// `PUT /api/items/:id/triggers` endpoint.

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({
      id,
      hard,
      clearReferences,
    }: {
      id: number;
      hard?: boolean;
      clearReferences?: boolean;
    }) => itemsApi.remove(id, { hard, clearReferences }),
    onSuccess: (_data, variables) => {
      toast.success(variables.hard ? '物品已删除' : '物品已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useSetItemActive() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      active ? itemsApi.enable(id) : itemsApi.disable(id),
    onSuccess: (_data, variables) => {
      toast.success(variables.active ? '物品已启用' : '物品已停用');
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
      toast.success('图片已删除，该物品已自动停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
