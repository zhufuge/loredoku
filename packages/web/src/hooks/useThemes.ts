import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GAME_TOOL_ICON_LABELS,
  DEFAULT_MAP_STYLE,
  MAP_STYLE_RULER_DEFAULT_SYMBOLS,
  resolveDifficultyTiers,
} from '@loredoku/shared';
import type {
  UploadedImage,
  GameToolIconKind,
  GameToolIcons,
  Theme,
  ThemeCheckColors,
  ThemeDifficultyTier,
  ThemeOption,
  ThemeRing,
} from '@loredoku/shared';
import { themesApi, type CreateThemePayload, type UpdateThemePayload } from '@/api/themes';
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
 * v0.8.6 §4 / v0.8.7 §4；v0.9.5 更名 —— 主题级的「标记」，**即时保存**。
 *
 * 它不是「新建时抄一份」的缺省，而是本主题里**没单独配置**的谜题读取时的兜底：
 * 换一张图，跟随的关卡（含已发布的）下次打开就是新的。所以成功后要把
 * `themeKeys.all` 底下的一切一起失效 —— 播放页与谜题抽屉都按编码去查这份数据。
 *
 * 卡片里选好文件就上传、点移除就清掉，不再走「编辑 → 保存」。所以这里没有草稿：
 * 成功与失败都要当场有回音，且必须让工作空间里那份 `theme`（`WorkspaceLayout`
 * 从 `useThemes()` 取）一起刷新 —— 否则概览页的预览图要等下一次进页面才变。
 */
export function useUploadThemeMark(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => themesApi.uploadMark(code, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已设为本主题的默认标记');
    },
    onError: (error: Error) => toast.error(error.message || '标记上传失败'),
  });
}

/**
 * 移除主题级标记 = 删掉 `data.mark`：本主题里跟随的谜题回到默认的
 * `×` 字形（自己配过的那几题不受影响）。
 */
export function useRemoveThemeMark(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => themesApi.removeMark(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已移除默认标记');
    },
    onError: (error: Error) => toast.error(error.message || '移除失败'),
  });
}

/**
 * v0.8.7 §7 —— 主题的工具按钮图标（清除 / 撤回 / 提交），**一次一枚、即时保存**。
 *
 * 一次一枚是故意的：作者通常只想换「清除」那一枚，重新上传另外两枚既费事又会让
 * 三枚的 `path` 各自变成新文件。成功后同样把 `themeKeys.all` 一起失效 —— 播放页与
 * 谜题抽屉都按编码查这份数据。
 */
export function useUploadThemeToolIcon(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ icon, file }: { icon: GameToolIconKind; file: File }) =>
      themesApi.uploadToolIcon(code, icon, file),
    onSuccess: (_theme, { icon }) => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success(`已设为本主题的${GAME_TOOL_ICON_LABELS[icon]}图标`);
    },
    onError: (error: Error) => toast.error(error.message || '图标上传失败'),
  });
}

/** 移除一枚 = 把 `data.toolIcons[icon]` 删掉，另外两枚不动。 */
export function useRemoveThemeToolIcon(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (icon: GameToolIconKind) => themesApi.removeToolIcon(code, icon),
    onSuccess: (_theme, icon) => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success(`已移除${GAME_TOOL_ICON_LABELS[icon]}图标`);
    },
    onError: (error: Error) => toast.error(error.message || '移除失败'),
  });
}

/**
 * v0.9.2 §2 —— 长按放置参与者时的**计时环**图，即时保存。
 *
 * 与标记 / 工具图标同一条链路：成功即把 `themeKeys.all` 集体失效 —— 游戏页
 * 是按编码查这份数据的，换一张图所有关卡下次打开（或立即重取）就是新的。
 */
export function useUploadThemeRing(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => themesApi.uploadRing(code, file),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已设为本主题的圆环');
    },
    onError: (error: Error) => toast.error(error.message || '圆环上传失败'),
  });
}

