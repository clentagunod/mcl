import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { HashRouter, Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './AuthProvider';
import { CollectorData } from './CollectorData';
import { useAuth } from '@web/context/AuthContext';
import { DataProvider } from '@web/context/DataProvider';
import { SettingsProvider } from '@web/context/SettingsProvider';
import { Logo } from '@web/components/Logo';
import { describeError } from '@web/lib/errors';
const Clients = lazy(() => import('./Clients'));
const Dashboard = lazy(() => import('@web/pages/DashboardPage'));
const Collectors = lazy(() => import('@web/pages/collectors/CollectorsPage'));
const Holidays = lazy(() => import('@web/pages/HolidaysPage'));
const Liquidation = lazy(() => import('@web/pages/LiquidationPage'));
const Settings = lazy(() => import('./Settings'));
function Login() {
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await signIn(email, password); } catch (e) { setError(describeError(e)); } finally { setBusy(false); }
  }
  return <main className="auth-screen" style={{ minHeight: viewportHeight }}><form className="auth-card" onSubmit={submit}>
    <header className="auth-heading"><Logo /><p className="auth-business">MCL LENDING</p><h1>Account sign in</h1><p className="muted">Sign in to access your account.</p></header>
    <fieldset disabled={busy}><label>Email<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
    <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label></fieldset>
    {(error || accessError) && <p role="alert" className="alert alert-error">{error || accessError}</p>}
    <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p className="auth-footer">Administrator and collector access</p>
  </form></main>;
}
export function Shell() {
  const { profile, signOut } = useAuth();
  const [error, setError] = useState('');
  const admin = profile?.role === 'admin';
  const links = admin ? [['/', 'Overview'], ['/clients', 'Clients'], ['/liquidation', 'Ledger'], ['/collectors', 'Collectors'], ['/holidays', 'Holidays'], ['/settings', 'Settings']] : [['/', 'Collections']];
  return <div className={admin ? "mobile-shell admin-workspace" : "mobile-shell collector-workspace"}><header className="mobile-header"><div className="brand"><Logo /><div><strong>MCL Lending</strong><small>{profile?.fullName} · {admin ? 'Administrator' : 'Collector'}</small></div></div><button className="btn" onClick={() => void signOut().catch(e => setError(describeError(e)))}>Sign out</button></header>
    {admin && <nav className="mobile-nav" aria-label="Main">{links.map(([to, title]) => <NavLink key={to} to={to} end>{title}</NavLink>)}</nav>}
    <main className="mobile-content">{error && <p role="alert">{error}</p>}<Suspense fallback={<p role="status">Loading workspace…</p>}><Outlet /></Suspense></main>
  </div>;
}
function Session() {
  const { status, profile, user } = useAuth();
  if (status === 'loading') return <main className="card" role="status">Verifying account access. Connect to the internet to continue.</main>;
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
