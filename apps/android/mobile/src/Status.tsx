import type { ReactNode } from 'react';
import { awaitingServer, useConnectivity } from './connectivity';

export type NoticeTone = 'info' | 'loading' | 'warning' | 'error' | 'success';
export function StatusIcon({ tone }: { tone: NoticeTone | 'offline' }) {
  if (tone === 'loading') return <span className="status-spinner" aria-hidden="true" />;
  return <svg className="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {tone === 'offline' ? <><path d="m3 3 18 18M9 9a8 8 0 0 1 9 3M5 12a11 11 0 0 1 1.5-1.4M2 8a16 16 0 0 1 1.8-1.3M8 16a6 6 0 0 1 6.6-.8M13 5a16 16 0 0 1 9 3" /><circle cx="12" cy="20" r="1" /></>
      : tone === 'success' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
      : tone === 'warning' ? <><path d="M10.3 4.2 2.6 18a1.7 1.7 0 0 0 1.5 2.5h15.8a1.7 1.7 0 0 0 1.5-2.5L13.7 4.2a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 3h.01" /></>
      : <><circle cx="12" cy="12" r="9" /><path d={tone === 'error' ? 'm9 9 6 6m0-6-6 6' : 'M12 11v5m0-9h.01'} /></>}
  </svg>;
}
export function Notice({ tone = 'info', title, children, icon }: {
  tone?: NoticeTone; title: string; children?: ReactNode; icon?: 'offline';
}) {
  return <div className={'app-notice notice-' + tone} role={tone === 'error' ? 'alert' : 'status'} aria-atomic="true">
    <StatusIcon tone={icon ?? tone} /><div className="notice-copy"><strong>{title}</strong>{children && <div className="notice-description">{children}</div>}</div>
  </div>;
}
export function OfflineNotice({ login = false, form = false, access = false }: { login?: boolean; form?: boolean; access?: boolean }) {
  const online = useConnectivity();
  if (online) return null;
  return <Notice tone="warning" icon="offline" title="No internet connection">
    {login ? 'Check your Wi-Fi or mobile data connection to sign in.'
      : access ? 'Reconnect to verify your account and open your workspace.'
      : form ? 'Reconnect to save changes. Your entries will stay in this form.'
      : 'Displayed records may be out of date. Updates will resume automatically when you reconnect.'}
  </Notice>;
}
export function LoadingPanel({ title = 'Loading workspace', children }: { title?: string; children?: ReactNode }) {
  return <div className="loading-panel" role="status" aria-atomic="true"><StatusIcon tone="loading" /><strong>{title}</strong>{children && <p>{children}</p>}</div>;
}
export function WorkspaceFeedback({ error, settingsError }: {
  error: string | null; settingsError: string | null;
}) {
  const errors = [...new Set([error && !awaitingServer(error) ? error : null, settingsError].filter(Boolean))];
  return <section className="workspace-feedback" aria-label="Workspace updates">
    <OfflineNotice />
    {errors.map(message => <Notice key={message} tone="error" title="Unable to update records">{message}</Notice>)}
  </section>;
}
