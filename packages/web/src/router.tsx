import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { CardsPage } from '@/pages/CardsPage';
import { EditorPage } from '@/pages/EditorPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { ProjectsPage } from '@/pages/ProjectsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'cards', element: <CardsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    path: '/editor/:projectId',
    element: <EditorPage />,
  },
]);
