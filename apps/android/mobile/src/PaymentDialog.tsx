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
import { cycleId, StaleLoanError, PaymentValidationError } from './loanCycle';
export function PaymentDialog({ client, previous, onClose }: { client: Client; previous?: Payment; onClose: () => void }) {
  const { user, profile } = useAuth();
  const { payments, today } = useData();
  const policy = useSettings();
  const key = 'mcl-pending-' + user!.uid + '-' + client.id;
  const [pending, setPending] = useState<{ id: string; input: PaymentInput } | null>(() => {
    if (previous) return null;
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
  });
  const [capturedLoanId] = useState(() => pending ? cycleId(pending.input.loanId) : previous ? cycleId(previous.loanId) : cycleId(client.activeLoanId));
  const [openedClient] = useState(client);
  const cycleChanged = capturedLoanId !== cycleId(client.activeLoanId);
  const [amount, setAmount] = useState(String(previous?.amount ?? pending?.input.amount ?? dailyPayable(client)));
  const [date, setDate] = useState(previous?.paymentDate ?? pending?.input.paymentDate ?? today);
  const [notes, setNotes] = useState(previous?.notes ?? pending?.input.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const entries = indexEntries(openedClient, payments);
  const day = entries.find(e => e.date === date)?.day ?? entries.filter(e => e.date < date).length + 1;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || saved || !user || !profile) return;
    setError('');
    try {
      const attempt = pending ?? { id: previous?.id ?? doc(collection(db, 'payments')).id, input: {
        clientId: client.id, loanId: capturedLoanId, amount: parseAmount(amount), paymentDate: date,
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
      const code = (caught as { code?: string }).code;
      setError(caught instanceof StaleLoanError ? caught.message : code === 'permission-denied'
        ? 'Payment was denied. Your access, loan cycle or minimum policy may have changed. Reopen the form or ask an administrator.'
        : ['unavailable', 'deadline-exceeded', 'aborted'].includes(code ?? '')
        ? 'The server could not confirm this payment. Check your connection and retry the same receipt.'
        : describeError(caught));
      // Only local validation after a server receipt check proves this attempt did not
      // commit. Retain the ID for permissions, transport and unknown failures.
      if (caught instanceof PaymentValidationError) {
        localStorage.removeItem(key);
        setPending(null);
      }
    }
    finally { setBusy(false); }
  }
  return <Modal title={previous ? 'Correct payment' : 'Add payment'} onClose={() => { if (!busy) onClose(); }}>
    <h3>{openedClient.firstName} {openedClient.lastName}</h3>
    <p>Transaction {openedClient.transactionNumber || '—'} · Loan {capturedLoanId}</p>
    {cycleChanged && <p className="alert alert-error" role="alert">This loan changed. Close and reopen the form for the new terms. A reserved receipt may only be retried to check its original submission.</p>}
    {saved ? <p className="alert alert-success" role="status">Payment confirmed by the server.</p> : <form onSubmit={submit}>
      <fieldset disabled={busy || !!pending}>
        <label>Amount collected (₱)<input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Actual collection date<input type="date" required min={openedClient.approvalDate} max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
        <p>Index day {day} · Daily payable {formatPeso(dailyPayable(openedClient))}</p>
        <p className="muted small">Days follow paying dates. Receipts on one date share a day; missed dates leave no gap.</p>
        <label>Notes (optional)<textarea maxLength={1500} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </fieldset>
      {profile?.role === 'collector' && <p>{policy.loading ? 'Checking payment policy…' : policy.settings.payments.enforceDailyMinimum ? 'The daily minimum is required for each receipt.' : 'The daily amount is a suggestion.'}</p>}
      {policy.error && <p role="alert">{policy.error}</p>}
      {pending && <p className="alert">This receipt is reserved. Retry the same receipt to resolve an uncertain save. Reopening this client restores it.</p>}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy || policy.loading || !!policy.error || (cycleChanged && !pending)}>{busy ? 'Confirming…' : pending ? 'Retry same receipt' : 'Save payment'}</button>
    </form>}
    <button className="btn" disabled={busy} onClick={onClose}>{saved ? 'Done' : 'Close'}</button>
  </Modal>;
}
