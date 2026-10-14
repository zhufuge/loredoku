import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CardTriggerInput } from '@murdoku/shared';
import {
  cardsApi,
  type CreateCardPayload,
  type ListCardsParams,
  type UpdateCardPayload,
} from '@/api/cards';

export const cardKeys = {
  all: ['cards'] as const,
  list: (params: ListCardsParams) => [...cardKeys.all, 'list', params] as const,
  usages: (id: number) => [...cardKeys.all, 'usages', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCards(params: ListCardsParams = {}) {
  return useQuery({
    queryKey: cardKeys.list(params),
    queryFn: () => cardsApi.list(params),
  });
}

export function useCardUsages(id: number | null) {
  return useQuery({
    queryKey: cardKeys.usages(id ?? 0),
    queryFn: () => cardsApi.usages(id as number),
    enabled: id !== null,
  });
}

function useInvalidateCards(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: cardKeys.all });
  };
}

export function useCreateCard(onSuccess?: (card: { id: number }) => void) {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: (payload: CreateCardPayload) => cardsApi.create(payload),
    onSuccess: (card) => {
      toast.success('卡片创建成功');
      invalidate();
      onSuccess?.(card);
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateCard(onSuccess?: () => void) {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCardPayload }) =>
      cardsApi.update(id, payload),
    onSuccess: () => {
      toast.success('卡片已保存');
      invalidate();
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '保存失败')),
  });
}

export function useReplaceTriggers(onSuccess?: () => void) {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: ({ id, triggers }: { id: number; triggers: CardTriggerInput[] }) =>
      cardsApi.replaceTriggers(id, triggers),
    onSuccess: () => {
      invalidate();
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '触发信息保存失败')),
  });
}

export function useDeleteCard() {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: ({ id, clearReferences }: { id: number; clearReferences: boolean }) =>
      cardsApi.remove(id, clearReferences),
    onSuccess: () => {
      toast.success('卡片已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useUploadCardImage() {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => cardsApi.uploadImage(id, file),
    onSuccess: () => {
      toast.success('图片已上传');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '上传失败')),
  });
}

export function useDeleteCardImage() {
  const invalidate = useInvalidateCards();
  return useMutation({
    mutationFn: (id: number) => cardsApi.deleteImage(id),
    onSuccess: () => {
      toast.success('图片已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
