import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { ErrorState } from './StateMessage';
import { Logo } from './Logo';
import { TrashAutoDeletion } from './TrashAutoDeletion';
import { Icon, type IconName } from './Icon';
import { ThemeToggle } from './ThemeToggle';
import { AppFooter } from './AppFooter';
import { formatDate } from '../lib/dates';

const NAV_ITEMS: { to: string; label: string; icon: IconName; hint: string; group: 'workspace' | 'manage'; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', hint: 'Your portfolio at a glance', group: 'workspace', end: true },
  { to: '/clients', label: 'Clients', icon: 'clients', hint: 'Manage clients and their loans', group: 'workspace' },
  { to: '/printables', label: 'Printables', icon: 'documents', hint: 'Prepare documents, print and export', group: 'workspace' },
  { to: '/liquidation', label: 'Consolidation', icon: 'wallet', hint: 'Consolidation and liquidation ledger', group: 'workspace' },
  { to: '/collectors', label: 'Collectors & Admins', icon: 'users', hint: 'Manage team accounts and access', group: 'manage' },
  { to: '/holidays', label: 'Holidays', icon: 'calendar', hint: 'Manage non-collection dates', group: 'manage' },
  { to: '/settings', label: 'Settings', icon: 'settings', hint: 'Workspace and document preferences', group: 'manage' },
  { to: '/trash', label: 'Trash', icon: 'trash', hint: 'Restore or permanently delete clients', group: 'manage' },
];

export function Layout() {
  const { user, profile, signOut } = useAuth();
  const { error, today } = useData();
  const { settings, error: settingsError } = useSettings();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const current = NAV_ITEMS.find(item => item.to === location.pathname) ?? NAV_ITEMS[0];
  const name = profile?.fullName || user?.email || 'Administrator';
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        document.querySelector<HTMLButtonElement>('.mobile-menu')?.focus();
      }
    }
    document.querySelector<HTMLAnchorElement>('.sidebar .nav-link.active')?.focus();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

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
      <a className="skip-link" href="#main-content">Skip to content</a>
      {menuOpen && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
      <aside className={menuOpen ? 'sidebar is-open' : 'sidebar'} id="workspace-sidebar">
        <div className="brand">
          <Logo />
          <div><span>{settings.general.businessName}</span><small>Lending workspace</small></div>
          <button className="icon-button sidebar-close" type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)}><Icon name="close" /></button>
        </div>
        <nav aria-label="Main">
          {(['workspace', 'manage'] as const).map(group => <div className="nav-group" key={group}>
            <p className="nav-group-label">{group === 'workspace' ? 'Workspace' : 'Management'}</p>
            <ul>{NAV_ITEMS.filter(item => item.group === group).map(item => <li key={item.to}>
              <NavLink to={item.to} end={item.end} title={item.hint} onClick={() => setMenuOpen(false)} className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                <Icon name={item.icon} /><span>{item.label}</span>
              </NavLink>
            </li>)}</ul>
          </div>)}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-account"><span className="workspace-avatar">{initials}</span><div><strong title={name}>{name}</strong><small>{profile?.role === 'developer' ? 'Developer' : 'Administrator'}</small></div></div>
          <button type="button" className="btn btn-block signout-button" onClick={handleSignOut} disabled={signingOut}><Icon name="logout" size={16} />{signingOut ? 'Signing out…' : 'Sign out'}</button>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="topbar-location"><button type="button" className="icon-button mobile-menu" aria-label="Open navigation" aria-controls="workspace-sidebar" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" size={21} /></button><span className="topbar-workspace">Workspace</span><Icon name="chevron-right" size={14} /><strong>{current.label}</strong></div>
          <div className="topbar-actions"><span className="topbar-date"><Icon name="calendar" size={15} />{formatDate(today)}</span><ThemeToggle /><span className="topbar-avatar" title={name}>{initials}</span></div>
        </header>
        <main className="content" id="main-content" tabIndex={-1}>
          <TrashAutoDeletion />
          {error && <ErrorState message={error} />}
          {settingsError && <p className="alert alert-error" role="alert">Settings could not sync: {settingsError} Open Settings for connection details.</p>}
          <div key={location.pathname} className="page-transition"><Outlet /></div>
        </main>
        <AppFooter className="workspace-footer" />
      </div>
    </div>
  );
}
