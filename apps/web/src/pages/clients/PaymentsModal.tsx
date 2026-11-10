import { useMemo, useState, type FormEvent } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormField } from '../../components/FormField';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { formatDate, formatDateTime } from '../../lib/dates';
import { describeError } from '../../lib/errors';
import { formatClientName } from '../../lib/loan';
import { formatPeso } from '../../lib/money';
import { validatePaymentForm, type FieldErrors, type PaymentFormValues } from '../../lib/validation';
import { addPayment, deletePayment } from '../../services/payments';
import type { Payment } from '../../types';
import { useSettings } from '../../context/SettingsContext';
import { dailyPayable, indexEntries, publicClientId } from '../../lib/printables';
import { collectorMinimum } from '../../lib/payment-policy';
import { isCurrentLoanPayment, loanId } from '../../lib/loan-cycle';
import { collection, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { restorePendingReceipt, type PendingReceipt } from '../../lib/pending-receipt';
import { isAdminRole } from '../../lib/roles';
import { EditPaymentModal } from './EditPaymentModal';

interface PaymentsModalProps {
  clientId: string;
  onClose: () => void;
}

/** The payment history ("ledger") for one client, with administrator corrections. */
export function PaymentsModal({ clientId, onClose }: PaymentsModalProps) {
  const { rows, payments, today, loading: dataLoading, error: dataError } = useData();
  const { user, profile } = useAuth();
  const pendingKey = `mcl-pending-${user?.uid}-${clientId}`;
  const [restored] = useState(() => user ? restorePendingReceipt(() => localStorage, pendingKey, user.uid, clientId) : { pending: null, error: null });
  const [pending, setPending] = useState<PendingReceipt | null>(restored.pending);
  const { settings, loading: policyLoading, error: policyError } = useSettings();
  const [notes, setNotes] = useState(restored.pending?.input.notes ?? '');

  const row = rows.find((candidate) => candidate.client.id === clientId);
  const [openedLoanId] = useState(() => row ? loanId(row.client) : null);
  const clientPayments = useMemo(
    () =>
      payments
        .filter((payment) => row && isCurrentLoanPayment(row.client, payment))
        .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
    [payments, clientId, row],
  );

  const [values, setValues] = useState<PaymentFormValues>({ amount: restored.pending ? String(restored.pending.input.amount) : '', paymentDate: restored.pending?.input.paymentDate ?? today });
  const [errors, setErrors] = useState<FieldErrors<PaymentFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Payment | null>(null);
  const [toEdit, setToEdit] = useState<Payment | null>(null);
  const [requestedHistoryPage, setHistoryPage] = useState(0);
  const historyPage = Math.min(requestedHistoryPage, Math.max(0, Math.ceil(clientPayments.length / 25) - 1));
  const indexDays = useMemo(() => new Map(row ? indexEntries(row.client, clientPayments).map((entry) => [entry.date, entry.day]) : []), [row, clientPayments]);

  // The client may be deleted while this window is open.
  if (!row || !user) return null;
  const { client, summary } = row;
  const loanChanged = loanId(client) !== openedLoanId;
  const minimumAmount = collectorMinimum(client, settings.payments.enforceDailyMinimum, profile?.role);
  const policyBlocksEntry = profile?.role === 'collector' && (policyLoading || !!policyError);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || restored.error || dataLoading || dataError || policyBlocksEntry || (loanChanged && !pending)) return;
    setFormError(null);

    const result = pending ? { ok: true as const, value: pending.input } : validatePaymentForm(values, {
      outstanding: summary.outstanding,
      approvalDate: client.approvalDate,
      today,
      minimumAmount,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      const attempt: PendingReceipt = pending ?? { version: 1, id: doc(collection(db, 'payments')).id, input: {
        clientId,
        loanId: loanId(client),
        amount: result.value.amount,
        paymentDate: result.value.paymentDate,
        collectorId: user!.uid,
        collectorName: profile?.fullName || 'Admin (web)',
        notes: notes.trim() || settings.general.defaultPaymentNote,
      } };
      // Keep this exact ID/payload through modal closure, reload, and uncertain acknowledgements.
      localStorage.setItem(pendingKey, JSON.stringify(attempt));
      setPending(attempt);
      await addPayment(attempt.input, attempt.id);
      localStorage.removeItem(pendingKey);
      setPending(null);
      setValues({ amount: '', paymentDate: today });
      setNotes('');
    } catch (caught) {
      setFormError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Payments — ${formatClientName(client)}`} onClose={onClose} wide>
      {dataError && <p className="alert alert-error" role="alert">{dataError}</p>}
      {restored.error && <p className="alert alert-error" role="alert">{restored.error}</p>}
      {pending && <p className="alert" role="status">A receipt is reserved. Retry the same receipt to confirm its original submission.</p>}
      <p className="muted small">{publicClientId(client)} · Transaction {client.transactionNumber || 'Pending'} · Daily payable {formatPeso(dailyPayable(client))}</p>
      <p className="field-hint">{policyError || policyLoading ? 'The collector policy is being checked or is unavailable. Administrator entries remain available for corrections and settlements.' : settings.payments.enforceDailyMinimum ? profile?.role === 'collector' ? `Collector minimum per receipt: ${formatPeso(minimumAmount)}.` : 'Collector daily minimum is enabled. Administrator entries can record partial payments and final settlements below the minimum.' : 'Daily payable is information only; payments below or above it are allowed within the outstanding balance.'}</p>
      {policyError && <p className="alert alert-error" role="alert">Payment policy could not be loaded. {policyError}</p>}
      <dl className="summary-grid">
        <div>
          <dt>Principal</dt>
          <dd>{formatPeso(client.principal)}</dd>
        </div>
        <div>
          <dt>Fixed interest</dt>
          <dd>{formatPeso(client.interest)}</dd>
        </div>
        <div>
          <dt>Total paid</dt>
          <dd>{formatPeso(summary.totalPaid)}</dd>
        </div>
        <div>
          <dt>Outstanding</dt>
          <dd>{formatPeso(summary.outstanding)}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{formatDate(summary.dueDate)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <StatusBadge status={summary.status} />
          </dd>
        </div>
      </dl>

      {loanChanged && !pending ? <p className="alert alert-error" role="alert">This client was renewed in another session. Close and reopen Payments to enter a receipt for the new loan.</p> : summary.outstanding > 0 || pending ? (
        <form onSubmit={handleSubmit} noValidate className="inline-form">
          <FormField label="Amount paid (₱)" error={errors.amount}>
            <input
              type="number"
              inputMode="decimal"
              min={minimumAmount || '0.01'}
              step="0.01"
              disabled={busy || !!pending || !!restored.error}
              value={values.amount}
              onChange={(event) => setValues((previous) => ({ ...previous, amount: event.target.value }))}
            />
          </FormField>
          <FormField label="Payment date" error={errors.paymentDate}>
            <input
              type="date"
              disabled={busy || !!pending || !!restored.error}
              value={values.paymentDate}
              onChange={(event) => setValues((previous) => ({ ...previous, paymentDate: event.target.value }))}
            />
          </FormField>
          <div className="inline-form-submit">
            <button type="submit" className="btn btn-primary" disabled={busy || !!restored.error || dataLoading || !!dataError || policyBlocksEntry}>
              {busy ? 'Saving…' : pending ? 'Retry same receipt' : 'Add payment'}
            </button>
          </div>
          <FormField label="Notes (optional)"><input disabled={busy || !!pending || !!restored.error} value={notes} maxLength={500} placeholder={settings.general.defaultPaymentNote} onChange={(event) => setNotes(event.target.value)} /></FormField>
        </form>
      ) : (
        <p className="alert alert-success">This loan is fully paid.</p>
      )}
      {formError && (
        <p className="alert alert-error" role="alert">
          {formError}
        </p>
      )}

      <h3>History</h3>
      {clientPayments.length === 0 ? (
        <p className="state">No payments recorded yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Payment date</th>
                <th>Index day</th>
                <th className="num">Amount</th>
                <th>Collector</th>
                <th>Notes</th>
                <th>Entered</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientPayments.slice(historyPage * 25, (historyPage + 1) * 25).map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.paymentDate)}</td>
                  <td>{indexDays.get(payment.paymentDate) ?? '—'}</td>
                  <td className="num">{formatPeso(payment.amount)}</td>
                  <td>{payment.collectorName || '—'}</td>
                  <td>{payment.notes || settings.general.defaultPaymentNote}</td>
                  <td>{formatDateTime(payment.createdAt)}</td>
                  <td className="actions-col">
                    {isAdminRole(profile?.role) && <button type="button" className="btn btn-small" disabled={busy || !!pending || !!restored.error || dataLoading || !!dataError || loanChanged || !payment.createdAt} onClick={() => setToEdit(payment)}>
                      Edit
                    </button>}
                    <button type="button" className="btn btn-small btn-danger-outline" disabled={busy || !!pending || !!restored.error || dataLoading || !!dataError || loanChanged} onClick={() => setToDelete(payment)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {clientPayments.length > 25 && <nav className="pagination" aria-label="Payment history pagination">
        <button className="btn btn-small" disabled={historyPage === 0} onClick={() => setHistoryPage(historyPage - 1)}>Previous receipts</button>
        <span>Page {historyPage + 1} of {Math.ceil(clientPayments.length / 25)} · {clientPayments.length} receipts</span>
        <button className="btn btn-small" disabled={(historyPage + 1) * 25 >= clientPayments.length} onClick={() => setHistoryPage(historyPage + 1)}>Next receipts</button>
      </nav>}

      {toEdit && <EditPaymentModal payment={toEdit} onClose={() => setToEdit(null)} />}

      {toDelete && (
        <ConfirmDialog
          title="Delete payment"
          message={`Delete the ${formatPeso(toDelete.amount)} payment dated ${formatDate(toDelete.paymentDate)}? The client's outstanding balance will go back up by that amount.`}
          confirmLabel="Delete payment"
          danger
          onConfirm={() => deletePayment(toDelete.id, toDelete)}
          onClose={() => setToDelete(null)}
        />
      )}
    </Modal>
  );
}
