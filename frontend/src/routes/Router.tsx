import { createBrowserRouter, Outlet } from 'react-router-dom';
import LoginPage         from '@/pages/auth/Login';
import { Dashboard }     from '@/pages/dashboard/Dashboard';
import { Referrals }     from '@/pages/referrals/Referrals';
import { Patients }      from '@/pages/patients/Patients';
import { PatientDetail } from '@/pages/patients/PatientDetail';
import { RecordEncounter}from '@/pages/patients/RecordEncounter';
import { AdminPanel }    from '@/pages/admin/AdminPanel';
import { StaffManagement}from '@/pages/admin/StaffManagement';
import Error             from '@/pages/error/Error';
import { Unauthorized }  from '@/pages/error/Unauthorized';
import ProtectedRoute    from './ProtectedRoutes';
import AppLayout         from '@/components/AppLayout';

export const Router = createBrowserRouter([
  {
    path:         '/',
    element:      <Outlet />,
    errorElement: <Error />,
    children: [
      // ── Public ──────────────────────────────────────────────
      { index: true,          element: <LoginPage /> },
      { path: 'login',        element: <LoginPage /> },
      { path: 'unauthorized', element: <Unauthorized /> },

      // ── Protected — inside AppLayout (sidebar + topbar) ────
      {
        element: (
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        ),
        children: [
          // All logged-in users
          { path: 'dashboard', element: <Dashboard /> },

          // Clinical staff
          {
            element: <ProtectedRoute allowedRoles={['doctor', 'nurse', 'receptionist']} />,
            children: [
              { path: 'patients',                 element: <Patients />        },
              { path: 'patients/:nupi',           element: <PatientDetail />   },
              { path: 'patients/:nupi/encounter', element: <RecordEncounter /> },
            ],
          },

          // Referrals — doctors and nurses
          {
            element: <ProtectedRoute allowedRoles={['doctor', 'nurse']} />,
            children: [
              { path: 'referrals', element: <Referrals /> },
            ],
          },

          // Admin only
          {
            element: <ProtectedRoute allowedRoles={['admin']} />,
            children: [
              { path: 'admin', element: <AdminPanel />      },
              { path: 'staff', element: <StaffManagement /> },
            ],
          },
        ],
      },
    ],
  },
]);