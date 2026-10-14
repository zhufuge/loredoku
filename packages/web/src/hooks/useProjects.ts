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
      toast.success('项目创建成功');
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
      toast.success('项目已更新');
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
      toast.success('项目已删除');
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
      toast.success('项目已复制');
      void queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
    onError: (error) => toast.error(errorMessage(error, '复制失败')),
  });
}
