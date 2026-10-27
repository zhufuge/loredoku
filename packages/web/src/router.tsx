import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingBlock, LoadingScreen } from '@/components/common/LoredokuLoader';
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // v0.7.1 §3：根路径落到「地图」，从首页进来默认就是地图 Tab 高亮。
      { index: true, element: <Navigate to="/maps" replace /> },
      { path: 'maps', element: <MapsPage /> },
      { path: 'assets', element: <AssetsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'deployments', element: <DeploymentsPage /> },
      { path: 'items', element: <Navigate to="/assets" replace /> },
      { path: 'cards', element: <Navigate to="/assets" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/maps/:mapId/edit',
    element: <MapEditorPage />,
  },
  {
    path: '/puzzles/:puzzleId/edit',
    element: <PuzzleEditorPage />,
  },
  {
    path: '/puzzles/:puzzleId/view',
    element: <PuzzleViewPage />,
  },
  {
    path: '/maps/:mapId/views',
    element: <MapViewPage />,
  },
  {
    path: '/play',
    element: <GamesPage />,
  },
  {
    path: '/play/:slug',
    element: <GamePage />,
  },
]);
