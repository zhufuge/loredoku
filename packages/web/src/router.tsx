import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, createBrowserRouter, useParams, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeEntryRedirect, WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { LoadingBlock, LoadingScreen } from '@/components/common/LoredokuLoader';
import { readLastThemeCode, SETTINGS_THEMES_PATH } from '@/lib/workspace';
import { NotFoundPage } from '@/pages/NotFoundPage';

/** 编辑 / 预览这些整屏页在 `/:themeCode` 前缀下，书签里的旧地址（`/maps/12/edit`） 没有主题段 —— 先落到**记住的**工作空间，让链接至少还能用；记不住（换了浏览器、 清了存储）就去挑主题的入口，地图 id 保不住 —— 宁可多一跳，也不编一个不存在的编码出来。 */
/** `/play/theme/:slug`（合辑页）与 `/play/theme/:slug/:key`（合辑里的一关）这两条地址可能是玩家收藏过的，直接删会让它们匹配到 `/play/:slug` 里、把 `theme` 当成一个游戏 —— 所以留两条重定向：；合辑页 → `/play`（单局列表里仍然有那几关）；；合辑里的一关 → `/play/:key`（**存档键一直是游戏 slug，进度不丢**）。 */
function PlayThemeLegacyRedirect({ to }: { to: 'list' | 'game' }): JSX.Element {
  const params = useParams<{ slug?: string }>();
  const target = to === 'game' && params.slug ? `/play/${params.slug}` : '/play';
  return <Navigate to={target} replace />;
}

function FullscreenLegacyRedirect({
  kind,
  view,
}: {
  kind: 'map' | 'puzzle';
  view: boolean;
}): JSX.Element {
  const params = useParams<{ mapId?: string; puzzleId?: string }>();
  const id = params.mapId ?? params.puzzleId ?? '';
  const code = readLastThemeCode();
  if (!code) return <Navigate to="/" replace />;
  const suffix = view ? 'view' : 'edit';
  return <Navigate to={`/${code}/${kind}s/${id}/${suffix}`} replace />;
}

/**
 * 分包未到位时的那一屏。外壳里的页用 `min-h-[60vh]` 的品牌字标；整屏页（编辑器 / 查看页 / 游戏）传第二参数，让页面自己那道数据门与它长得一样、落在同一位置，否则会看到「字标 → 换了个位置的字标」。
 */
function lazyPage(
  load: () => Promise<{ default: ComponentType }>,
  fallback?: JSX.Element,
): ComponentType {
  const Lazy = lazy(load);
  return function LazyPage(): JSX.Element {
    return (
      <Suspense
        fallback={
          fallback ?? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <LoadingBlock />
            </div>
          )
        }
      >
        <Lazy />
      </Suspense>
    );
  };
}

/** 整屏路由的「分包还没到」那一屏。 文案直接借用页面自己那道数据门的那一句：进入编辑器看到的**永远**是「正在加载画布…」，不管这一屏等的是代码还是地图数据 —— 对用户来说就是「编辑器还没好」，没必要分两句话把同一段等待说两遍（v0.7.12 §10）。 */
function screenFallback(caption: string): JSX.Element {
  return <LoadingScreen caption={caption} />;
}

const CharactersPage = lazyPage(() =>
  import('@/pages/CharactersPage').then((m) => ({ default: m.CharactersPage })),
);
const MapEditorPage = lazyPage(
  () => import('@/pages/MapEditorPage').then((m) => ({ default: m.MapEditorPage })),
  screenFallback('正在加载画布…'),
);
/**
 * v0.9.0 §2：工坊 / 线上挂的是**接口模式**那一份（`ApiGamePage`），它自己套一层 api source 再交给 `GamePage` 的渲染层。`GamePage` 本身不含 axios —— 播放器直接用它，于是那个产物的 chunk 图里根本没有 `src/api/*`。
 */
const GamePage = lazyPage(
  () => import('@/pages/ApiGamePage'),
  screenFallback('正在加载游戏…'),
);
const GamesPage = lazyPage(() =>
  import('@/pages/GamesPage').then((m) => ({ default: m.GamesPage })),
);
const AssetsPage = lazyPage(() => import('@/pages/AssetsPage').then((m) => ({ default: m.AssetsPage })));
const MapViewPage = lazyPage(
  () => import('@/pages/MapViewPage').then((m) => ({ default: m.MapViewPage })),
  screenFallback('正在加载地图…'),
);
const MapsPage = lazyPage(() => import('@/pages/MapsPage').then((m) => ({ default: m.MapsPage })));
const PuzzleEditorPage = lazyPage(
  () => import('@/pages/PuzzleEditorPage').then((m) => ({ default: m.PuzzleEditorPage })),
  screenFallback('正在加载画布…'),
);
const PuzzlesPage = lazyPage(() =>
  import('@/pages/PuzzlesPage').then((m) => ({ default: m.PuzzlesPage })),
);
const PuzzleViewPage = lazyPage(
  () => import('@/pages/PuzzleViewPage').then((m) => ({ default: m.PuzzleViewPage })),
  screenFallback('正在加载谜题…'),
);
const DeploymentsPage = lazyPage(() =>
  import('@/pages/DeploymentsPage').then((m) => ({ default: m.DeploymentsPage })),
);
/** v0.8.1：工作空间自己的那页（`/:code/overview`）。 */
const ThemeOverviewPage = lazyPage(() =>
  import('@/pages/ThemeOverviewPage').then((m) => ({ default: m.ThemeOverviewPage })),
);
/** v0.8.0 §18：系统配置 —— 主题列表在这里，它是「换工作空间」的唯一入口。 */
const ThemesPage = lazyPage(() => import('@/pages/ThemesPage').then((m) => ({ default: m.ThemesPage })));

