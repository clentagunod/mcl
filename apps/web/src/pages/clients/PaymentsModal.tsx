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

interface PaymentsModalProps {
  clientId: string;
  onClose: () => void;
}

/** The payment history ("ledger") for one client, with add and delete for corrections. */
export function PaymentsModal({ clientId, onClose }: PaymentsModalProps) {
  const { rows, payments, today } = useData();
  const { user, profile } = useAuth();

  const row = rows.find((candidate) => candidate.client.id === clientId);
  const clientPayments = useMemo(
    () =>
      payments
        .filter((payment) => payment.clientId === clientId)
        .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)),
    [payments, clientId],
  );

  const [values, setValues] = useState<PaymentFormValues>({ amount: '', paymentDate: today });
  const [errors, setErrors] = useState<FieldErrors<PaymentFormValues>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<Payment | null>(null);

  // The client may be deleted while this window is open.
  if (!row || !user) return null;
  const { client, summary } = row;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const result = validatePaymentForm(values, {
      outstanding: summary.outstanding,
      approvalDate: client.approvalDate,
      today,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      await addPayment({
        clientId,
        amount: result.value.amount,
        paymentDate: result.value.paymentDate,
        collectorId: user!.uid,
        collectorName: profile?.fullName || 'Admin (web)',
      });
      setValues({ amount: '', paymentDate: today });
    } catch (caught) {
      setFormError(describeError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Payments — ${formatClientName(client)}`} onClose={onClose} wide>
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

      {summary.outstanding > 0 ? (
        <form onSubmit={handleSubmit} noValidate className="inline-form">
          <FormField label="Amount paid (₱)" error={errors.amount}>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={values.amount}
              onChange={(event) => setValues((previous) => ({ ...previous, amount: event.target.value }))}
            />
          </FormField>
          <FormField label="Payment date" error={errors.paymentDate}>
            <input
              type="date"
              value={values.paymentDate}
              onChange={(event) => setValues((previous) => ({ ...previous, paymentDate: event.target.value }))}
            />
          </FormField>
          <div className="inline-form-submit">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Add payment'}
            </button>
          </div>
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
                <th className="num">Amount</th>
                <th>Collector</th>
                <th>Entered</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clientPayments.map((payment) => (
                <tr key={payment.id}>
                  <td>{formatDate(payment.paymentDate)}</td>
                  <td className="num">{formatPeso(payment.amount)}</td>
                  <td>{payment.collectorName || '—'}</td>
                  <td>{formatDateTime(payment.createdAt)}</td>
                  <td className="actions-col">
                    <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setToDelete(payment)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete payment"
          message={`Delete the ${formatPeso(toDelete.amount)} payment dated ${formatDate(toDelete.paymentDate)}? The client's outstanding balance will go back up by that amount.`}
          confirmLabel="Delete payment"
          danger
          onConfirm={() => deletePayment(toDelete.id)}
          onClose={() => setToDelete(null)}
        />
      )}
    </Modal>
  );
}