/** 移除 = 删掉 `data.ring`：所有关卡回到各自的内置细弧。 */
export function useRemoveThemeRing(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => themesApi.removeRing(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success('已恢复默认圆环');
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

/**
 * v0.8.6 §3.6 —— 玩家侧要的「主题编码 → 难度分级」。
 *
 * 播放页（`/play`）在 `WorkspaceLayout` 外面，`useWorkspace()`
 * 拿到的是 `null`。`DifficultyBadge` 于是只能落到内置五档 —— 作者在概览页配的名字
 * 与颜色，到了玩家面前一个都不出现，第 6 档以后还直接变成「第 6 档」。
 *
 * 而 `MapGameSummary` 带着 `themeCode`（§19），所以
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
 * v0.8.7 §4 —— 按主题编码查「标记」：本主题里**没有单独配置**的谜题读到的就是它。
 *
 * 与 `useDifficultyTiersByCode` 同一种做法（同一份 `/themes`，同一个理由）：播放页与
 * 谜题编辑器都在 `WorkspaceLayout` 外面，`useWorkspace()` 是 `null`，拿不到上下文里
 * 那份 `theme`；而它们要的只是这一个小字段。整份列表取一次摊成表，按编码查。
 *
 * 谜题自己配了就不该用这份 —— 顺序（谜题 → 主题 → ×）在
 * `lib/mark.ts`，两边都走它，不各写一遍。
 */
export function useMarkByCode(): (
  code: string | null | undefined,
) => UploadedImage | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, UploadedImage>();
    for (const theme of query.data ?? []) {
      const symbol = theme.data.mark;
      if (symbol?.path) map.set(theme.code, symbol);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
}

/**
 * v0.8.7 §7 —— 按主题编码查「工具按钮图标」（清除 / 撤回 / 提交）。
 *
 * 与 `useMarkByCode` 同一个理由、同一份 `/themes`：播放页与谜题编辑器都
 * 在 `WorkspaceLayout` 外面，拿不到上下文那份 `theme`，只能按编码查表。三枚一起给，
 * 因为工具栏一屏要画全套；解析顺序（谜题 → 主题 → 内置）在 `lib/toolIcons.ts`。
 */
export function useToolIconsByCode(): (
  code: string | null | undefined,
) => GameToolIcons | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, GameToolIcons>();
    for (const theme of query.data ?? []) {
      const icons = theme.data.toolIcons;
      if (icons && Object.keys(icons).length > 0) map.set(theme.code, icons);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
}
/**
 * v0.9.2 §2；v0.9.5 起与校验圈**合并成一张**：按主题编码查**那一圈**。
 *
 * 与标记 / 工具图标同一份 `/themes`、同一个理由：游戏页在工作空间外面，
 * 只能按编码查表。只有一份（`{ image }`），所以不像工具图标那样摊成 `GameToolIcons`。
 *
 * 两个消费点读同一份：长按放置的进度环、提交校验的结果环。
 */
export function useRingByCode(): (
  code: string | null | undefined,
) => ThemeRing | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, ThemeRing>();
    for (const theme of query.data ?? []) {
      const ring = theme.data.ring;
      if (ring?.image?.path) map.set(theme.code, ring);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
}

/**
 * v0.10.8 —— 按主题编码查**标尺的行列符号**（默认 `C` / `R`，中文图可能是「列」「行」）。
 *
 * 与标记 / 工具图标 / 那一圈同一份 `/themes`、同一个理由：游戏页、预览页、全屏编辑器
 * 都在 `WorkspaceLayout` 外面，`useWorkspace()` 是 `null`，只能按编码查表。
 *
 * **为什么只有主题有这一项**：符号是「这一套世界怎么念行与列」，跟主题的识别色、
 * 难度分级是同一层的东西；同一主题下的几十张图不该各自去填一遍，更不该出现
 * 「这张图印 C、那张印 列」。地图草稿里即使还留着旧值也**不参与渲染**（v0.10.8 起），
 * 保存时会被剥掉（`stripRulerSymbols`）。
 */
export function useRulerSymbolsByCode(): (
  code: string | null | undefined,
) => { columnSymbol: string; rowSymbol: string } {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, { columnSymbol: string; rowSymbol: string }>();
    for (const theme of query.data ?? []) {
      // 主题的 `style` 可能是 `null`（`default` / `xyj` 都是），也可能是 v0.10.8 之前
      // 存的、根本没有这两个键 —— 那两种都在末尾的兜底里回到内置的 `C` / `R`。
      const ruler = theme.data.style?.ruler;
      if (!ruler) continue;
      map.set(theme.code, {
        columnSymbol: ruler.columnSymbol ?? MAP_STYLE_RULER_DEFAULT_SYMBOLS.columnSymbol,
        rowSymbol: ruler.rowSymbol ?? MAP_STYLE_RULER_DEFAULT_SYMBOLS.rowSymbol,
      });
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) =>
      (code ? byCode.get(code) : undefined) ?? {
        columnSymbol: MAP_STYLE_RULER_DEFAULT_SYMBOLS.columnSymbol,
        rowSymbol: MAP_STYLE_RULER_DEFAULT_SYMBOLS.rowSymbol,
      },
    [byCode],
  );
}

/**
 * v0.9.3 §3 —— 按主题编码查「提交校验」的样子（两档颜色 + 圈图）。
 *
 * 与上面两个 `*ByCode` 同一个理由：游戏页在工作空间外面，只能按编码查表。
 * 这里整份 `checkStyle` 一起给 —— 颜色与圈图是同一个配置的两半，分开取会让
 * 「作者刚改了颜色、圈图还是旧的」这种半新半旧的状态出现在同一帧里。
 *
 * 返回值可能是 `null`（主题没配过），由 `lib/checkStyle.ts` 填默认绿 / 红。
 */
export function useCheckColorsByCode(): (
  code: string | null | undefined,
) => ThemeCheckColors | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, ThemeCheckColors>();
    for (const theme of query.data ?? []) {
      const style = theme.data.checkStyle;
      if (style) map.set(theme.code, style);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
}

/**
 * v0.9.3 §3：改两档颜色。与上传圈图分开 —— 取色器每动一下只发一个颜色。
 */
export function useUpdateThemeCheckStyle(code: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: { passColor?: string; failColor?: string }) =>
      themesApi.updateCheckStyle(code, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
    },
    onError: (error: Error) => toast.error(error.message || '校验颜色保存失败'),
  });
}

