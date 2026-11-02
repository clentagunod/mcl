import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './components/RequireAdmin';
import { LoadingState } from './components/StateMessage';
import { AuthProvider } from './context/AuthProvider';

// Each page is loaded only when it is first opened, which keeps the first load fast.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ClientsPage = lazy(() => import('./pages/clients/ClientsPage'));
const PrintablesPage = lazy(() => import('./pages/PrintablesPage'));
const LiquidationPage = lazy(() => import('./pages/LiquidationPage'));
const CollectorsPage = lazy(() => import('./pages/collectors/CollectorsPage'));
const HolidaysPage = lazy(() => import('./pages/HolidaysPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAdmin />}>
              <Route index element={<DashboardPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="printables" element={<PrintablesPage />} />
              <Route path="liquidation" element={<LiquidationPage />} />
              <Route path="collectors" element={<CollectorsPage />} />
              <Route path="holidays" element={<HolidaysPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
