import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';

function lazyPage(load: () => Promise<{ default: ComponentType }>): ComponentType {
  const Lazy = lazy(load);
  return function LazyPage(): JSX.Element {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载…
          </div>
        }
      >
        <Lazy />
      </Suspense>
    );
  };
}

const CharactersPage = lazyPage(() =>
  import('@/pages/CharactersPage').then((m) => ({ default: m.CharactersPage })),
);
const MapEditorPage = lazyPage(() => import('@/pages/MapEditorPage').then((m) => ({ default: m.MapEditorPage })));
const GamePage = lazyPage(() => import('@/pages/GamePage').then((m) => ({ default: m.GamePage })));
const GamesPage = lazyPage(() =>
  import('@/pages/GamesPage').then((m) => ({ default: m.GamesPage })),
);
const AssetsPage = lazyPage(() => import('@/pages/AssetsPage').then((m) => ({ default: m.AssetsPage })));
const MapViewPage = lazyPage(() =>
  import('@/pages/MapViewPage').then((m) => ({ default: m.MapViewPage })),
);
const MapsPage = lazyPage(() => import('@/pages/MapsPage').then((m) => ({ default: m.MapsPage })));
const PuzzleEditorPage = lazyPage(() =>
  import('@/pages/PuzzleEditorPage').then((m) => ({ default: m.PuzzleEditorPage })),
);
const PuzzlesPage = lazyPage(() =>
  import('@/pages/PuzzlesPage').then((m) => ({ default: m.PuzzlesPage })),
);
const PuzzleViewPage = lazyPage(() =>
  import('@/pages/PuzzleViewPage').then((m) => ({ default: m.PuzzleViewPage })),
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
