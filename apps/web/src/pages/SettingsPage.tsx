import { useEffect, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { FormField } from '../components/FormField';
import { PageHeader } from '../components/PageHeader';
import { PrintLayoutFields } from '../components/PrintLayoutFields';
import { LoadingState } from '../components/StateMessage';
import { Icon } from '../components/Icon';
import { DEFAULT_SETTINGS, validateSettings, type AppSettings, type PrintableKind, type TrashRetentionDays } from '../config/settings';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useSettings } from '../context/SettingsContext';
import { describeError } from '../lib/errors';
import { completeClientRecords } from '../services/clients';
import { saveSettings } from '../services/settings';
import './workspace-tools.css';

const titles: Record<PrintableKind, string> = { index: 'Index Card', promissory: 'Promissory Note', summary: 'Daily Summary Sheet' };
const sections = [
  { id: 'general', label: 'General', icon: 'settings', description: 'Workspace and client defaults' },
  { id: 'payments', label: 'Payment policy', icon: 'wallet', description: 'Collector payment requirements' },
  { id: 'trash', label: 'Trash & retention', icon: 'trash', description: 'Automatic deletion preferences' },
  { id: 'index', label: 'Index card', icon: 'file', description: 'Lender details and colors' },
  { id: 'promissory', label: 'Promissory note', icon: 'documents', description: 'Payee and note wording' },
  { id: 'studio', label: 'Print defaults', icon: 'print', description: 'Paper sizes and page layouts' },
] as const;

