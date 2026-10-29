import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeEntryRedirect, WorkspaceLayout } from '@/components/layout/WorkspaceLayout';
import { LoadingBlock, LoadingScreen } from '@/components/common/LoredokuLoader';
import { SETTINGS_THEMES_PATH } from '@/lib/workspace';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * v0.7.12：分包还没到位时的那一屏从「转圈 + 正在加载…」换成品牌字标。
 *
 * 这是全站**第一笔**会动的东西 —— 从工坊里点进任何一页，先看到的就是它。
 * 正因如此它不该是一个任何模板都有的圈。
 *
 * 高度仍是 `min-h-[60vh]`：字标比一行文字高，用 flex 居中之后内容不会跳。
 * 这一版是给**外壳里的页**用的（列表 / 资源 / 角色），它们的等待都发生在
 * `AppShell` 里面，不该占满整屏。
 *
 * 第二参数给整屏页用（编辑器、查看页、游戏）：那些路由在 `AppShell` 之外，
 * 页面自己还有一道数据门（`正在加载画布…` / `正在加载地图…`），两道门必须长得
 * 一模一样、落在同一个位置，否则用户会看到「字标 → 换了个位置的字标」。
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

/**
 * 整屏路由的「分包还没到」那一屏。
 *
 * 文案直接借用页面自己那道数据门的那一句：进入编辑器看到的**永远**是
 * 「正在加载画布…」，不管这一屏等的是代码还是地图数据 —— 对用户来说就是
 * 「编辑器还没好」，没必要分两句话把同一段等待说两遍（v0.7.12 §10）。
 */
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
const GamePage = lazyPage(
  () => import('@/pages/GamePage').then((m) => ({ default: m.GamePage })),
  screenFallback('正在加载游戏…'),
);
const GamesPage = lazyPage(() =>
  import('@/pages/GamesPage').then((m) => ({ default: m.GamesPage })),
);
// v0.8.0 §10：主题播放页 —— 玩家从 `/play` 的大卡进来，挑一关。
const ThemePlayPage = lazyPage(
  () => import('@/pages/ThemePlayPage').then((m) => ({ default: m.ThemePlayPage })),
  screenFallback('正在加载主题…'),
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
/** v0.8.0 v0.8.0 §18：工作空间自己的那页（`/:code/basic`）。 */
const ThemeBasicPage = lazyPage(() =>
  import('@/pages/ThemeBasicPage').then((m) => ({ default: m.ThemeBasicPage })),
);
/** v0.8.0 v0.8.0 §18：系统配置 —— 主题列表搬到这里，它是「换工作空间」的唯一入口。 */
const ThemesPage = lazyPage(() => import('@/pages/ThemesPage').then((m) => ({ default: m.ThemesPage })));

/**
 * 路由表（v0.8.0 §18）。
 *
 * ```
 * /                              → 记住的主题（或默认主题）· 概览
 * /hlm/basic                     工作空间 · 概览（索引也落这里）
 * /hlm/maps                      工作空间 · 地图
 * /settings/themes               系统配置 · 主题
 * /maps/:mapId/edit              整屏：编辑器（主题无关，一条地址只认一张图）
 * /play[/:slug]                  玩家侧
 * ```
 *
 * **为什么主题进了地址**：上一版主题只存在 `localStorage` 里，`/maps` 换台机器
 * 打开就是另一批数据，链接也发不出去。主题是工作空间，不是个人偏好（见
 * `lib/workspace.ts`）。
 *
 * **静态段永远压过动态段**：`/settings` 与 `/play` 都比 `/:themeCode` 更「具体」，
 * 所以不会被当成主题编码。旧地址（`/maps`、`/assets` …）也靠这一点留在最外层做
 * 重定向 —— 书签不至于 404。
 *
 * 导出成数组是为了测试能用 `createMemoryRouter(routes)` 走**同一张表**：路由表
 * 与生产不一致的测试，测的是测试自己。
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
      { index: true, element: <Navigate to="basic" replace /> },
      { path: 'basic', element: <ThemeBasicPage /> },
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

  // ---- 整屏页：外壳之外 ----
  { path: '/maps/:mapId/edit', element: <MapEditorPage /> },
  { path: '/maps/:mapId/views', element: <MapViewPage /> },
  { path: '/puzzles/:puzzleId/edit', element: <PuzzleEditorPage /> },
  { path: '/puzzles/:puzzleId/view', element: <PuzzleViewPage /> },
  { path: '/play', element: <GamesPage /> },
  { path: '/play/:slug', element: <GamePage /> },
  /**
   * v0.8.0 §16.6：主题里的那一关走这条地址（`key` = 游戏的 slug），游戏页据此
   * 给出「回到红楼梦」的入口。**存档键仍是游戏的 slug**（§10），两条路玩同一关
   * 是同一份进度 —— 路由参数只用于寻址。
   */
  { path: '/play/theme/:themeSlug', element: <ThemePlayPage /> },
  { path: '/play/theme/:themeSlug/:slug', element: <GamePage /> },
];

export const router = createBrowserRouter(routes);
