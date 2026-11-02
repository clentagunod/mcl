import { useState, type FormEvent } from 'react';
import { collection, doc } from 'firebase/firestore';
import { db } from '@web/config/firebase';
import { useAuth } from '@web/context/AuthContext';
import { useData } from '@web/context/DataContext';
import { useSettings } from '@web/context/SettingsContext';
import { Modal } from '@web/components/Modal';
import { dailyPayable, indexEntries } from '@web/lib/printables';
import { formatPeso } from '@web/lib/money';
import { describeError } from '@web/lib/errors';
import type { Client, Payment, PaymentInput } from '@web/types';
import { parseAmount, saveReceipt } from './payments';
export function PaymentDialog({ client, previous, onClose }: { client: Client; previous?: Payment; onClose: () => void }) {
  const { user, profile } = useAuth();
  const { payments, today } = useData();
  const policy = useSettings();
  const key = 'mcl-pending-' + user!.uid + '-' + client.id;
  const [pending, setPending] = useState<{ id: string; input: PaymentInput } | null>(() => {
    if (previous) return null;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  });
  const [amount, setAmount] = useState(String(previous?.amount ?? pending?.input.amount ?? dailyPayable(client)));
  const [date, setDate] = useState(previous?.paymentDate ?? pending?.input.paymentDate ?? today);
  const [notes, setNotes] = useState(previous?.notes ?? pending?.input.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const entries = indexEntries(client, payments);
  const day = entries.find(e => e.date === date)?.day ?? entries.filter(e => e.date < date).length + 1;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || saved || !user || !profile) return;
    setError('');
    try {
      const attempt = pending ?? { id: previous?.id ?? doc(collection(db, 'payments')).id, input: {
        clientId: client.id, amount: parseAmount(amount), paymentDate: date,
        collectorId: user.uid, collectorName: profile.fullName, notes: notes.trim(),
      } };
      if (!previous) {
        localStorage.setItem(key, JSON.stringify(attempt));
        setPending(attempt);
      }
      setBusy(true);
      await saveReceipt(attempt.id, attempt.input, previous);
      localStorage.removeItem(key);
      setSaved(true);
    } catch (caught) {
      setError(describeError(caught));
      // A validation rejection or explicit denial did not commit. Transport failures
      // retain the receipt so an uncertain acknowledgement can be retried safely.
      const code = (caught as { code?: string }).code;
      if (!code || ['permission-denied', 'invalid-argument', 'failed-precondition'].includes(code)) {
        localStorage.removeItem(key);
        setPending(null);
      }
    }
    finally { setBusy(false); }
  }
  return <Modal title={previous ? 'Correct payment' : 'Add payment'} onClose={() => { if (!busy) onClose(); }}>
    <h3>{client.firstName} {client.lastName}</h3>
    {saved ? <p className="alert alert-success" role="status">Payment confirmed by the server.</p> : <form onSubmit={submit}>
      <fieldset disabled={busy || !!pending}>
        <label>Amount collected (₱)<input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Actual collection date<input type="date" required min={client.approvalDate} max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
        <p>Index day {day} · Daily payable {formatPeso(dailyPayable(client))}</p>
        <p className="muted small">Days follow paying dates. Receipts on one date share a day; missed dates leave no gap.</p>
        <label>Notes (optional)<textarea maxLength={1500} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </fieldset>
      {profile?.role === 'collector' && <p>{policy.loading ? 'Checking payment policy…' : policy.settings.payments.enforceDailyMinimum ? 'The daily minimum is required for each receipt.' : 'The daily amount is a suggestion.'}</p>}
      {policy.error && <p role="alert">{policy.error}</p>}
      {pending && <p className="alert">This receipt is reserved. Retry the same receipt to resolve an uncertain save. Reopening this client restores it.</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy || policy.loading || !!policy.error}>{busy ? 'Confirming…' : pending ? 'Retry same receipt' : 'Save payment'}</button>
    </form>}
    <button className="btn" disabled={busy} onClick={onClose}>{saved ? 'Done' : 'Close'}</button>
  </Modal>;
}
