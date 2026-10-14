import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorCode } from '@murdoku/shared';
import type { PublishViolation } from '@murdoku/shared';
import { ApiError } from '@/api/client';
import { versionsApi } from '@/api/versions';
import type { MapVersionSummary } from '@murdoku/shared';
import { mapKeys } from './useMap';
import { projectKeys } from './useProjects';

export const versionKeys = {
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

/** One published work with its full snapshot (preview page). */
export function useWorkDetail(projectId: number | null, versionNo: number | null) {
  return useQuery({
    queryKey: versionKeys.detail(projectId ?? 0, versionNo ?? 0),
    queryFn: () => versionsApi.detail(projectId as number, versionNo as number),
    enabled: projectId !== null && versionNo !== null,
  });
}

/** The work list is ordered newest-first by the backend; sort defensively. */
export function sortWorks(works: MapVersionSummary[]): MapVersionSummary[] {
  return [...works].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export interface PublishResult {
  ok: boolean;
  violations?: PublishViolation[];
}

export function usePublishProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation<PublishResult, unknown, { notes?: string }>({
    mutationFn: async ({ notes }) => {
      try {
        await versionsApi.publish(id, notes);
        return { ok: true };
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
        toast.success('发布成功，已生成新作品');
        void queryClient.invalidateQueries({ queryKey: mapKeys.detail(id) });
        void queryClient.invalidateQueries({ queryKey: versionKeys.list(id) });
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
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : '删除失败');
    },
  });
}
