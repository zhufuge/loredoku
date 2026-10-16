import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CharactersPage } from '@/pages/CharactersPage';
import { EditorPage } from '@/pages/EditorPage';
import { GamePage } from '@/pages/GamePage';
import { GamesPage } from '@/pages/GamesPage';
import { ItemsPage } from '@/pages/ItemsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { WorksPage } from '@/pages/WorksPage';
import { WorkViewPage } from '@/pages/WorkViewPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'items', element: <ItemsPage /> },
      { path: 'characters', element: <CharactersPage /> },
      // FEAT-503: 版本 → 作品（后端语义不变）
      { path: 'works', element: <WorksPage /> },
      { path: 'cards', element: <Navigate to="/items" replace /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/editor/:projectId',
    element: <EditorPage />,
  },
  {
    path: '/works/:workId/view',
    element: <WorkViewPage />,
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
