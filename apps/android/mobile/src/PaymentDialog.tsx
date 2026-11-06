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
import type { Client, Payment } from '@web/types';
import { parseAmount, saveReceipt } from './payments';
import { cycleId, StaleLoanError, PaymentValidationError } from './loanCycle';
import { restorePendingReceipt, type PendingReceipt } from '@web/lib/pending-receipt';
import { Notice } from './Status';
import { networkOnline, useConnectivity } from './connectivity';
export function PaymentDialog({ client, previous, onClose }: { client: Client; previous?: Payment; onClose: () => void }) {
  const { user, profile } = useAuth();
  const { payments, today } = useData();
  const policy = useSettings();
  const online = useConnectivity();
  const key = 'mcl-pending-' + user!.uid + '-' + client.id;
  const [restored] = useState(() => previous ? { pending: null, error: null } : restorePendingReceipt(() => localStorage, key, user!.uid, client.id));
  const [pending, setPending] = useState<PendingReceipt | null>(restored.pending);
  const [capturedLoanId] = useState(() => pending ? cycleId(pending.input.loanId) : previous ? cycleId(previous.loanId) : cycleId(client.activeLoanId));
  const [openedClient] = useState(client);
  const cycleChanged = capturedLoanId !== cycleId(client.activeLoanId);
  const [amount, setAmount] = useState(String(previous?.amount ?? pending?.input.amount ?? dailyPayable(client)));
  const [date, setDate] = useState(previous?.paymentDate ?? pending?.input.paymentDate ?? today);
  const [notes, setNotes] = useState(previous?.notes ?? pending?.input.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [correctionId] = useState(() => doc(collection(db, 'payments')).id);
  const entries = indexEntries(openedClient, payments);
  const day = entries.find(e => e.date === date)?.day ?? entries.filter(e => e.date < date).length + 1;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || saved || restored.error || !user || !profile || !networkOnline()) return;
    setError('');
    try {
      const attempt: PendingReceipt = pending ?? { version: 1, id: previous?.id ?? doc(collection(db, 'payments')).id, input: {
        clientId: client.id, loanId: capturedLoanId, amount: parseAmount(amount), paymentDate: date,
        collectorId: user.uid, collectorName: profile.fullName, notes: notes.trim(),
      } };
      if (!previous) {
        localStorage.setItem(key, JSON.stringify(attempt));
        setPending(attempt);
      }
      setBusy(true);
      await saveReceipt(attempt.id, attempt.input, previous, previous ? correctionId : attempt.id);
      if (!previous) localStorage.removeItem(key);
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
      if (!previous && caught instanceof PaymentValidationError) {
        localStorage.removeItem(key);
        setPending(null);
      }
    }
    finally { setBusy(false); }
  }
  return <Modal title={previous ? 'Correct payment' : 'Add payment'} onClose={() => { if (!busy) onClose(); }}>
    <h3>{openedClient.firstName} {openedClient.lastName}</h3>
    <p>Transaction {openedClient.transactionNumber || '—'} · Loan {capturedLoanId}</p>
    {cycleChanged && <Notice tone="warning" title="This loan has changed">Close and reopen the form for the new terms. A reserved receipt may only be retried to check its original submission.</Notice>}
    {saved ? <Notice tone="success" title="Payment confirmed">The server confirmed this payment. You can safely close this form.</Notice> : <form onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy || !!pending || !!restored.error}>
        <label>Amount collected (₱)<input inputMode="decimal" required value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label>Actual collection date<input type="date" required min={openedClient.approvalDate} max={today} value={date} onChange={e => setDate(e.target.value)} /></label>
        <p>Index day {day} · Daily payable {formatPeso(dailyPayable(openedClient))}</p>
        <p className="muted small">Days follow paying dates. Receipts on one date share a day; missed dates leave no gap.</p>
        <label>Notes (optional)<textarea maxLength={1500} value={notes} onChange={e => setNotes(e.target.value)} /></label>
      </fieldset>
      {policy.loading && online && <Notice tone="loading" title="Checking payment policy">Please wait before submitting this payment.</Notice>}
      {profile?.role === 'collector' && !policy.loading && <p className="payment-policy">{policy.settings.payments.enforceDailyMinimum ? 'The daily minimum is required for each receipt.' : 'The daily amount is a suggestion.'}</p>}
      {policy.error && <Notice tone="error" title="Payment policy unavailable">{policy.error}</Notice>}
      {busy && <Notice tone="loading" title={online ? 'Confirming payment' : 'Waiting for confirmation'}>Please wait for the server response. Keep this form open; do not record the payment again.</Notice>}
      {pending && !busy && <Notice tone="warning" title="Receipt awaiting confirmation">This receipt is reserved. Retry the same receipt to resolve an uncertain save. Reopening this client restores it.</Notice>}
      {restored.error && <Notice tone="error" title="Receipt needs reconciliation">{restored.error}</Notice>}
      {error && <Notice tone="error" title="Payment wasn't confirmed">{error}</Notice>}
      <button className="btn btn-primary" disabled={!online || busy || !!restored.error || policy.loading || !!policy.error || (cycleChanged && !pending)}>{busy ? 'Confirming…' : pending ? 'Retry same receipt' : 'Save payment'}</button>
    </form>}
    <button className="btn" disabled={busy} onClick={onClose}>{saved ? 'Done' : 'Close'}</button>
  </Modal>;
}
