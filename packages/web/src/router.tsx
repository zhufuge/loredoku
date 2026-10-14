import { Navigate, createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CharactersPage } from '@/pages/CharactersPage';
import { EditorPage } from '@/pages/EditorPage';
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
]);
