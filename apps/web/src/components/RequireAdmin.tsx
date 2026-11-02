import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DataProvider } from '../context/DataProvider';
import { Layout } from './Layout';
import { LoadingState } from './StateMessage';
import { SettingsProvider } from '../context/SettingsProvider';

/**
 * Route guard: only a signed-in administrator reaches the pages below it.
 * The live data feeds start only after sign-in, so nothing is read before then.
 */
export function RequireAdmin() {
  const { status } = useAuth();

  if (status === 'loading') return <LoadingState />;
  if (status === 'signedOut') return <Navigate to="/login" replace />;

  return (
    <SettingsProvider>
      <DataProvider>
        <Layout />
      </DataProvider>
    </SettingsProvider>
  );
}
