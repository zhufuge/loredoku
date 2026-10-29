import { useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LayoutGrid, Settings2 } from 'lucide-react';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { AppShell } from '@/components/layout/AppShell';
import { WorkspaceProvider, type WorkspaceValue } from '@/components/layout/WorkspaceContext';
import { LoadingScreen } from '@/components/common/LoredokuLoader';
import { Button } from '@/components/ui/button';
import { useThemes } from '@/hooks/useThemes';
import {
  readLastThemeCode,
  rememberThemeCode,
  SETTINGS_THEMES_PATH,
  workshopPath,
  type ModuleKey,
} from '@/lib/workspace';

/**
 * v0.8.0 §18：`/:themeCode/*` 的入口 —— 把地址里那一段编码**解析成主题对象**，
 * 再交给外壳。整个工作空间的 `themeCode` 只有这一处来源（§19：主题只用编码寻址）。
 *
 * 三种落空：
 *
 * - 还在取主题列表 → 整屏品牌字标。此时画任何页头都是在猜。
 * - 编码不存在 → 说清「没有叫这个的主题」，并给出两条能走的路。**不**悄悄落到
 *   默认主题：地址是别人发来的时，静默替换会让人以为自己看的就是那个主题。
 * - 后端挂了 → 把原因说出来，不伪装成「主题不存在」。
 */
export function WorkspaceLayout(): JSX.Element {
  const { themeCode = '' } = useParams<{ themeCode: string }>();
  const themesQuery = useThemes();
  const themes = themesQuery.data ?? [];
  const theme = themes.find((entry) => entry.code === themeCode.toLowerCase()) ?? null;

  // 记住最后一个工作空间，只为旧地址（`/maps`）与全屏页面（编辑器）兜底。
  useEffect(() => {
    if (theme) rememberThemeCode(theme.code);
  }, [theme]);

  const value = useMemo<WorkspaceValue | null>(
    () =>
      theme === null
        ? null
        : {
            theme,
            themes,
            themeCode: theme.code,
            href: (module: ModuleKey) => `/${theme.code}/${module}`,
          },
    [theme, themes],
  );

  if (!value) {
    if (themesQuery.isLoading) return <LoadingScreen caption="正在加载工作台…" />;
    return (
      <MissingWorkspace
        code={themeCode}
        reason={
          themesQuery.isError
            ? themesQuery.error instanceof Error
              ? themesQuery.error.message
              : '主题列表加载失败'
            : null
        }
      />
    );
  }

  return (
    <WorkspaceProvider value={value}>
      <AppShell variant="workshop" />
    </WorkspaceProvider>
  );
}

function MissingWorkspace({ code, reason }: { code: string; reason: string | null }): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <BrandLogo height={22} withWordmark />
      {reason === null ? (
        <p className="text-sm text-muted-foreground">
          没有编码是 <span className="font-mono text-foreground">{code}</span> 的主题。
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">{reason}</p>
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" asChild>
          <Link to={workshopPath('basic')}>
            <LayoutGrid className="mr-1.5 h-4 w-4" />
            回到工坊
          </Link>
        </Button>
        <Button asChild>
          <Link to={SETTINGS_THEMES_PATH}>
            <Settings2 className="mr-1.5 h-4 w-4" />
            主题配置
          </Link>
        </Button>
      </div>
      <p className="max-w-md text-2xs leading-relaxed text-muted-foreground">
        每个主题是一间独立的工作台，地址形如 <span className="font-mono">/hlm/maps</span>。
      </p>
    </div>
  );
}

/**
 * `/` 与旧地址（`/maps`、`/assets` …）都走这里：先挑一个主题，再换成带编码的地址。
 *
 * 优先顺序：**记住的那个** → 列表第一个（按创建顺序，服务端排好）。§19 起没有
 * 「默认主题」这一档 —— 记住值可能是被删掉的主题，所以每次都要在现有列表里验一遍。
 */
export function ThemeEntryRedirect({ module }: { module?: ModuleKey } = {}): JSX.Element {
  const themesQuery = useThemes();
  const themes = themesQuery.data ?? [];

  if (themesQuery.isLoading) return <LoadingScreen caption="正在加载工作台…" />;

  const remembered = readLastThemeCode();
  const target = themes.find((theme) => theme.code === remembered) ?? themes[0];

  // 一个主题都没有（还没建过）→ 去配置页。这是唯一该去那儿的情形。
  if (!target) return <Navigate to={SETTINGS_THEMES_PATH} replace />;

  return <Navigate to={`/${target.code}/${module ?? 'basic'}`} replace />;
}
