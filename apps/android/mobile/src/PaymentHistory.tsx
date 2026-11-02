import { Modal } from '@web/components/Modal';
import { useAuth } from '@web/context/AuthContext';
import { useData } from '@web/context/DataContext';
import { formatPeso } from '@web/lib/money';
import type { Client, Payment } from '@web/types';

export function PaymentHistory({ client, onSelect, onClose }: {
  client: Client; onSelect: (payment: Payment) => void; onClose: () => void;
}) {
  const { user } = useAuth();
  const { payments, loading, error } = useData();
  const receipts = payments
    .filter(payment => payment.clientId === client.id && payment.collectorId === user?.uid)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.id.localeCompare(a.id));
  return <Modal title="Edit payment" onClose={onClose}>
    <h3>{client.lastName}, {client.firstName}</h3>
    <p className="muted small">Choose one of your saved payments to edit its amount, collection date or notes.</p>
    {loading && <p role="status">Loading payments…</p>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {!loading && !error && !receipts.length && <p>You have no saved payments for this client.</p>}
    {receipts.map(receipt => <div className="receipt-line" key={receipt.id}>
      <span>{receipt.paymentDate} · {formatPeso(receipt.amount)}<small>{receipt.notes || 'No notes'}</small></span>
      <button className="btn btn-primary" disabled={loading || !!error} onClick={() => onSelect(receipt)}>Edit</button>
    </div>)}
  </Modal>;
}
