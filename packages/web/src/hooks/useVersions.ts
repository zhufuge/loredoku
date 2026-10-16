import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorCode } from '@loredoku/shared';
import type { MapVersionSummary, PublishViolation } from '@loredoku/shared';
import { ApiError } from '@/api/client';
import { versionsApi } from '@/api/versions';
import type { WorkSummary } from '@loredoku/shared';
import { mapKeys } from './useMap';
import { projectKeys } from './useProjects';

export const versionKeys = {
  all: ['versions', 'all'] as const,
  list: (id: number) => ['versions', id, 'list'] as const,
  detail: (id: number, versionNo: number) => ['versions', id, 'detail', versionNo] as const,
};

export function useVersions(id: number | null) {
  return useQuery({
    queryKey: versionKeys.list(id ?? 0),
    queryFn: () => versionsApi.list(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

/**
 * OPT-905 (docs/v0.3.4.md §5.1): the works table lists published versions
 * from every map at once.
 */
export function useAllWorks() {
  return useQuery({
    queryKey: versionKeys.all,
    queryFn: () => versionsApi.listAll(),
    placeholderData: (previous) => previous,
  });
}

/** One published work with its full snapshot (preview page). */
export function useWorkDetail(projectId: number | null, versionNo: number | null) {
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
  return useMutation<PublishResult, unknown, { notes?: string }>({
    mutationFn: async ({ notes }) => {
      try {
        const version = await versionsApi.publish(id, notes);
        return { ok: true, version };
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
         * instead, because it carries the two next steps (preview / works page).
         */
        void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: versionKeys.list(id) });
        void queryClient.invalidateQueries({ queryKey: versionKeys.all });
        void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      }
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '发布失败');
    },
  });
}

export function useCreateDraftFromVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, versionNo }: { id: number; versionNo: number }) =>
      versionsApi.createDraftFromVersion(id, versionNo),
    onSuccess: (_data, { id }) => {
      toast.success('已基于此作品创建草稿');
      void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
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
      toast.success('作品已删除');
      void queryClient.invalidateQueries({ queryKey: versionKeys.list(id) });
      void queryClient.invalidateQueries({ queryKey: versionKeys.all });
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败');
    },
  });
}
