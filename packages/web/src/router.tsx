import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CharactersPage } from '@/pages/CharactersPage';
import { EditorPage } from '@/pages/EditorPage';
import { GamePage } from '@/pages/GamePage';
import { GamesPage } from '@/pages/GamesPage';
import { ItemsPage } from '@/pages/ItemsPage';
import { MapVersionViewPage } from '@/pages/MapVersionViewPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { MapsPage } from '@/pages/MapsPage';
import { PuzzleEditorPage } from '@/pages/PuzzleEditorPage';
import { PuzzlesPage } from '@/pages/PuzzlesPage';
import { PuzzleViewPage } from '@/pages/PuzzleViewPage';

/**
 * `/maps/:projectId/:versionNo/view` is a read-only version entry (SPEC-K12).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      // v0.5.4 FEAT-O04: the games home is the default entry; the console is
      // reached from 「进入琢玉台」.
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
