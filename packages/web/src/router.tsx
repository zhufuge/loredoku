import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Every page but the shell is code-split: a player on `/play` never downloads
 * the editor, and the maker's console never downloads the game surface.
 *
 * The wrapper keeps the route array below byte-identical to the static-import
 * version (`element: <GamePage />`), so the only thing lazy loading changes is
 * *when* the module arrives.
 */
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
const EditorPage = lazyPage(() => import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const GamePage = lazyPage(() => import('@/pages/GamePage').then((m) => ({ default: m.GamePage })));
const GamesPage = lazyPage(() =>
  import('@/pages/GamesPage').then((m) => ({ default: m.GamesPage })),
);
const ItemsPage = lazyPage(() => import('@/pages/ItemsPage').then((m) => ({ default: m.ItemsPage })));
const MapVersionViewPage = lazyPage(() =>
  import('@/pages/MapVersionViewPage').then((m) => ({ default: m.MapVersionViewPage })),
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

/**
 * `/maps/:projectId/:versionNo/view` is a read-only version entry (SPEC-K12).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // v0.5.4 FEAT-O04: the games home is the default entry; the console is
      // reached from 「进入工坊」.
      { index: true, element: <Navigate to="/play" replace /> },
      { path: 'maps', element: <MapsPage /> },
      // R3: old links / bookmarks keep working.
      { path: 'projects', element: <Navigate to="/maps" replace /> },
      { path: 'items', element: <ItemsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      { path: 'puzzles', element: <PuzzlesPage /> },
      { path: 'cards', element: <Navigate to="/items" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/editor/:projectId',
    element: <EditorPage />,
  },
  {
    // FEAT-K01 / §15 Q18: the puzzle editor.
    path: '/puzzles/:puzzleId/edit',
    element: <PuzzleEditorPage />,
  },
  {
    // §15 Q18: the puzzle's read-only preview.
    path: '/puzzles/:puzzleId/view',
    element: <PuzzleViewPage />,
  },
  {
    // FEAT-K09 §7.1: one published map version, canvas only.
    path: '/maps/:projectId/:versionNo/view',
    element: <MapVersionViewPage />,
  },
  {
    // FEAT-G01 (v0.4.0 验收补充): the games home is a player-facing entry, NOT
    // part of the maker's console — it lives outside `AppShell` so no other
    // module's navigation is visible, and is reached only by link.
    //
    // FEAT-L04 (docs/v0.5.1.md §4): the route is **`/play`**, not `/games`.
    // The old path is not registered — this is a local tool, so no redirect is
    // needed. `/api/games*` is an internal interface and keeps its name.
    path: '/play',
    element: <GamesPage />,
  },
  {
    // FEAT-G03 + OPT-W04: the game page is a full-screen play surface, like the
    // editor. Its route parameter is the game's **access path** (`/play/puzzle-…`),
    // not a numeric id (docs/v0.4.1.md §4.7).
    path: '/play/:slug',
    element: <GamePage />,
  },
]);
