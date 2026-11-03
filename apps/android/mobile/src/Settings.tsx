import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoadingPanel, Notice } from './Status';
import { networkOnline, useConnectivity } from './connectivity';
import { useAuth } from '@web/context/AuthContext';
import { useSettings } from '@web/context/SettingsContext';
import { useData } from '@web/context/DataContext';
import { saveSettings } from '@web/services/settings';
import { completeClientRecords } from '@web/services/clients';
import { validateSettings } from '@web/config/settings';
import { describeError } from '@web/lib/errors';
export default function Settings() {
  const { settings, loading, error } = useSettings();
  const { user } = useAuth();
  const { clients } = useData();
  const [baseline, setBaseline] = useState(settings);
  const [draft, setDraft] = useState(settings);
  const online = useConnectivity();
  const [working, setWorking] = useState<'save' | 'identifiers' | null>(null);
  const busy = working !== null;
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; title: string; detail?: string } | null>(null);
  const initialized = useRef(!loading);
  useEffect(() => {
    if (!loading && !error && !initialized.current) {
      initialized.current = true; setBaseline(settings); setDraft(settings);
    }
  }, [settings, loading, error]);
  const changed = initialized.current && JSON.stringify(settings) !== JSON.stringify(baseline);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !networkOnline()) return;
    setMessage(null);
    const invalid = validateSettings(draft);
    if (invalid) { setMessage({ tone: 'error', title: 'Check your settings', detail: invalid }); return; }
    setWorking('save');
    try { await saveSettings(draft, user!.uid, baseline); setBaseline(draft); setMessage({ tone: 'success', title: 'Settings saved', detail: 'The server confirmed your changes.' }); }
    catch (e) { setMessage({ tone: 'error', title: 'Settings were not confirmed', detail: describeError(e) }); } finally { setWorking(null); }
  }
  async function completeIdentifiers() {
    if (busy || !networkOnline()) return;
    setWorking('identifiers'); setMessage(null);
    try { await completeClientRecords(clients); setMessage({ tone: 'success', title: 'Client identifiers updated', detail: 'The server confirmed the update.' }); }
    catch (e) { setMessage({ tone: 'error', title: 'Identifiers were not confirmed', detail: describeError(e) }); }
    finally { setWorking(null); }
  }
  return <><h1>Settings</h1>
    {loading && online && <LoadingPanel title="Loading saved settings">Getting the current business configuration.</LoadingPanel>}
    {changed && <Notice tone="warning" title="Settings changed elsewhere">Reload saved settings before making changes. Your current draft has been kept.</Notice>}
    {busy && <Notice tone="loading" title={working === 'save' ? 'Saving settings' : 'Updating client identifiers'}>Please wait for server confirmation.</Notice>}
    {message && <Notice tone={message.tone} title={message.title}>{message.detail}</Notice>}
    <form onSubmit={save}><fieldset className="card" disabled={busy || loading || !!error || changed}>
      <legend>Business configuration</legend>
      <label>Business name<input required maxLength={120} value={draft.general.businessName} onChange={e => setDraft({ ...draft, general: { ...draft.general, businessName: e.target.value } })} /></label>
      <label>Default payment note<input maxLength={500} value={draft.general.defaultPaymentNote} onChange={e => setDraft({ ...draft, general: { ...draft.general, defaultPaymentNote: e.target.value } })} /></label>
      <label>Client ID prefix<input maxLength={20} value={draft.general.clientIdPrefix} onChange={e => setDraft({ ...draft, general: { ...draft.general, clientIdPrefix: e.target.value } })} /></label>
      <label>Client ID digits<input type="number" min={1} max={10} value={draft.general.clientIdDigits} onChange={e => setDraft({ ...draft, general: { ...draft.general, clientIdDigits: Number(e.target.value) } })} /></label>
      <label>Recent payments shown<input type="number" min={1} max={100} value={draft.general.recentPaymentsLimit} onChange={e => setDraft({ ...draft, general: { ...draft.general, recentPaymentsLimit: Number(e.target.value) } })} /></label>
      <label>Due clients shown<input type="number" min={1} max={100} value={draft.general.dueClientsLimit} onChange={e => setDraft({ ...draft, general: { ...draft.general, dueClientsLimit: Number(e.target.value) } })} /></label>
      <label className="check-label"><input type="checkbox" checked={draft.payments.enforceDailyMinimum} onChange={e => setDraft({ ...draft, payments: { enforceDailyMinimum: e.target.checked } })} />Require daily minimum per collector receipt</label>
      <p className="muted">Administrators may record smaller settlements. Public numbers remain stable when configuration changes.</p>
      <button className="btn btn-primary" disabled={!online}>{working === 'save' ? 'Saving…' : 'Save settings'}</button>
    </fieldset></form>
    <div className="client-actions"><button className="btn" disabled={busy || loading} onClick={() => { setDraft(settings); setBaseline(settings); setMessage(null); }}>Reload settings</button>
    <button className="btn" disabled={!online || busy || loading || !!error} onClick={() => void completeIdentifiers()}>{working === 'identifiers' ? 'Updating…' : 'Complete client identifiers'}</button></div>
  </>;
}
