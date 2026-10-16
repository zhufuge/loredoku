import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MapDraft } from '@loredoku/shared';
import { mapApi, type SaveMapPayload } from '@/api/map';
import { mapEntryKeys } from './useMaps';

export const mapKeys = {
  detail: (id: number) => ['map', id] as const,
};

export function useProjectMap(id: number) {
  return useQuery({
    queryKey: mapKeys.detail(id),
    queryFn: () => mapApi.get(id),
    enabled: Number.isFinite(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SaveMapPayload }) =>
      mapApi.save(id, payload),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(mapKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      toast.success('画布已保存');
    },
    onError: (error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
      toast.error(error instanceof Error ? error.message : '保存失败');
    },
  });
}

export function useImportMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MapDraft }) => mapApi.import(id, data),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      toast.success('已导入草稿');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '导入失败');
    },
  });
}

export function useUpdateGridSize() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, gridSize }: { id: number; gridSize: number }) =>
      mapApi.updateGridSize(id, gridSize),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '调整尺寸失败');
    },
  });
}

