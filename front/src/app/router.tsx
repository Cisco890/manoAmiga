import { createBrowserRouter } from 'react-router-dom';
import { AdminRoute, ProtectedRoute } from '../auth/RouteGuards.tsx';
import { DashboardLayout } from '../components/layout/DashboardLayout.tsx';
import { DashboardPage } from '../pages/DashboardPage.tsx';
import { EnrollmentFormsPage } from '../pages/EnrollmentFormsPage.tsx';
import { EnrollmentsPage } from '../pages/EnrollmentsPage.tsx';
import { IdCardsPage } from '../pages/IdCardsPage.tsx';
import { LoginPage } from '../pages/LoginPage.tsx';
import { NotFoundPage } from '../pages/NotFoundPage.tsx';
import { SettingsPage } from '../pages/SettingsPage.tsx';
import { SponsorFormsPage } from '../pages/SponsorFormsPage.tsx';
import { SponsorsPage } from '../pages/SponsorsPage.tsx';
import { StudentsPage } from '../pages/StudentsPage.tsx';
import { UsersPage } from '../pages/UsersPage.tsx';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: '/',
        element: <DashboardLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'alumnos', element: <StudentsPage /> },
          { path: 'inscripciones', element: <EnrollmentsPage /> },
          { path: 'padrinos', element: <SponsorsPage /> },
          { path: 'carnets', element: <IdCardsPage /> },
          { path: 'fichas-inscripcion', element: <EnrollmentFormsPage /> },
          { path: 'formularios-padrinos', element: <SponsorFormsPage /> },
          {
            element: <AdminRoute />,
            children: [
              { path: 'usuarios', element: <UsersPage /> },
              { path: 'configuracion', element: <SettingsPage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
