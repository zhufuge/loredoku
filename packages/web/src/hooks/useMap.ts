import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mapApi, type SaveMapPayload } from '@/api/map';
import { projectKeys } from './useProjects';

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
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      toast.success('画布已保存');
    },
    onError: (error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
      toast.error(error instanceof Error ? error.message : '保存失败');
    },
  });
}
