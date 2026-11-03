import { Modal } from '@web/components/Modal';
import { useAuth } from '@web/context/AuthContext';
import { useData } from '@web/context/DataContext';
import { formatPeso } from '@web/lib/money';
import type { Client, Payment } from '@web/types';
import { Notice } from './Status';
import { LoadingState } from './StateMessage';
import { awaitingServer, useConnectivity } from './connectivity';

export function PaymentHistory({ client, onSelect, onClose }: {
  client: Client; onSelect: (payment: Payment) => void; onClose: () => void;
}) {
  const { user } = useAuth();
  const { payments, loading, error } = useData();
  const online = useConnectivity();
  const receipts = payments
    .filter(payment => payment.clientId === client.id && payment.collectorId === user?.uid)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.id.localeCompare(a.id));
  return <Modal title="Payment history" onClose={onClose}>
    <h3>{client.lastName}, {client.firstName}</h3>
    <p className="muted small">Your receipts are preserved across loans. Saved corrections require an administrator.</p>
    {loading && online && <LoadingState text="Loading payment history" />}
    {error && !awaitingServer(error) && <Notice tone="error" title="History couldn't refresh">{error}</Notice>}
    {!loading && !error && !receipts.length && <p>You have no saved payments for this client.</p>}
    {receipts.map(receipt => <div className="receipt-line" key={receipt.id}>
      <span>{receipt.paymentDate} · {formatPeso(receipt.amount)}<small>Loan {receipt.loanId || 'initial'} · {receipt.notes || 'No notes'}</small></span>

    </div>)}
  </Modal>;
}
