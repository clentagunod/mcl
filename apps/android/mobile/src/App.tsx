import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { CollectorData } from './CollectorData';
import { useAuth } from '@web/context/AuthContext';
import { useData } from '@web/context/DataContext';
import { DataProvider } from '@web/context/DataProvider';
import { SettingsProvider } from '@web/context/SettingsProvider';
import { Logo } from '@web/components/Logo';
import { describeError } from '@web/lib/errors';
import { useSettings } from '@web/context/SettingsContext';
import { LoadingPanel, Notice, OfflineNotice, WorkspaceFeedback } from './Status';
import { awaitingServer, networkOnline, useConnectivity } from './connectivity';
const Clients = lazy(() => import('./Clients'));
const Dashboard = lazy(() => import('@web/pages/DashboardPage'));
const Collectors = lazy(() => import('@web/pages/collectors/CollectorsPage'));
const Holidays = lazy(() => import('@web/pages/HolidaysPage'));
const Liquidation = lazy(() => import('@web/pages/LiquidationPage'));
const Settings = lazy(() => import('./Settings'));
export function Login() {
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const update = () => setViewportHeight(window.visualViewport?.height ?? window.innerHeight);
    update();
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);
  const { signIn, accessError } = useAuth();
  const online = useConnectivity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !networkOnline()) return;
    setBusy(true); setError('');
    try { await signIn(email, password); } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <main className="auth-screen" style={{ minHeight: viewportHeight }}><form className="auth-card" onSubmit={submit} aria-busy={busy}>
    <header className="auth-heading"><Logo /><p className="auth-business">MCL LENDING</p><h1>Account sign in</h1><p className="muted">Sign in to access your account.</p></header>
    <div className="auth-feedback">
      <OfflineNotice login />
      {(error || accessError) && <Notice tone="error" title="Unable to sign in">{error || accessError}</Notice>}
    </div>
    <fieldset disabled={busy}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label></fieldset>
    <button className="btn btn-primary btn-block" disabled={busy || !online}>{busy ? 'Signing in…' : !online ? 'Connect to sign in' : 'Sign in'}</button>
    <p className="auth-footer">Administrator and collector access</p>
  </form></main>;
}
export function Shell() {
  const { profile, signOut } = useAuth();
  const data = useData();
  const settings = useSettings();
  const online = useConnectivity();
  const [error, setError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const admin = profile?.role === 'admin';
  const waiting = awaitingServer(data.error);
  const initial = (data.loading || waiting) && !data.clients.length && !data.payments.length;
  const links = admin ? [['/', 'Overview'], ['/clients', 'Clients'], ['/liquidation', 'Ledger'], ['/collectors', 'Collectors'], ['/holidays', 'Holidays'], ['/settings', 'Settings']] : [['/', 'Collections']];
  async function leave() {
    if (signingOut) return;
    setSigningOut(true); setError('');
    try { await signOut(); } catch (caught) { setError(describeError(caught)); }
    finally { setSigningOut(false); }
  }
  return <div className={admin ? "mobile-shell admin-workspace" : "mobile-shell collector-workspace"}>
    <header className="mobile-header"><div className="brand"><Logo /><div><strong>MCL Lending</strong><small>{profile?.fullName} · {admin ? 'Administrator' : 'Collector'}</small></div></div>
      <div className="header-actions"><button className="btn" disabled={signingOut} onClick={() => void leave()}>{signingOut ? 'Signing out…' : 'Sign out'}</button></div>
    </header>
    {admin && <nav className="mobile-nav" aria-label="Main">{links.map(([to, title]) => <NavLink key={to} to={to} end>{title}</NavLink>)}</nav>}
    <main className="mobile-content" onSubmitCapture={event => {
      if (!networkOnline() && !(event.target as HTMLElement).closest('[role="dialog"]')) {
        event.preventDefault(); event.stopPropagation();
      }
    }}>
      <WorkspaceFeedback error={data.error} settingsError={settings.error} />
      {error && <Notice tone="error" title="Unable to sign out">{error}</Notice>}
      {initial && (online
        ? <LoadingPanel title="Loading your workspace">Confirming the latest client records and balances.</LoadingPanel>
        : <div className="empty-panel"><strong>No records available yet</strong><p>Reconnect to load your workspace. It will update automatically.</p></div>)}
      <div className="workspace-route" hidden={initial}><Suspense fallback={<LoadingPanel title="Opening this screen">Preparing your workspace.</LoadingPanel>}><Outlet /></Suspense></div>
    </main>
  </div>;
}
export function AccessCheck() {
  const { signOut } = useAuth();
  const online = useConnectivity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="auth-screen"><section className="auth-card access-card">
    <Logo />
    <h1>{online ? 'Verifying your account' : 'Waiting for a connection'}</h1>
    <p className="muted">We need to confirm your account access before opening the workspace.</p>
    <OfflineNotice access />
    {online && <LoadingPanel title="Checking account access">This usually takes a moment.</LoadingPanel>}
    {error && <Notice tone="error" title="Unable to return to sign in">{error}</Notice>}
    <button className="btn btn-block" disabled={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await signOut(); } catch (caught) { setError(describeError(caught)); }
      finally { setBusy(false); }
    }}>{busy ? 'Please wait…' : 'Return to sign in'}</button>
  </section></main>;
}
function Session() {
  const { status, profile, user } = useAuth();
  if (status === 'loading') return <AccessCheck />;
  if (status !== 'signedIn') return <Login />;
  const admin = profile?.role === 'admin';
  const routes = <Routes><Route element={<Shell />}>
    <Route index element={admin ? <Dashboard /> : <Clients />} />
    <Route path="clients" element={<Clients />} />
    {admin && <><Route path="liquidation" element={<Liquidation />} /><Route path="collectors" element={<Collectors />} /><Route path="holidays" element={<Holidays />} /><Route path="settings" element={<Settings />} /></>}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes>;
  return admin ? <SettingsProvider key={user!.uid}><DataProvider>{routes}</DataProvider></SettingsProvider> : <CollectorData key={user!.uid}>{routes}</CollectorData>;
}
export default function App() { return <HashRouter><AuthProvider><Session /></AuthProvider></HashRouter>; }
