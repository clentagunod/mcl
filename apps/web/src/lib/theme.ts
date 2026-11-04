import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'mcl:preferences:theme';
const eventName = 'mcl:theme-change';
let sessionPreference: Theme | null = null;

function preferredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Preferences still work for this session when storage is unavailable. */ }
  return sessionPreference ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

export function initializeTheme() {
  document.documentElement.dataset.theme = preferredTheme();
}

export function setTheme(theme: Theme) {
  sessionPreference = theme;
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* Keep the in-memory preference. */ }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(eventName));
}

function subscribe(onChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const refresh = () => { initializeTheme(); onChange(); };
  const storage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) { sessionPreference = null; refresh(); }
  };
  initializeTheme();
  window.addEventListener(eventName, onChange);
  window.addEventListener('storage', storage);
  media.addEventListener('change', refresh);
  return () => {
    window.removeEventListener(eventName, onChange);
    window.removeEventListener('storage', storage);
    media.removeEventListener('change', refresh);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme as Theme || preferredTheme(), () => 'light' as Theme);
  return { theme, toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}
