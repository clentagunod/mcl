import { useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS } from '../config/settings';
import { describeError } from '../lib/errors';
import { initializeSettings, subscribeSettings } from '../services/settings';
import { SettingsContext, type SettingsState } from './SettingsContext';
import { useAuth } from './AuthContext';

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<SettingsState>({ settings: DEFAULT_SETTINGS, loading: true, error: null });
  useEffect(() => {
    let active = true;
    let initialized = false;
    const stop = subscribeSettings(
      (settings) => {
        setState({ settings, loading: false, error: null });
        if (!initialized && user) {
          initialized = true;
          void initializeSettings(user.uid).catch((error) => {
            if (active) setState((previous) => ({ ...previous, loading: false, error: describeError(error) }));
          });
        }
      },
      (error) => setState((previous) => ({ ...previous, loading: false, error: describeError(error) })),
    );
    return () => { active = false; stop(); };
  }, [user]);
  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>;
}
