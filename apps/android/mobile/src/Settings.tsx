import { useState, type FormEvent } from 'react';
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const changed = JSON.stringify(settings) !== JSON.stringify(baseline);
  async function save(event: FormEvent) {
    event.preventDefault(); setMessage('');
    const invalid = validateSettings(draft);
    if (invalid) { setMessage(invalid); return; }
    setBusy(true);
    try { await saveSettings(draft, user!.uid, baseline); setBaseline(draft); setMessage('Settings saved.'); }
    catch (e) { setMessage(describeError(e)); } finally { setBusy(false); }
  }
  return <><h1>Settings</h1>{error && <p role="alert">{error}</p>}
    {changed && <p className="alert">Settings changed in another session. Reload before saving.</p>}
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
      <button className="btn btn-primary">Save settings</button>
    </fieldset></form>
    <div className="client-actions"><button className="btn" disabled={busy} onClick={() => { setDraft(settings); setBaseline(settings); setMessage(''); }}>Reload settings</button>
    <button className="btn" disabled={busy || loading || !!error} onClick={async () => { setBusy(true); try { await completeClientRecords(clients); setMessage('Client identifiers updated.'); } catch (e) { setMessage(describeError(e)); } finally { setBusy(false); } }}>Complete client identifiers</button></div>
    {message && <p role="status" className="alert">{message}</p>}
  </>;
}
