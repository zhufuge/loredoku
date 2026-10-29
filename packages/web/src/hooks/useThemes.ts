import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Theme, ThemeDeploymentSummary, ThemeOption } from '@loredoku/shared';
import { themesApi, type CreateThemePayload, type DeployThemePayload, type UpdateThemePayload } from '@/api/themes';

/**
 * v0.8.0（docs/v0.8.0.md §7 / §19）—— 主题的取数与写入。
 *
 * 两个细节：
 *
 * 1. `themeKeys.options` 与 `themeKeys.list` 是两个键。切换器只关心「有哪几个主题」，
 *    卡片网格还要四个计数；把它们塞进同一个键会让「改一个主题的名字」把整页的计数
 *    一起重取。
 * 2. 每个键的**第二个参数都是编码**（§19）。主题没有 id 可传 —— 那是服务端的事。
 */
export const themeKeys = {
  all: ['themes'] as const,
  list: () => [...themeKeys.all, 'list'] as const,
  options: () => [...themeKeys.all, 'options'] as const,
  detail: (code: string) => [...themeKeys.all, 'detail', code] as const,
  deployments: () => ['theme-deployments'] as const,
  deploymentBySlug: (slug: string) => ['theme-deployments', 'by-slug', slug] as const,
};

export function useThemes() {
  return useQuery({ queryKey: themeKeys.list(), queryFn: () => themesApi.list() as Promise<Theme[]> });
}

export function useThemeOptions() {
  return useQuery({
    queryKey: themeKeys.options(),
    queryFn: () => themesApi.options() as Promise<ThemeOption[]>,
    // 主题很少变，作用域条不该每次进页面都闪一下。
    staleTime: 30_000,
  });
}

export function useThemeDetail(code: string | null) {
  return useQuery({
    queryKey: themeKeys.detail(code ?? ''),
    queryFn: () => themesApi.detail(code as string),
    enabled: Boolean(code),
  });
}

export function useCreateTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateThemePayload) => themesApi.create(payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('主题已创建');
    },
  });
}

export function useUpdateTheme(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateThemePayload) => themesApi.update(code, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已保存');
    },
  });
}

export function useDeleteTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => themesApi.remove(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('主题已删除');
    },
  });
}

export function useThemeDeployments() {
  return useQuery({
    queryKey: themeKeys.deployments(),
    queryFn: () => themesApi.deployments() as Promise<ThemeDeploymentSummary[]>,
  });
}

export function useThemeDeploymentBySlug(slug: string | null) {
  return useQuery({
    queryKey: themeKeys.deploymentBySlug(slug ?? ''),
    queryFn: () => themesApi.deploymentBySlug(slug as string),
    enabled: Boolean(slug),
  });
}

export function useDeployTheme(themeCode: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeployThemePayload) => themesApi.deploy(themeCode, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      void queryClient.invalidateQueries({ queryKey: themeKeys.deployments() });
      void queryClient.invalidateQueries({ queryKey: ['games'] });
      toast.success('主题已上线');
    },
  });
}

/**
 * 合辑下线（§9）：只删目录，不动那几关的部署 —— 单局仍然在线，玩家还能从
 * `/play` 的单局段进得去。这正是「合辑只是目录」的意思。
 */
export function useRemoveDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => themesApi.removeDeployment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.deployments() });
      toast.success('合辑已下线');
    },
    onError: (error: Error) => toast.error(error.message || '下线失败'),
  });
}
