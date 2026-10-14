import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  charactersApi,
  type CreateCharacterPayload,
  type ListCharactersParams,
  type UpdateCharacterPayload,
} from '@/api/characters';

export const characterKeys = {
  all: ['characters'] as const,
  list: (params: ListCharactersParams) => [...characterKeys.all, 'list', params] as const,
  usages: (id: number) => [...characterKeys.all, 'usages', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCharacters(params: ListCharactersParams = {}) {
  return useQuery({
    queryKey: characterKeys.list(params),
    queryFn: () => charactersApi.list(params),
  });
}

export function useCharacterUsages(id: number | null) {
  return useQuery({
    queryKey: characterKeys.usages(id ?? 0),
    queryFn: () => charactersApi.usages(id as number),
    enabled: id !== null,
  });
}

function useInvalidate(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: characterKeys.all });
  };
}

export function useCreateCharacter(onSuccess?: (character: { id: number }) => void) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (payload: CreateCharacterPayload) => charactersApi.create(payload),
    onSuccess: (character) => {
      toast.success('角色创建成功');
      invalidate();
      onSuccess?.(character);
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateCharacter() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateCharacterPayload }) =>
      charactersApi.update(id, payload),
    onSuccess: () => {
      toast.success('角色已更新');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}

export function useDeleteCharacter() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => charactersApi.remove(id),
    onSuccess: () => {
      toast.success('角色已停用');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '操作失败')),
  });
}

export function useUploadCharacterAvatar() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => charactersApi.uploadAvatar(id, file),
    onSuccess: () => {
      toast.success('头像已上传');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '上传失败')),
  });
}

export function useDeleteCharacterAvatar() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => charactersApi.deleteAvatar(id),
    onSuccess: () => {
      toast.success('头像已删除');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}
