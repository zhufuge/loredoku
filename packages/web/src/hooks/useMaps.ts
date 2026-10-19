import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MapEntry, MapResponse } from '@loredoku/shared';
import { mapsApi, type MapListParams } from '@/api/maps';
import type { CreateMapPayload, UpdateMapPayload } from '@/api/maps';

export const mapKeys = {
  all: ['maps'] as const,
  list: (params: MapListParams) => [...mapKeys.all, 'list', params] as const,
  detail: (id: number) => [...mapKeys.all, 'detail', id] as const,
  /** FEAT-K03 §2.4: the published-version picker's own key. */
  publishedVersions: () => [...mapKeys.all, 'published-versions'] as const,
};

/**
 * The editor's own query (`GET /maps/:id/map`) — a **different** key from
 * `mapKeys.detail`: it carries the canvas draft on top of the map row.
 * It is cached with `staleTime: Infinity`, so nothing refreshes it by accident;
 * whoever writes the map row has to invalidate it explicitly.
 */
export const mapCanvasKeys = {
  detail: (id: number) => ['map', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * 编辑器的 `GET /maps/:id/map` 把地图行**快照**放在 `map` 上，且缓存
 * `staleTime: Infinity`。改名 / 换封面后先就地改这份缓存，标题与封面不会
 * 在重取回来前闪回旧值；失效仍然照发，保证列表与别处的数据对齐。
 */
function patchCanvasEntry(queryClient: QueryClient, entry: MapEntry): void {
  queryClient.setQueryData<MapResponse>(mapCanvasKeys.detail(entry.id), (previous) =>
    previous ? { ...previous, map: entry } : previous,
  );
}

export function useMaps(params: MapListParams) {
  return useQuery({
    queryKey: mapKeys.list(params),
    queryFn: () => mapsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useMapEntry(id: number | null) {
  return useQuery({
    queryKey: mapKeys.detail(id ?? 0),
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
    queryKey: mapKeys.publishedVersions(),
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
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
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
    onSuccess: (mapEntry) => {
      toast.success('地图已更新');
      // 改名 / 改简介落的是 `maps` 行，而编辑器的标题读的是 `GET /map` 的
      // `map` 快照 —— 那份缓存 `staleTime: Infinity`，不失效就一直是旧名。
      patchCanvasEntry(queryClient, mapEntry);
      void queryClient.invalidateQueries({ queryKey: mapCanvasKeys.detail(mapEntry.id) });
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
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
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
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
    onSuccess: (mapEntry) => {
      patchCanvasEntry(queryClient, mapEntry);
      queryClient.setQueryData(mapKeys.detail(mapEntry.id), mapEntry);
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面未上传成功')),
  });
}

export function useRemoveMapCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => mapsApi.removeCover(id),
    onSuccess: (mapEntry) => {
      patchCanvasEntry(queryClient, mapEntry);
      queryClient.setQueryData(mapKeys.detail(mapEntry.id), mapEntry);
      void queryClient.invalidateQueries({ queryKey: mapKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面移除失败')),
  });
}
