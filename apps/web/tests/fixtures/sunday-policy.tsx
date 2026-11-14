import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import type { User } from 'firebase/auth';
import { AuthContext } from '../../src/context/AuthContext';
import { DataProvider } from '../../src/context/DataProvider';
import { useData } from '../../src/context/DataContext';
import { SettingsProvider } from '../../src/context/SettingsProvider';
import SettingsPage from '../../src/pages/SettingsPage';
import PrintStudioPage from '../../src/pages/PrintStudioPage';
import '../../src/index.css';

// Real settings and data providers; tests replace only the remote service feeds
// and writes with synthetic records. No live Firebase requests are allowed.
function Content() {
  const { rows, loading, error } = useData();
  const [screen, setScreen] = useState('settings');
  if (loading) return <p role="status">Loading synthetic records…</p>;
  if (error) return <p role="alert">{error}</p>;
  const summary = rows[0].summary;
  return <div className="content">
    <nav aria-label="Fixture views"><button type="button" onClick={() => setScreen('settings')}>Open settings</button><button type="button" onClick={() => setScreen('print')}>Open print studio</button></nav>
    <dl><dt>Loan due date</dt><dd><output aria-label="Loan due date">{summary.dueDate}</output></dd><dt>Status</dt><dd><output aria-label="Loan status">{summary.status}</output></dd><dt>Elapsed days</dt><dd><output aria-label="Elapsed loan days">{summary.daysElapsed}</output></dd></dl>
    {screen === 'settings' ? <SettingsPage /> : <PrintStudioPage />}
  </div>;
}

const user = { uid: 'fixture-admin' } as User;
createRoot(document.getElementById('root')!).render(
  <BrowserRouter><AuthContext.Provider value={{ user, profile: { uid: user.uid, role: 'admin', fullName: 'Fixture administrator', email: 'admin@example.test', phone: '', active: true, createdAt: null }, status: 'signedIn', accessError: null, signIn: async () => {}, signOut: async () => {} }}>
    <SettingsProvider><DataProvider><Content /></DataProvider></SettingsProvider>
  </AuthContext.Provider></BrowserRouter>,
);
