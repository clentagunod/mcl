import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ErrorState } from './StateMessage';
import { Logo } from './Logo';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/clients', label: 'Clients', end: false },
  { to: '/printables', label: 'Printables', end: false },
  { to: '/liquidation', label: 'Consolidation / Liquidation', end: false },
  { to: '/collectors', label: 'Collectors', end: false },
  { to: '/holidays', label: 'Holidays', end: false },
  { to: '/settings', label: 'Settings', end: false },
];

export function Layout() {
  const { user, signOut } = useAuth();
  const { error } = useData();
  const { settings, error: settingsError } = useSettings();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <Logo />
          <span>{settings.general.businessName}</span>
        </div>
        <nav aria-label="Main">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <p className="muted small" title={user?.email ?? undefined}>
            {user?.email}
          </p>
          <button type="button" className="btn btn-block" onClick={handleSignOut} disabled={signingOut}>
            Sign out
          </button>
        </div>
      </aside>
      <main className="content">
        {error && <ErrorState message={error} />}
        {settingsError && <p className="alert alert-error" role="alert">Settings could not sync: {settingsError} Open Settings for connection details.</p>}
        <Outlet />
      </main>
    </div>
  );
}
