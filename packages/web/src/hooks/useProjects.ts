import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { projectsApi, type ProjectListParams } from '@/api/projects';
import type { CreateProjectPayload, UpdateProjectPayload } from '@/api/projects';

export const projectKeys = {
  all: ['projects'] as const,
  list: (params: ProjectListParams) => [...projectKeys.all, 'list', params] as const,
  detail: (id: number) => [...projectKeys.all, 'detail', id] as const,
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useProjects(params: ProjectListParams) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: () => projectsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useProject(id: number | null) {
  return useQuery({
    queryKey: projectKeys.detail(id ?? 0),
    queryFn: () => projectsApi.detail(id as number),
    enabled: id !== null && Number.isFinite(id),
  });
}

export function useCreateProject(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateProjectPayload) => projectsApi.create(payload),
    onSuccess: () => {
      toast.success('地图创建成功');
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '创建失败')),
  });
}

export function useUpdateProject(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdateProjectPayload }) =>
      projectsApi.update(id, payload),
    onSuccess: () => {
      toast.success('地图已更新');
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
      onSuccess?.();
    },
    onError: (error) => toast.error(errorMessage(error, '更新失败')),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.remove(id),
    onSuccess: () => {
      toast.success('地图已删除');
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '删除失败')),
  });
}

export function useDuplicateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.duplicate(id),
    onSuccess: () => {
      toast.success('地图已复制');
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
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
export function useUploadProjectCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => projectsApi.uploadCover(id, file),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面未上传成功')),
  });
}

export function useRemoveProjectCover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => projectsApi.removeCover(id),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project);
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '封面移除失败')),
  });
}
