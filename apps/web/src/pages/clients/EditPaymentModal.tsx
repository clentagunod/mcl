import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatDate, formatDateTime } from '../../lib/dates';
import { describeError } from '../../lib/errors';
import { isCurrentLoanPayment, loanId } from '../../lib/loan-cycle';
import { formatPeso, round2, sumAmounts } from '../../lib/money';
import { isAdminRole } from '../../lib/roles';
import { validatePaymentForm, type FieldErrors, type PaymentFormValues } from '../../lib/validation';
import { updatePayment } from '../../services/payments';
import type { Payment } from '../../types';

/** Holds the receipt as opened, so live updates cannot replace the expected version. */
export function EditPaymentModal({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const { clients, payments, today, loading, error: dataError } = useData();
  const { profile } = useAuth();
  const [values, setValues] = useState<PaymentFormValues>({ amount: String(payment.amount), paymentDate: payment.paymentDate });
  const [notes, setNotes] = useState(payment.notes || '');
  const [errors, setErrors] = useState<FieldErrors<PaymentFormValues>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const client = clients.find(candidate => candidate.id === payment.clientId);
  const loanChanged = !client || loanId(client) !== (payment.loanId || 'initial');
  const missing = !payments.some(candidate => candidate.id === payment.id);
  const otherReceipts = client ? payments.filter(candidate => candidate.id !== payment.id && isCurrentLoanPayment(client, candidate)) : [];
  const available = client ? round2(client.principal + client.interest - sumAmounts(otherReceipts.map(receipt => receipt.amount))) : 0;
  const maximum = Math.max(payment.amount, available);
  const ready = isAdminRole(profile?.role) && !loading && !dataError && !loanChanged && !missing;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !ready || !client) return;
    setError('');
    const validated = validatePaymentForm(values, { outstanding: maximum, approvalDate: client.approvalDate, today });
    if (!validated.ok) { setErrors(validated.errors); return; }
    if (Number(values.amount) !== validated.value.amount) { setErrors({ amount: 'Use no more than two decimal places.' }); return; }
    setErrors({});
    setBusy(true);
    try {
      await updatePayment(payment.id, { ...validated.value, notes }, payment);
      onClose();
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  }

  return <Modal title="Edit payment" onClose={onClose} dismissible={!busy}>
    <p className="muted small">Receipt {payment.id} · Collected by {payment.collectorName || 'Unknown collector'} · Entered {formatDateTime(payment.createdAt)}</p>
    <p>Correct the amount, collection date or notes. Changes update this client's balance and consolidation immediately.</p>
    <p className="field-hint">Original entry: {formatPeso(payment.amount)} on {formatDate(payment.paymentDate)}. Maximum corrected amount: {formatPeso(maximum)}.</p>
    {available < payment.amount && <p className="field-hint">This loan has excess payments. Reduce this receipt or correct its date and notes to reconcile the history.</p>}
    {dataError && <p className="alert alert-error" role="alert">Payment history could not refresh. {dataError}</p>}
    {loanChanged && <p className="alert alert-error" role="alert">This loan changed. Close and reopen Payments to review the current loan.</p>}
    {missing && <p className="alert alert-error" role="alert">This receipt no longer exists. Close this editor and review the payment history.</p>}
    <form onSubmit={submit} noValidate>
      <div className="form-grid">
        <FormField label="Amount paid (₱)" error={errors.amount}>
          <input type="number" inputMode="decimal" min="0.01" max={maximum} step="0.01" disabled={busy} value={values.amount} onChange={event => setValues(previous => ({ ...previous, amount: event.target.value }))} />
        </FormField>
        <FormField label="Payment date" error={errors.paymentDate}>
          <input type="date" min={client?.approvalDate} max={today} disabled={busy} value={values.paymentDate} onChange={event => setValues(previous => ({ ...previous, paymentDate: event.target.value }))} />
        </FormField>
      </div>
      <FormField label="Notes (optional)" hint="Up to 1,500 characters.">
        <textarea rows={3} maxLength={1500} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} />
      </FormField>
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy || !ready}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  </Modal>;
}