/**
 * 路由表（v0.8.0 §18）。主题进了地址（`/hlm/overview` 之类），因为它是工作空间而非个人偏好，只存 `localStorage` 的话链接发不出去、换台机器就是另一批数据；**静态段永远压过动态段**，`/settings` `/play` 不会被当成主题编码，旧地址也靠这一点留在最外层重定向。导出成数组是为了测试能用 `createMemoryRouter(routes)` 走同一张表。
 */
export const routes: RouteObject[] = [
  // ---- 入口与旧地址：都先挑一个主题，再换成带编码的地址 ----
  { path: '/', element: <ThemeEntryRedirect /> },
  { path: '/themes', element: <Navigate to={SETTINGS_THEMES_PATH} replace /> },
  { path: '/assets', element: <ThemeEntryRedirect module="assets" /> },
  { path: '/maps', element: <ThemeEntryRedirect module="maps" /> },
  { path: '/characters', element: <ThemeEntryRedirect module="characters" /> },
  { path: '/puzzles', element: <ThemeEntryRedirect module="puzzles" /> },
  { path: '/deployments', element: <ThemeEntryRedirect module="deployments" /> },
  { path: '/items', element: <ThemeEntryRedirect module="assets" /> },
  { path: '/cards', element: <ThemeEntryRedirect module="assets" /> },

  // ---- 工作空间：一个主题 = 一个 `/:themeCode` 前缀 ----
  {
    path: '/:themeCode',
    element: <WorkspaceLayout />,
    children: [
      // 工作空间有自己的首页（概览），不替作者决定「进来就要画地图」。
      { index: true, element: <Navigate to="overview" replace /> },
      { path: 'overview', element: <ThemeOverviewPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'maps', element: <MapsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'deployments', element: <DeploymentsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  // ---- 系统配置：头部没有模块 ----
  {
    path: '/settings',
    element: <AppShell variant="config" />,
    children: [
      { index: true, element: <Navigate to={SETTINGS_THEMES_PATH} replace /> },
      { path: 'themes', element: <ThemesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },

  // ---- 整屏页：外壳之外，但**主题进地址**（v0.8.1）----
  // 一条地址 = 一个世界里的那张图。`themeCode` 同时是资源 / 角色列表的筛选值
  // （编辑器的选料只属于这个工作空间），不再是一段可有可无的装饰。
  { path: '/:themeCode/maps/:mapId/edit', element: <MapEditorPage /> },
  { path: '/:themeCode/maps/:mapId/view', element: <MapViewPage /> },
  { path: '/:themeCode/puzzles/:puzzleId/edit', element: <PuzzleEditorPage /> },
  { path: '/:themeCode/puzzles/:puzzleId/view', element: <PuzzleViewPage /> },
  // 旧地址（没有主题段）先落回记住的工作空间 —— 书签不至于 404；地图不属于
  // 那个主题时由列表页自己纠偏，这里不做数据查询。
  { path: '/maps/:mapId/edit', element: <FullscreenLegacyRedirect kind="map" view={false} /> },
  { path: '/maps/:mapId/view', element: <FullscreenLegacyRedirect kind="map" view /> },
  { path: '/puzzles/:puzzleId/edit', element: <FullscreenLegacyRedirect kind="puzzle" view={false} /> },
  { path: '/puzzles/:puzzleId/view', element: <FullscreenLegacyRedirect kind="puzzle" view /> },
  { path: '/play', element: <ThemeEntryRedirect module="play" /> },
  { path: '/play/:slug', element: <GamePage /> },
  /** 玩家侧也按主题分（与播放器的 `/:code/play` 同一副骨架）。 这两条必须排在 `/:themeCode` 那一组**之后**也没关系 —— react-router 按段的具体程度排序，`/:themeCode/play` 比 `/:themeCode/*` 更具体，不会掉进工作空间。 */
  { path: '/:themeCode/play', element: <GamesPage /> },
  { path: '/:themeCode/play/:slug', element: <GamePage /> },
  /** 合辑的两条旧地址走重定向（见 `PlayThemeLegacyRedirect`）。 */
  { path: '/play/theme/:themeSlug', element: <PlayThemeLegacyRedirect to="list" /> },
  { path: '/play/theme/:themeSlug/:slug', element: <PlayThemeLegacyRedirect to="game" /> },
];

export const router = createBrowserRouter(routes);
