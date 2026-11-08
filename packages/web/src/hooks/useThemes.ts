import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { resolveDifficultyTiers } from '@loredoku/shared';
import type {
  ForbiddenSymbolImage,
  Theme,
  ThemeDeploymentSummary,
  ThemeDifficultyTier,
  ThemeOption,
} from '@loredoku/shared';
import { themesApi, type CreateThemePayload, type DeployThemePayload, type UpdateThemePayload } from '@/api/themes';
import { forgetThemeCode } from '@/lib/workspace';

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
    /**
     * 失败必须说出来。没有这一条时，400 表现为「点了保存、弹窗不关、什么也没提示」——
     * 作者会以为是自己没点到，再点两次，然后报「保存不生效」。
     */
    onError: (error: Error) => toast.error(error.message || '保存失败'),
  });
}

/**
 * v0.8.6 §4 / v0.8.7 §4 —— 主题级的「禁止符号」，**即时保存**。
 *
 * 它不是「新建时抄一份」的缺省，而是本主题里**没单独配置**的谜题读取时的兜底：
 * 换一张图，跟随的关卡（含已发布的）下次打开就是新的。所以成功后要把
 * `themeKeys.all` 底下的一切一起失效 —— 播放页与谜题抽屉都按编码去查这份数据。
 *
 * 卡片里选好文件就上传、点移除就清掉，不再走「编辑 → 保存」。所以这里没有草稿：
 * 成功与失败都要当场有回音，且必须让工作空间里那份 `theme`（`WorkspaceLayout`
 * 从 `useThemes()` 取）一起刷新 —— 否则概览页的预览图要等下一次进页面才变。
 */
export function useUploadThemeForbiddenSymbol(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => themesApi.uploadForbiddenSymbol(code, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已设为本主题的默认禁止符号');
    },
    onError: (error: Error) => toast.error(error.message || '禁止符号上传失败'),
  });
}

/**
 * 移除主题级禁止符号 = 删掉 `data.forbiddenSymbol`：本主题里跟随的谜题回到默认的
 * `×` 字形（自己配过的那几题不受影响）。
 */
export function useRemoveThemeForbiddenSymbol(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => themesApi.removeForbiddenSymbol(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已移除默认禁止符号');
    },
    onError: (error: Error) => toast.error(error.message || '移除失败'),
  });
}

export function useDeleteTheme() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => themesApi.remove(code),
    /**
     * v0.8.3（docs/v0.8.3.md §13）：删成功就把「上一次在哪个工作空间」这条记忆
     * 一起清掉。留着它，接下来每一次「返回工坊」都会拼出 `/已删除的编码/overview`，
     * 落到「没有编码是 xxx 的主题」—— 而那时候一间工坊明明还在。
     */
    onSuccess: (_data, code) => {
      forgetThemeCode(code);
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

/**
 * v0.8.6 §3.6 —— 玩家侧要的「主题编码 → 难度分级」。
 *
 * 播放页（`/play`、`/play/theme/:slug`）在 `WorkspaceLayout` 外面，`useWorkspace()`
 * 拿到的是 `null`。`DifficultyBadge` 于是只能落到内置五档 —— 作者在概览页配的名字
 * 与颜色，到了玩家面前一个都不出现，第 6 档以后还直接变成「第 6 档」。
 *
 * 而 `MapGameSummary` 与 `ThemeDeploymentSummary` 都带着 `themeCode`（§19），所以
 * 这里把主题列表取一次、摊成一张表，卡按自己那一关的主题去查。
 *
 * **一次 `/themes` 换掉每张卡各问一次**：列表页二十几张卡，一张一个请求就是二十几次；
 * 主题数量是个位数，整份列表比分头取还小。分级的排序交给 `resolveDifficultyTiers`
 * ——「主题里存着什么顺序」不该由界面猜。
 */
export function useDifficultyTiersByCode(): (
  code: string | null | undefined,
) => readonly ThemeDifficultyTier[] | undefined {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, readonly ThemeDifficultyTier[]>();
    for (const theme of query.data ?? []) {
      map.set(theme.code, resolveDifficultyTiers(theme.data.difficultyLevels));
    }
    return map;
  }, [query.data]);

  // 同一个函数引用跨渲染保持稳定：它要传进几十张卡的 props。
  return useCallback(
    (code: string | null | undefined) => (code ? byCode.get(code) : undefined),
    [byCode],
  );
}

/**
 * v0.8.7 §4 —— 按主题编码查「禁止符号」：本主题里**没有单独配置**的谜题读到的就是它。
 *
 * 与 `useDifficultyTiersByCode` 同一种做法（同一份 `/themes`，同一个理由）：播放页与
 * 谜题编辑器都在 `WorkspaceLayout` 外面，`useWorkspace()` 是 `null`，拿不到上下文里
 * 那份 `theme`；而它们要的只是这一个小字段。整份列表取一次摊成表，按编码查。
 *
 * 谜题自己配了就不该用这份 —— 顺序（谜题 → 主题 → ×）在
 * `lib/forbiddenSymbol.ts`，两边都走它，不各写一遍。
 */
export function useForbiddenSymbolByCode(): (
  code: string | null | undefined,
) => ForbiddenSymbolImage | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, ForbiddenSymbolImage>();
    for (const theme of query.data ?? []) {
      const symbol = theme.data.forbiddenSymbol;
      if (symbol?.path) map.set(theme.code, symbol);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
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
