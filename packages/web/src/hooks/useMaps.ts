import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mapsApi, type MapListParams } from '@/api/maps';
import type { CreateMapPayload, UpdateMapPayload } from '@/api/maps';

export const mapEntryKeys = {
  all: ['projects'] as const,
  list: (params: MapListParams) => [...mapEntryKeys.all, 'list', params] as const,
  detail: (id: number) => [...mapEntryKeys.all, 'detail', id] as const,
  /** FEAT-K03 §2.4: the published-version picker's own key. */
  publishedVersions: () => [...mapEntryKeys.all, 'published-versions'] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useMaps(params: MapListParams) {
  return useQuery({
    queryKey: mapEntryKeys.list(params),
    queryFn: () => mapsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useMapEntry(id: number | null) {
  return useQuery({
    queryKey: mapEntryKeys.detail(id ?? 0),
    queryFn: () => mapsApi.detail(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/**
 * FEAT-K03 (docs/v0.5.0.md §2.4): every **published** map version, for the
 * 「地图版本」 picker of the create-puzzle dialog.
 */
export function usePublishedVersions() {
  return useQuery({
    queryKey: mapEntryKeys.publishedVersions(),
    queryFn: () => mapsApi.listPublishedVersions(),
    placeholderData: (previous) => previous,
  });
}

export function useCreateMap(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateMapPayload) => mapsApi.create(payload),
    onSuccess: () => {
      toast.success('地图创建成功');
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateMap(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateMapPayload }) =>
      mapsApi.update(id, payload),
    onSuccess: () => {
      toast.success('地图已更新');
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}

export function useDeleteMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mapsApi.remove(id),
    onSuccess: () => {
      toast.success('地图已删除');
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

export function useDuplicateMap() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mapsApi.duplicate(id),
    onSuccess: () => {
      toast.success('地图已复制');
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '复制失败')),
  });
}

/**
 * FEAT-H03 §3.2(b) (docs/v0.4.2.md §3): the cover follows the **two-step** rule —
 * the map row is created / updated first, then the artwork is uploaded against
 * its id. These two mutations are the second step, and both write the refreshed
 * detail straight into the cache so the card repaints without a refetch.
 */
export function useUploadMapCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => mapsApi.uploadCover(id, file),
    onSuccess: (project) => {
      queryClient.setQueryData(mapEntryKeys.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面未上传成功')),
  });
}

export function useRemoveMapCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mapsApi.removeCover(id),
    onSuccess: (project) => {
      queryClient.setQueryData(mapEntryKeys.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面移除失败')),
  });
}
