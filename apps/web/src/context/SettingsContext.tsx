import { createContext, useContext } from 'react';
import { DEFAULT_SETTINGS, type AppSettings } from '../config/settings';

export interface SettingsState {
  settings: AppSettings;
  loading: boolean;
  error: string | null;
}
export const SettingsContext = createContext<SettingsState>({ settings: DEFAULT_SETTINGS, loading: true, error: null });
export const useSettings = () => useContext(SettingsContext);
