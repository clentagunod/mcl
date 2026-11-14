import { useRef } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DataProvider } from '../context/DataProvider';
import { Layout } from './Layout';
import { LoadingState } from './StateMessage';
import { SettingsProvider } from '../context/SettingsProvider';
import { ExpensesProvider } from '../context/ExpensesContext';

/**
 * Route guard: only a signed-in admin or developer reaches the pages below it.
 * The live data feeds start only after sign-in, so nothing is read before then.
 */
export function RequireAdmin({ standalone = false }: { standalone?: boolean }) {
  const { status, user } = useAuth();
  const location = useLocation();
  const hadSession = useRef(false);
  if (status === 'signedIn') hadSession.current = true;

  if (status === 'loading') return <LoadingState />;
  if (status === 'signedOut') return <Navigate to="/login" replace state={standalone ? { from: location.pathname + location.search, printingSessionEnded: hadSession.current } : undefined} />;

  return (
    <SettingsProvider key={user!.uid}>
      <DataProvider>
        {standalone ? <Outlet /> : <ExpensesProvider><Layout /></ExpensesProvider>}
      </DataProvider>
    </SettingsProvider>
  );
}
