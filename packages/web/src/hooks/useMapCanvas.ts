import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MapDraft } from '@loredoku/shared';
import { mapCanvasApi, type SaveMapPayload } from '@/api/mapCanvas';
import { mapKeys, mapCanvasKeys } from './useMaps';

export function useMapCanvas(id: number) {
  return useQuery({
    queryKey: mapCanvasKeys.detail(id),
    queryFn: () => mapCanvasApi.get(id),
    enabled: Number.isFinite(id),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function useSaveMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: SaveMapPayload }) =>
      mapCanvasApi.save(id, payload),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(mapCanvasKeys.detail(id), data);
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
      toast.success('画布已保存');
    },
    onError: (error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapCanvasKeys.detail(id) });
      toast.error(error instanceof Error ? error.message : '保存失败');
    },
  });
}

export function useImportMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: MapDraft }) => mapCanvasApi.import(id, data),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapCanvasKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
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
      mapCanvasApi.updateGridSize(id, gridSize),
    onSuccess: (_data, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapCanvasKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '调整尺寸失败');
    },
  });
}

