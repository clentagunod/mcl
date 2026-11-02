import { useState, type FormEvent } from 'react';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { PrintLayoutFields } from '../components/PrintLayoutFields';
import { LoadingState } from '../components/StateMessage';
import { DEFAULT_SETTINGS, validateSettings, type AppSettings, type PrintableKind } from '../config/settings';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { describeError } from '../lib/errors';
import { completeClientRecords } from '../services/clients';
import { saveSettings } from '../services/settings';

const titles: Record<PrintableKind, string> = { index: 'Index Card', promissory: 'Promissory Note', summary: 'Daily Summary Sheet' };

function SettingsEditor({ saved, unavailable }: { saved: AppSettings; unavailable: boolean }) {
  const { user } = useAuth();
  const { clients } = useData();
  const [draft, setDraft] = useState(() => structuredClone(saved));
  const [baseline, setBaseline] = useState(() => JSON.stringify(saved));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const changedRemotely = JSON.stringify(saved) !== baseline;
  const dirty = JSON.stringify(draft) !== baseline;
  const missing = clients.filter((c) => !c.clientNumber || !c.transactionNumber || !c.dailyAmount).length;

  function field<K extends 'general' | 'index' | 'promissory'>(group: K, key: keyof AppSettings[K], value: string | number) {
    setDraft((previous) => ({ ...previous, [group]: { ...previous[group], [key]: value } }));
    setMessage('');
  }
  function reload() { setDraft(structuredClone(saved)); setBaseline(JSON.stringify(saved)); setError(''); setMessage(''); }

  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setMessage('');
    const validation = validateSettings(draft);
    if (validation) { setError(validation); return; }
    if (!user || changedRemotely) return;
    setBusy(true);
    try {
      await saveSettings(draft, user.uid, JSON.parse(baseline) as AppSettings);
      setBaseline(JSON.stringify(draft)); setMessage('Settings saved to Firebase. Connected web sessions update automatically.');
    } catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }
  async function complete() {
    setBusy(true); setMessage(''); setError('');
    try { await completeClientRecords(clients); setMessage('Existing client records now have public IDs, transaction numbers and daily amounts.'); }
    catch (caught) { setError(describeError(caught)); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="settings-form">
      {changedRemotely && <p className="alert alert-warning" role="status">Settings changed in another session. Reload saved settings before saving to avoid overwriting them. <button type="button" className="btn btn-small" onClick={reload}>Reload saved settings</button></p>}
      <fieldset className="card" disabled={busy || unavailable}>
        <legend>Configurations / General</legend>
        <div className="form-grid">
          <FormField label="Website name"><input value={draft.general.businessName} maxLength={120} onChange={(e) => field('general', 'businessName', e.target.value)} /></FormField>
          <FormField label="Client ID prefix" hint="Applies to future allocations; existing IDs remain stable."><input value={draft.general.clientIdPrefix} maxLength={20} onChange={(e) => field('general', 'clientIdPrefix', e.target.value)} /></FormField>
          <FormField label="Client ID digits" hint={`Example: ${draft.general.clientIdPrefix}${'1'.padStart(Math.min(10, Math.max(1, draft.general.clientIdDigits)), '0')}`}><input type="number" min="1" max="10" value={draft.general.clientIdDigits} onChange={(e) => field('general', 'clientIdDigits', Number(e.target.value))} /></FormField>
          <FormField label="Default payment note"><input value={draft.general.defaultPaymentNote} maxLength={500} onChange={(e) => field('general', 'defaultPaymentNote', e.target.value)} /></FormField>
          <FormField label="Dashboard recent payments"><input type="number" min="1" max="100" value={draft.general.recentPaymentsLimit} onChange={(e) => field('general', 'recentPaymentsLimit', Number(e.target.value))} /></FormField>
          <FormField label="Dashboard due clients"><input type="number" min="1" max="100" value={draft.general.dueClientsLimit} onChange={(e) => field('general', 'dueClientsLimit', Number(e.target.value))} /></FormField>
        </div>
        <p className="muted small">Transaction numbers are unique five digit values (00001–99999), allocated by a Firebase transaction. Deleted numbers are never reused. ID digit limits stop allocation rather than truncating numbers.</p>
        <button type="button" className="btn" onClick={complete} disabled={missing === 0}>Complete existing client records ({missing})</button>
        <p className="field-hint">Missing fields are also completed automatically after sign-in. This button retries interrupted updates. Legacy document IDs and payment references remain intact.</p>
      </fieldset>

      <fieldset className="card" disabled={busy || unavailable}>
        <legend>Configurations / Payment policy</legend>
        <label className="check-label"><input type="checkbox" checked={draft.payments.enforceDailyMinimum}
          onChange={(event) => { setDraft((previous) => ({ ...previous, payments: { enforceDailyMinimum: event.target.checked } })); setMessage(''); }} /> Require collectors to meet the daily payable amount</label>
        <p className="field-hint">Off: daily payable is information only. On: each collector receipt must be at least the client’s saved daily payable amount. Larger payments remain allowed, subject to the outstanding balance in the collection app.</p>
        <p className="muted small">This is a minimum per receipt, not a daily cap or a sum of smaller receipts. Administrators may record partial payments and final settlements below the minimum. Publish the web Firestore rules to enforce this on Android and other collector clients. The Android UI must read this policy for a helpful validation message.</p>
      </fieldset>

      <fieldset className="card" disabled={busy || unavailable}>
        <legend>Printables / Index Template</legend>
        <div className="form-grid">
          <FormField label="Lender name"><input value={draft.index.businessName} maxLength={120} onChange={(e) => field('index', 'businessName', e.target.value)} /></FormField>
          <FormField label="Branch / location"><input value={draft.index.branch} maxLength={200} onChange={(e) => field('index', 'branch', e.target.value)} /></FormField>
          <FormField label="Mobile number"><input type="tel" value={draft.index.mobile} maxLength={40} onChange={(e) => field('index', 'mobile', e.target.value)} /></FormField>
          <FormField label="Printed amount"><select value={draft.index.amountBasis} onChange={(e) => field('index', 'amountBasis', e.target.value)}><option value="total">Principal + interest</option><option value="principal">Principal only</option></select></FormField>
          <FormField label="Heading accent"><input type="color" value={draft.index.headingColor} onChange={(e) => field('index', 'headingColor', e.target.value)} /></FormField>
          <FormField label="Payment cell accent"><input type="color" value={draft.index.cellColor} onChange={(e) => field('index', 'cellColor', e.target.value)} /></FormField>
        </div>
        <p className="muted small">“Borrower’s copy” stays fixed. Printed amount changes only the label; balances always use principal + interest. Each paying date occupies one numbered slot, with multiple receipts on that date combined. Signature spaces stay blank.</p>
      </fieldset>

      <fieldset className="card" disabled={busy || unavailable}>
        <legend>Printables / Promissory Template</legend>
        <div className="form-grid">
          <FormField label="Payee / person to pay"><input value={draft.promissory.payee} maxLength={200} onChange={(e) => field('promissory', 'payee', e.target.value)} /></FormField>
          <FormField label="Place of execution"><input value={draft.promissory.executionPlace} maxLength={300} onChange={(e) => field('promissory', 'executionPlace', e.target.value)} /></FormField>
        </div>
        <FormField label="Interest and service charge statement" hint="Printed verbatim in the note; this text does not recalculate the loan’s fixed interest."><textarea rows={3} maxLength={1500} value={draft.promissory.interestStatement} onChange={(e) => field('promissory', 'interestStatement', e.target.value)} /></FormField>
        <p className="muted small">Principal, approval date, borrower, address, term, total in words and daily amount come from the client record. Valid ID, ID number, co-maker and signatures remain blank. The supplied note’s other clauses are retained.</p>
      </fieldset>

      <fieldset className="card" disabled={busy || unavailable}>
        <legend>Printables / Studio defaults</legend>
        {(Object.keys(titles) as PrintableKind[]).map((kind) => <div key={kind} className="settings-template"><h2>{titles[kind]}</h2><PrintLayoutFields value={draft.studio[kind]} onChange={(layout) => setDraft((previous) => ({ ...previous, studio: { ...previous.studio, [kind]: layout } }))} /></div>)}
        <p className="muted small">The index workbook has no physical paper setup. Template size preserves its approximate 238 × 122 mm worksheet proportions for 45 days and grows for longer terms. The note uses its original A4 size and 12.7 mm margins. Studio overrides apply to the current session; these saved defaults apply across sessions.</p>
      </fieldset>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      <div className="settings-actions">
        <button className="btn btn-primary" type="submit" disabled={busy || unavailable || changedRemotely || !dirty}>{busy ? 'Saving…' : 'Save settings'}</button>
        <button className="btn" type="button" onClick={reload} disabled={busy}>Discard changes</button>
        <button className="btn" type="button" disabled={busy || unavailable} onClick={() => { setDraft(structuredClone(DEFAULT_SETTINGS)); setMessage('Default values loaded. Save settings to apply them.'); }}>Restore defaults</button>
      </div>
      <details className="card settings-storage"><summary>Firebase storage and compatibility</summary>
        <p>Settings use component documents with an <code>elements</code> subcollection:</p>
        <ul><li><code>settings/Configurations/elements/general</code> — website behavior and client ID format.</li><li><code>settings/Printables/elements/indexTemplate</code> — lender, location, mobile, amount basis and colors.</li><li><code>settings/Printables/elements/promissoryTemplate</code> — payee, statement and execution place.</li><li><code>settings/Printables/elements/studio</code> — paper settings for each document.</li><li><code>settings/Configurations/elements/counters</code> and <code>settings/Identifiers/…</code> — atomic number allocation and permanent reservations.</li></ul>
        <p><code>settings/Configurations/elements/paymentPolicy</code> stores the collector minimum toggle. Active collectors can read only this settings document; admin settings remain private.</p>
        <p>Settings are admin-managed; active collectors can read the payment policy only. The web-scoped Firestore rules must be published before settings and ID allocation can work. See <code>apps/web/docs/print-studio.md</code> for deployment instructions and <code>apps/web/docs/android-development-context.md</code> for the Android data contract. Existing Android payments are read automatically; the current Android code does not write notes, so those receipts use the default note.</p>
      </details>
    </form>
  );
}

export default function SettingsPage() {
  const { settings, loading, error } = useSettings();
  if (loading) return <LoadingState />;
  return <><PageHeader title="Settings" description="Shared configuration for your lending workspace and document templates." />
    {error && <p className="alert alert-error" role="alert">Firebase settings are unavailable. {error} Publish the web Firestore rules, then reload this page.</p>}
    <SettingsEditor saved={settings} unavailable={!!error} />
  </>;
}
