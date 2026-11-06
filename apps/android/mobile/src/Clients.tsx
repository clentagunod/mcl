import { useDeferredValue, useEffect, useState } from 'react';
import { useSettings } from '@web/context/SettingsContext';
import { useMemo } from 'react';
import { isCurrentLoanPayment } from '@web/lib/loan-cycle';
import { isAdminRole } from '@web/lib/roles';
import { WebIndexCard } from './WebIndexCard';
import { useAuth } from '@web/context/AuthContext';
import { useData } from '@web/context/DataContext';
import { ClientFormModal } from '@web/pages/clients/ClientFormModal';
import { Modal } from '@web/components/Modal';
import { ConfirmDialog } from '@web/components/ConfirmDialog';
import { createTrashAction } from '@web/services/client-trash';
import { deletePayment } from '@web/services/payments';
import { formatPeso } from '@web/lib/money';
import { dailyPayable, publicClientId } from '@web/lib/printables';
import type { Client, Payment } from '@web/types';
import { PaymentDialog } from './PaymentDialog';
import { PaymentHistory } from './PaymentHistory';
import { useConnectivity } from './connectivity';
import { LoadingState } from './StateMessage';
export default function Clients() {
  const { profile } = useAuth();
  const { clients, rows, payments, loading, error } = useData();
  const admin = isAdminRole(profile?.role);
  const online = useConnectivity();
  const [search, setSearch] = useState('');
  const term = useDeferredValue(search.toLocaleLowerCase().trim());
  const [requestedPage, setPage] = useState(0);
  const [edit, setEdit] = useState<Client | 'new' | null>(null);
  const [payment, setPayment] = useState<{ client: Client; previous?: Payment } | null>(null);
  const [card, setCard] = useState<Client | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<Client | null>(null);
  const [remove, setRemove] = useState<{ confirm: () => Promise<void> } | null>(null);
  const matches = useMemo(() => rows.filter(r => [r.client.firstName, r.client.middleName, r.client.lastName, publicClientId(r.client)].join(' ').toLocaleLowerCase().includes(term)), [rows, term]);
  const page = Math.min(requestedPage, Math.max(0, Math.ceil(matches.length / 25) - 1));
  useEffect(() => setPage(page), [page]);
  return <>
    <div className="page-header"><div><h1>{admin ? 'Clients' : 'Collections'}</h1><p className="muted">Live balances and payment history</p></div>{admin && <button className="btn btn-primary" disabled={!online} onClick={() => setEdit('new')}>Add client</button>}</div>
    <label className="search-label">Find a client<input type="search" placeholder="Name or client number" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} /></label>
    {loading && rows.length > 0 && <LoadingState text="Loading remaining records" />}
    <div className="client-list">{matches.slice(page * 25, (page + 1) * 25).map(({ client, summary }) => <article className="card client-card" key={client.id}>
      <div><h2>{client.lastName}, {client.firstName} {client.middleName}</h2><p className="muted small">{publicClientId(client)} · Transaction {client.transactionNumber || '—'}</p></div>
      <div className="balance-line"><span>Outstanding<strong>{formatPeso(summary.outstanding)}</strong></span><span>Daily payable<strong>{formatPeso(dailyPayable(client))}</strong></span></div>
      <div className="client-actions"><button className="btn" title={admin ? 'Edit client' : 'Edit your payments'} onClick={() => admin ? setEdit(client) : setPaymentHistory(client)}>{admin ? 'Edit client' : 'Payment history'}</button><button className="btn btn-primary" disabled={!online || !!error || loading} onClick={() => setPayment({ client })}>Add payment</button><button className="btn" onClick={() => setCard(client)}>Index card</button></div>
      {admin && !(client.renewalCount ?? 0) && <button className="btn btn-small btn-danger-outline" disabled={!online || !!error || loading} onClick={() => setRemove({ confirm: createTrashAction('trash', [{ id: client.id }]) })}>Move to Trash</button>}
      {!admin && <span className="muted small">Saved payment corrections require an administrator.</span>}
    </article>)}</div>
    {!loading && !error && !matches.length && <div className="empty-panel"><strong>{term ? 'No matching clients' : 'No clients yet'}</strong><p>{term ? 'Try another name or client number.' : 'Client records will appear here when they are available.'}</p></div>}
    <div className="pagination"><button className="btn" disabled={!page} onClick={() => setPage(page - 1)}>Previous</button><span>{page + 1} / {Math.max(1, Math.ceil(matches.length / 25))}</span><button className="btn" disabled={(page + 1) * 25 >= matches.length} onClick={() => setPage(page + 1)}>Next</button></div>
    {remove && <ConfirmDialog title="Move to Trash" message="Move this client to Trash? Their payments and renewal history will be kept. You can restore them from Trash in the web app." confirmLabel="Move to Trash" danger onConfirm={remove.confirm} onClose={() => setRemove(null)} />}
    {edit && <ClientFormModal client={edit === 'new' ? undefined : clients.find(c => c.id === edit.id)} onClose={() => setEdit(null)} />}
    {payment && <PaymentDialog client={clients.find(c => c.id === payment.client.id) ?? payment.client} previous={payment.previous} onClose={() => setPayment(null)} />}
    {paymentHistory && <PaymentHistory client={paymentHistory} onClose={() => setPaymentHistory(null)}
      onSelect={previous => { setPaymentHistory(null); setPayment({ client: paymentHistory, previous }); }} />}
    {card && <IndexCard client={clients.find(c => c.id === card.id) ?? card} onClose={() => setCard(null)} onCorrect={previous => { setCard(null); setPayment({ client: card, previous }); }} />}
  </>;
}
function IndexCard({ client, onClose, onCorrect }: { client: Client; onClose: () => void; onCorrect?: (payment: Payment) => void }) {
  const { payments, today } = useData();
  const { profile } = useAuth();
  const admin = isAdminRole(profile?.role);
  const { settings } = useSettings();
  const [remove, setRemove] = useState<Payment | null>(null);
  const receipts = payments.filter(p => p.clientId === client.id).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  return <Modal title="Digital index card" onClose={onClose} wide>
    <WebIndexCard client={client} payments={payments} settings={settings} date={today} />
    <h3>Receipt history</h3><p className="muted small">Live view. Same-date receipts are combined in the numbered card.</p>
    {receipts.map(p => <div className="receipt-line" key={p.id}><span>{p.paymentDate} · {formatPeso(p.amount)}<small>{p.collectorName} · Loan {p.loanId || 'initial'} · {p.notes}</small></span>{onCorrect && admin && isCurrentLoanPayment(client, p) && <div><button className="btn" onClick={() => onCorrect(p)}>Edit payment</button>{admin && <button className="btn btn-danger-outline" onClick={() => setRemove(p)}>Delete</button>}</div>}</div>)}
    {remove && <ConfirmDialog title="Delete receipt" message="Delete this payment? The balance and index days will be recalculated." confirmLabel="Delete receipt" danger onConfirm={() => deletePayment(remove.id, remove)} onClose={() => setRemove(null)} />}
  </Modal>;
}
