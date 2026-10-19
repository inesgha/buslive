import { lazy, type ReactNode, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';

import { useAuth } from './auth/AuthProvider';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { LogPage } from './pages/LogPage';
import { ReportsPage } from './pages/ReportsPage';
import { RidesPage } from './pages/RidesPage';
import { UsersPage } from './pages/UsersPage';

// Pages avec une carte : chargées à la demande (Leaflet n'alourdit pas le reste).
const StopsPage = lazy(async () => ({ default: (await import('./pages/StopsPage')).StopsPage }));
const NetworkPage = lazy(async () => ({
  default: (await import('./pages/NetworkPage')).NetworkPage,
}));

/** Page réservée aux administrateurs (l'API le vérifie aussi, à chaque requête). */
function AdminOnly({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  return can('ADMIN') ? children : <Navigate to="/" replace />;
}

export function App() {
  const { state, can } = useAuth();
  if (state.status === 'restoring') return <p style={{ padding: 24 }}>Chargement…</p>;
  if (state.status === 'signedOut') return <LoginPage />;
  if (!can('MODERATOR')) {
    return <p style={{ padding: 24 }}>Accès réservé aux modérateurs et administrateurs.</p>;
  }

  return (
    <Layout>
      <Suspense fallback={<p>Chargement…</p>}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/stops" element={<StopsPage />} />
          <Route path="/rides" element={<RidesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route
            path="/network"
            element={
              <AdminOnly>
                <NetworkPage />
              </AdminOnly>
            }
          />
          <Route path="/log" element={<LogPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
