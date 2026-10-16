import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CharactersPage } from '@/pages/CharactersPage';
import { EditorPage } from '@/pages/EditorPage';
import { GamePage } from '@/pages/GamePage';
import { GamesPage } from '@/pages/GamesPage';
import { ItemsPage } from '@/pages/ItemsPage';
import { MapVersionViewPage } from '@/pages/MapVersionViewPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { PuzzleEditorPage } from '@/pages/PuzzleEditorPage';
import { PuzzlesPage } from '@/pages/PuzzlesPage';
import { PuzzleViewPage } from '@/pages/PuzzleViewPage';

/**
 * v0.5.0 (docs/v0.5.0.md §2 / §7): the 作品 module is gone. What used to be
 * `/works` (a flat list of published map versions) is now two things:
 *
 * - `/puzzles` — the puzzle table (the roster / palette's new home);
 * - `/maps/:projectId/:versionNo/view` — one **version entry** of the map list,
 *   read-only canvas only (participants moved to puzzles, SPEC-K12).
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'items', element: <ItemsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      // FEAT-K01: 谜题（原「作品」，数据源换成谜题）
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
    path: '/games',
    element: <GamesPage />,
  },
  {
    // FEAT-G03 + OPT-W04: the game page is a full-screen play surface, like the
    // editor. Its route parameter is the game's **access path** (`/games/puzzle-…`),
    // not a numeric id (docs/v0.4.1.md §4.7).
    path: '/games/:slug',
    element: <GamePage />,
  },
]);