function SettingsEditor({ saved, unavailable }: { saved: AppSettings; unavailable: boolean }) {
  const { hash } = useLocation();
  const { user } = useAuth();
  const { clients } = useData();
  const [draft, setDraft] = useState(() => structuredClone(saved));
  const [baseline, setBaseline] = useState(() => JSON.stringify(saved));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [activeSection, setActiveSection] = useState('general');
  const changedRemotely = JSON.stringify(saved) !== baseline;
  const dirty = JSON.stringify(draft) !== baseline;
  const missing = clients.filter((c) => !c.clientNumber || !c.transactionNumber || !c.dailyAmount).length;

  useEffect(() => {
    if (!sections.some(section => hash === `#settings-${section.id}`)) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveSection(visible[0].target.id.replace('settings-', ''));
    }, { rootMargin: '-15% 0px -60% 0px' });
    sections.forEach(section => {
      const element = document.getElementById(`settings-${section.id}`);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

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
    <form onSubmit={save} className="settings-form settings-workspace">
      <aside className="settings-navigation">
        <span className="workspace-eyebrow">Workspace settings</span>
        <nav aria-label="Settings sections">
          {sections.map(section => <a key={section.id} href={`#settings-${section.id}`} className={activeSection === section.id ? 'settings-nav-link active' : 'settings-nav-link'} aria-current={activeSection === section.id ? 'location' : undefined} onClick={() => setActiveSection(section.id)}>
            <Icon name={section.icon} /><span><strong>{section.label}</strong><small>{section.description}</small></span><Icon name="chevron-right" />
          </a>)}
        </nav>
        <p className="settings-navigation-note"><Icon name="info" />Saved settings apply to your shared workspace. Review your changes, then save below.</p>
      </aside>
      <div className="settings-sections">
      {changedRemotely && <p className="alert alert-warning" role="status">Settings changed in another session. Reload saved settings before saving to avoid overwriting them. <button type="button" className="btn btn-small" onClick={reload}>Reload saved settings</button></p>}
      <fieldset id="settings-general" className="card settings-section" disabled={busy || unavailable}>
        <legend>Configurations / General</legend>
        <p className="settings-section-intro">Set up your workspace name, client identifiers and everyday defaults.</p>
        <div className="form-grid">
          <FormField label="Website name"><input value={draft.general.businessName} maxLength={120} onChange={(e) => field('general', 'businessName', e.target.value)} /></FormField>
          <FormField label="Client ID prefix" hint="Applies to future allocations; existing IDs remain stable."><input value={draft.general.clientIdPrefix} maxLength={20} onChange={(e) => field('general', 'clientIdPrefix', e.target.value)} /></FormField>
          <FormField label="Client ID digits" hint={`Example: ${draft.general.clientIdPrefix}${'1'.padStart(Math.min(10, Math.max(1, draft.general.clientIdDigits)), '0')}`}><input type="number" min="1" max="10" value={draft.general.clientIdDigits} onChange={(e) => field('general', 'clientIdDigits', Number(e.target.value))} /></FormField>
          <FormField label="Default payment note"><input value={draft.general.defaultPaymentNote} maxLength={500} onChange={(e) => field('general', 'defaultPaymentNote', e.target.value)} /></FormField>
          <FormField label="Dashboard recent payments"><input type="number" min="1" max="100" value={draft.general.recentPaymentsLimit} onChange={(e) => field('general', 'recentPaymentsLimit', Number(e.target.value))} /></FormField>
          <FormField label="Dashboard due clients"><input type="number" min="1" max="100" value={draft.general.dueClientsLimit} onChange={(e) => field('general', 'dueClientsLimit', Number(e.target.value))} /></FormField>
        </div>
        <p className="field-hint">Client and transaction numbers stay unique. Existing numbers are preserved when these defaults change.</p>
        <details className="settings-maintenance"><summary>Client record maintenance <span className="tools-count">{missing} incomplete</span></summary>
        <button type="button" className="btn" onClick={complete} disabled={missing === 0}>Complete existing client records ({missing})</button>
        <p className="field-hint">Fill missing client numbers, transaction numbers and daily amounts. Existing records and payment references stay intact.</p>
        </details>
      </fieldset>

      <fieldset id="settings-payments" className="card settings-section" disabled={busy || unavailable}>
        <legend>Configurations / Payment policy</legend>
        <p className="settings-section-intro">Choose how the daily payable amount applies to collector receipts.</p>
        <label className="check-label"><input type="checkbox" checked={draft.payments.enforceDailyMinimum}
          onChange={(event) => { setDraft((previous) => ({ ...previous, payments: { enforceDailyMinimum: event.target.checked } })); setMessage(''); }} /> Require collectors to meet the daily payable amount</label>
        <p className="field-hint">Off: daily payable is information only. On: each collector receipt must be at least the client’s saved daily payable amount. Larger payments remain allowed, subject to the outstanding balance in the collection app.</p>
        <p className="muted small">The minimum applies to each receipt. Administrators can still record partial payments and final settlements below the minimum.</p>
      </fieldset>

      <fieldset id="settings-trash" className="card settings-section" disabled={busy || unavailable}>
        <legend>Configurations / Trash</legend>
        <p className="settings-section-intro">Give deleted clients a recovery period before they are permanently removed.</p>
        <FormField label="Automatically delete Trash" hint="The retention period starts when a client is moved to Trash. Changes also apply to clients already in Trash.">
          <select value={draft.trash.autoDeleteDays} onChange={(event) => {
            setDraft(previous => ({ ...previous, trash: { autoDeleteDays: Number(event.target.value) as TrashRetentionDays } }));
            setMessage('');
          }}>
            <option value={0}>Do not automatically delete</option>
            <option value={3}>After 3 days</option>
            <option value={7}>After 7 days</option>
            <option value={30}>After 30 days</option>
          </select>
        </FormField>
        <p className="field-hint">Expired clients and their payments and renewal history are permanently deleted. Cleanup runs while an administrator has the web app open and catches up at the next sign-in. Deletion already started will finish even if automatic deletion is turned off.</p>
      </fieldset>

      <fieldset id="settings-index" className="card settings-section" disabled={busy || unavailable}>
        <legend>Printables / Index Template</legend>
        <p className="settings-section-intro">Customize the lender information and accents on printed index cards.</p>
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

      <fieldset id="settings-promissory" className="card settings-section" disabled={busy || unavailable}>
        <legend>Printables / Promissory Template</legend>
        <p className="settings-section-intro">Keep payee details and the interest statement consistent across documents.</p>
        <div className="form-grid">
          <FormField label="Payee / person to pay"><input value={draft.promissory.payee} maxLength={200} onChange={(e) => field('promissory', 'payee', e.target.value)} /></FormField>
          <FormField label="Place of execution"><input value={draft.promissory.executionPlace} maxLength={300} onChange={(e) => field('promissory', 'executionPlace', e.target.value)} /></FormField>
        </div>
        <FormField label="Interest and service charge statement" hint="Printed verbatim in the note; this text does not recalculate the loan’s fixed interest."><textarea rows={3} maxLength={1500} value={draft.promissory.interestStatement} onChange={(e) => field('promissory', 'interestStatement', e.target.value)} /></FormField>
        <p className="muted small">Principal, approval date, borrower, address, term, total in words and daily amount come from the client record. Valid ID, ID number, co-maker and signatures remain blank. The supplied note’s other clauses are retained.</p>
      </fieldset>

      <fieldset id="settings-studio" className="card settings-section" disabled={busy || unavailable}>
        <legend>Printables / Studio defaults</legend>
        <p className="settings-section-intro">Choose the starting page layout for each document. You can adjust individual print jobs in the studio.</p>
        {(Object.keys(titles) as PrintableKind[]).map((kind) => <div key={kind} className="settings-template"><h2>{titles[kind]}</h2><PrintLayoutFields value={draft.studio[kind]} onChange={(layout) => setDraft((previous) => ({ ...previous, studio: { ...previous.studio, [kind]: layout } }))} /></div>)}
        <p className="muted small">The index workbook has no physical paper setup. Template size preserves its approximate 238 × 122 mm worksheet proportions for 45 days and grows for longer terms. The note uses its original A4 size and 12.7 mm margins. Studio overrides apply to the current session; these saved defaults apply across sessions.</p>
      </fieldset>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {message && <p className="alert alert-success" role="status">{message}</p>}
      <div className="settings-actions settings-save-bar">
        <span className="settings-save-state"><Icon name={dirty ? 'clock' : 'check'} />{dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <button className="btn btn-primary" type="submit" disabled={busy || unavailable || changedRemotely || !dirty}>{busy ? 'Saving…' : 'Save settings'}</button>
        <button className="btn" type="button" onClick={reload} disabled={busy}>Discard changes</button>
        <button className="btn" type="button" disabled={busy || unavailable} onClick={() => { setDraft(structuredClone(DEFAULT_SETTINGS)); setMessage('Default values loaded. Save settings to apply them.'); }}>Restore defaults</button>
      </div>
      </div>
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
