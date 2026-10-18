import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ErrorCode } from '@loredoku/shared';
import type { MapDraft, MapVersionSummary, PublishViolation } from '@loredoku/shared';
import { ApiError } from '@/api/client';
import { versionsApi } from '@/api/versions';
import { mapEntryKeys, mapKeys } from './useMaps';

export const versionKeys = {
  list: (id: number) => ['versions', id, 'list'] as const,
  detail: (id: number, versionNo: number) => ['versions', id, 'detail', versionNo] as const,
};

/** SPEC-K13 §7.4: the version-history panel lists the whole blood lineage. */
export function useVersions(id: number | null) {
  return useQuery({
    queryKey: versionKeys.list(id ?? 0),
    queryFn: () => versionsApi.list(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/** One published version with its full snapshot (entry preview page). */
export function useVersionDetail(projectId: number | null, versionNo: number | null) {
  return useQuery({
    queryKey: versionKeys.detail(projectId ?? 0, versionNo ?? 0),
    queryFn: () => versionsApi.detail(projectId as number, versionNo as number),
    enabled: projectId !== null && versionNo !== null,
  });
}

export interface PublishResult {
  ok: boolean;
  violations?: PublishViolation[];
  /**
   * FEAT-H05 §5.3 (docs/v0.4.2.md §5.3): the newly published version, so the
   * success dialog can link straight to the preview. `versionsApi.publish`
   * already answers with `MapVersionSummary` — this just stops dropping it.
   */
  version?: MapVersionSummary;
}

export function usePublishProject(id: number) {
  const queryClient = useQueryClient();
  // 变量是「用户填的版本号」，`undefined` = 用服务端默认
  // （血统 MAX+1）。没改输入框就发 undefined，避免拿着过期的默认值撞 400。
  return useMutation<PublishResult, unknown, number | undefined>({
    mutationFn: async (version) => {
      try {
        const published = await versionsApi.publish(id, version);
        return { ok: true, version: published };
      } catch (error) {
        if (error instanceof ApiError && error.code === ErrorCode.PUBLISH_VALIDATION_FAILED) {
          const violations = Array.isArray(error.details)
            ? (error.details as PublishViolation[])
            : [];
          return { ok: false, violations };
        }
        throw error;
      }
    },
    onSuccess: (result) => {
      if (result.ok) {
        /*
         * FEAT-H05 §5.3: no toast any more — the editor raises a success dialog
         * instead, because it carries the two next steps (preview / map list).
         *
         * v0.5.0 FEAT-K10: publishing now **adds an entry to the map list**, so
         * the project list has to be invalidated too.
         */
        void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: versionKeys.list(id) });
        void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '发布失败');
    },
  });
}

/**
 * SPEC-K11 / Q3 = B (docs/v0.5.0.md §7.3): 「编辑此版本」 opens a new **work
 * entry** in the same lineage — `map_versions` is never written. The editor is
 * entered on the freshly created row.
 *
 * `data` 可选（编辑器里「保存时才生成草稿」带当前画布）；
 * `navigate: false` 供编辑器自己接管落盘后的跳转（它要 replace 而不是
 * push，且跳之前还得先把 store 标记成已保存）。
 */
export function useForkVersion(options: { navigate?: boolean } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ id, versionNo, data }: { id: number; versionNo: number; data?: MapDraft }) =>
      versionsApi.fork(id, versionNo, data),
    onSuccess: (project, { versionNo }) => {
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
      void queryClient.invalidateQueries({ queryKey: versionKeys.list(project.id) });
      /*
       * `navigate: false` = 调用方（编辑器）自己接管落盘后的跳转与提示 —— 它
       * 要 replace 到新行 URL，提示语也按「已基于 v{n} 生成新地图」写。这里再
       * 提示一次就成了同一次保存弹两条 toast。
       */
      if (options.navigate !== false) {
        toast.success(`已从 v${versionNo} 新增一个条目`);
        navigate(`/maps/${project.id}/edit`);
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '操作失败');
    },
  });
}

export function useDeleteVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionNo }: { id: number; versionNo: number }) =>
      versionsApi.remove(id, versionNo),
    onSuccess: (_data, { id }) => {
      toast.success('版本已删除');
      void queryClient.invalidateQueries({ queryKey: versionKeys.list(id) });
      void queryClient.invalidateQueries({ queryKey: mapEntryKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败');
    },
  });
}
