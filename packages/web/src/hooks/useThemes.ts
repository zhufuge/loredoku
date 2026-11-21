import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GAME_TOOL_ICON_LABELS, MAP_STYLE_RULER_DEFAULT_SYMBOLS } from '@loredoku/shared';
import type {
  UploadedImage,
  GameToolIconKind,
  GameToolIcons,
  Theme,
  ThemeCheckColors,
  ThemeRing,
  ThemeVerdict,
} from '@loredoku/shared';
import { themesApi, type CreateThemePayload, type UpdateThemePayload } from '@/api/themes';
import { forgetThemeCode } from '@/lib/workspace';

function useThemeMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  successMessage: string | ((data: TData, vars: TVars) => string),
  errorFallback: string,
  onSuccess?: (data: TData, vars: TVars) => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data, vars) => {
      onSuccess?.(data, vars);
      void queryClient.invalidateQueries({ queryKey: themeKeys.all });
      toast.success(typeof successMessage === 'function' ? successMessage(data, vars) : successMessage);
    },
    onError: (error: Error) => toast.error(error.message || errorFallback),
  });
}
/**
 * 主题的取数与写入（docs/v0.8.0.md §7 / §19）；每个键第二参都是编码。
 */
export const themeKeys = {
  all: ['themes'] as const,
  list: () => [...themeKeys.all, 'list'] as const,
  detail: (code: string) => [...themeKeys.all, 'detail', code] as const,
};

export function useThemes() {
  return useQuery({ queryKey: themeKeys.list(), queryFn: () => themesApi.list() as Promise<Theme[]> });
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
  return useThemeMutation(
    (payload: UpdateThemePayload) => themesApi.update(code, payload),
    '已保存',
    '保存失败',
  );
}

/**
 * 主题级「标记」即时保存（无草稿，成败当场回音）；成功后失效 `themeKeys.all`，并刷新工作空间那份 `theme`。
 */
export function useUploadThemeMark(code: string) {
  return useThemeMutation(
    (file: File) => themesApi.uploadMark(code, file),
    '已设为本主题的默认标记',
    '标记上传失败',
  );
}

/** 移除主题级标记 = 删掉 `data.mark`：跟随的谜题回到默认 `×` 字形。 */
export function useRemoveThemeMark(code: string) {
  return useThemeMutation(() => themesApi.removeMark(code), '已移除默认标记', '移除失败');
}

/** 主题的工具按钮图标，一次一枚、即时保存；成功后同样失效 `themeKeys.all`。 */
export function useUploadThemeToolIcon(code: string) {
  return useThemeMutation(
    ({ icon, file }: { icon: GameToolIconKind; file: File }) =>
      themesApi.uploadToolIcon(code, icon, file),
    (_theme, { icon }) => `已设为本主题的${GAME_TOOL_ICON_LABELS[icon]}图标`,
    '图标上传失败',
  );
}

/** 移除一枚 = 把 `data.toolIcons[icon]` 删掉，另外两枚不动。 */
export function useRemoveThemeToolIcon(code: string) {
  return useThemeMutation(
    (icon: GameToolIconKind) => themesApi.removeToolIcon(code, icon),
    (_theme, icon) => `已移除${GAME_TOOL_ICON_LABELS[icon]}图标`,
    '移除失败',
  );
}

/** 长按放置的计时环图，即时保存；成功后失效 `themeKeys.all`（游戏页按编码查）。 */
export function useUploadThemeRing(code: string) {
  return useThemeMutation(
    (file: File) => themesApi.uploadRing(code, file),
    '已设为本主题的圆环',
    '圆环上传失败',
  );
}

/** 移除 = 删掉 `data.ring`：所有关卡回到各自的内置细弧。 */
export function useRemoveThemeRing(code: string) {
  return useThemeMutation(() => themesApi.removeRing(code), '已恢复默认圆环', '移除失败');
}

export function useDeleteTheme() {
  return useThemeMutation(
    (code: string) => themesApi.remove(code),
    '主题已删除',
    '删除失败',
    /** 删成功就清掉「上一次在哪个工作空间」的记忆，否则「返回工坊」会落到已删除编码。 */
    (_data, code) => forgetThemeCode(code),
  );
}

/**
 * 按主题编码查「标记」：谜题编辑器在 `WorkspaceLayout` 外只能取一次 `/themes` 摊表；解析顺序（谜题 → 主题 → ×）见 `lib/mark.ts`。
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
 * 按主题编码查工具按钮图标（三枚一起给）；解析顺序（谜题 → 主题 → 内置）在 `lib/toolIcons.ts`。
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
 * 按主题编码查那一圈（v0.9.5 起进度环与校验圈合并）：游戏页在工作空间外，只能查表。
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
 * 按主题编码查标尺行列符号（符号属主题层）；地图草稿旧值不参与渲染（v0.10.8 起），保存时由 `stripRulerSymbols` 剥掉。
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
 * 按主题编码查「提交校验」样式（颜色与圈图同一配置的两半）；未配过返回 `null`，由 `lib/checkStyle.ts` 填默认绿 / 红。
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
 * 按主题编码查结算卡配置（图标 + 标题一起给）；未配过返回 `null`，由 `resolveVerdictStyle` 填内置的 🎉 +「解题成功」。
 */
export function useVerdictByCode(): (
  code: string | null | undefined,
) => ThemeVerdict | null {
  const query = useThemes();
  const byCode = useMemo(() => {
    const map = new Map<string, ThemeVerdict>();
    for (const theme of query.data ?? []) {
      const verdict = theme.data.verdict;
      if (verdict) map.set(theme.code, verdict);
    }
    return map;
  }, [query.data]);

  return useCallback(
    (code: string | null | undefined) => (code ? (byCode.get(code) ?? null) : null),
    [byCode],
  );
}

/**
 * 改结算卡的两句文字，与上传图标图分开 —— 换图不该顺手改标题。
 */
export function useUpdateThemeVerdict(code: string) {
  return useThemeMutation(
    (patch: { iconText?: string; title?: string }) => themesApi.updateVerdict(code, patch),
    '结算文案已保存',
    '结算文案保存失败',
  );
}

/**
 * 结算卡那枚图标图，即时保存 —— 回执是更新后的整份主题。
 */
export function useUploadThemeVerdictIcon(code: string) {
  return useThemeMutation(
    (file: File) => themesApi.uploadVerdictIcon(code, file),
    '已设为本主题的结算图标',
    '结算图标上传失败',
  );
}

/** 移除图标 = 回到文字（或内置的庆祝 emoji），标题与那段文字都留着。 */
export function useRemoveThemeVerdictIcon(code: string) {
  return useThemeMutation(
    () => themesApi.removeVerdictIcon(code),
    '结算图标已恢复默认',
    '移除失败',
  );
}

/**
 * v0.9.3 §3：改两档颜色。与上传圈图分开 —— 取色器每动一下只发一个颜色。
 */
export function useUpdateThemeCheckStyle(code: string) {
  return useThemeMutation(
    (patch: { passColor?: string; failColor?: string }) =>
      themesApi.updateCheckStyle(code, patch),
    '校验颜色已保存',
    '校验颜色保存失败',
  );
}

