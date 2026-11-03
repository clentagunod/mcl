import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, LoadingState } from '../../components/StateMessage';
import { useData } from '../../context/DataContext';
import { formatDate } from '../../lib/dates';
import { formatClientName, type ClientRow } from '../../lib/loan';
import { formatPeso } from '../../lib/money';
import { deleteClient } from '../../services/clients';
import type { Client, LoanStatus } from '../../types';
import { ClientFormModal } from './ClientFormModal';
import { PaymentsModal } from './PaymentsModal';
import { dailyPayable, publicClientId } from '../../lib/printables';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { renewalEligibility } from '../../lib/renewal';
import { RenewalModal, RenewalHistoryModal } from './RenewalModal';

type StatusFilter = LoanStatus | 'all';

/** Due clients first (they need attention), then pending, then paid. */
const STATUS_ORDER: Record<LoanStatus, number> = { due: 0, pending: 1, paid: 2 };

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; client: Client }
  | { type: 'payments'; clientId: string }
  | { type: 'delete'; client: Client }
  | { type: 'address'; client: Client }
  | { type: 'renew'; clientId: string }
  | { type: 'renewal-history'; clientId: string }
  | null;

function matchesSearch(row: ClientRow, term: string): boolean {
  if (!term) return true;
  const { client } = row;
  const haystack = `${client.lastName} ${client.firstName} ${client.middleName} ${client.cellphone} ${client.address} ${publicClientId(client)} ${client.transactionNumber ?? ''}`.toLowerCase();
  return haystack.includes(term);
}

export default function ClientsPage() {
  const { rows, payments, holidays, today, loading, error } = useData();
  const { profile } = useAuth();
  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [pageSize, setPageSize] = useState(25);
  const [requestedPage, setRequestedPage] = useState(1);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => (statusFilter === 'all' || row.summary.status === statusFilter) && matchesSearch(row, term))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.summary.status] - STATUS_ORDER[b.summary.status] ||
          formatClientName(a.client).localeCompare(formatClientName(b.client)) || a.client.id.localeCompare(b.client.id),
      );
  }, [rows, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const pageRows = visibleRows.slice(start, start + pageSize);
  const pageNumbers = [...new Set([1, pageCount, ...Array.from({ length: 5 }, (_, i) => page + i - 2)])]
    .filter((number) => number >= 1 && number <= pageCount).sort((a, b) => a - b);

  // Live deletions or status changes can remove the last page.
  useEffect(() => setRequestedPage((current) => Math.min(current, pageCount)), [pageCount]);

  if (loading) return <LoadingState />;

  const close = () => setModal(null);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Loans, outstanding balances and status. Balances update live as collectors enter payments."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
            + Add client
          </button>
        }
      />

      <section className="card">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search name, number or address"
            aria-label="Search clients"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setRequestedPage(1); }}
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setRequestedPage(1); }}
          >
            <option value="all">All statuses</option>
            <option value="due">Due</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
          <span className="muted small">
            {visibleRows.length} matching clients · {rows.length} total
          </span>
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState>
            {rows.length === 0 ? 'No clients yet. Click “Add client” to create the first one.' : 'No clients match your search.'}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Cellphone</th>
                  <th className="num">Principal</th>
                  <th className="num">Interest</th>
                  <th className="num">Daily payable</th>
                  <th className="num">Outstanding</th>
                  <th>Loan</th>
                  <th>Approved</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ client, summary }) => (
                  <tr key={client.id}>
                    <td>
                      <strong>{formatClientName(client)}</strong>
                      <button type="button" className="client-address muted small" title={client.address} aria-label={`View full address for ${formatClientName(client)}`} onClick={() => setModal({ type: 'address', client })}>{client.address}</button>
                      <div className="muted small">{publicClientId(client)} · Txn {client.transactionNumber || 'Pending'}</div>
                      {!!client.renewalCount && profile?.role === 'admin' && <button type="button" className="renewal-tag" onClick={() => setModal({ type: 'renewal-history', clientId: client.id })}>Renewal history · {client.renewalCount}</button>}
                    </td>
                    <td>{client.cellphone}</td>
                    <td className="num">{formatPeso(client.principal)}</td>
                    <td className="num">{formatPeso(client.interest)}</td>
                    <td className="num">{formatPeso(dailyPayable(client))}</td>
                    <td className="num">
                      <strong>{formatPeso(summary.outstanding)}</strong>
                    </td>
                    <td>
                      {client.loanTermDays} days
                      <div className="muted small">
                        Day {summary.daysElapsed} of {client.loanTermDays}
                      </div>
                    </td>
                    <td>{formatDate(client.approvalDate)}</td>
                    <td>{formatDate(summary.dueDate)}</td>
                    <td>
                      <StatusBadge status={summary.status} />
                    </td>
                    <td className="actions-col">
                      {summary.status === 'paid' && profile?.role === 'admin' && (() => {
                        const eligibility = renewalEligibility(client, payments, holidayDates, today);
                        return <button type="button" className="btn btn-small btn-primary" disabled={!eligibility.eligible || !!error || !client.transactionNumber} title={eligibility.reason} onClick={() => setModal({ type: 'renew', clientId: client.id })}>Renew</button>;
                      })()}{' '}
                      <Link className="btn btn-small" to={`/printables?client=${encodeURIComponent(client.id)}`}>Print</Link>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'payments', clientId: client.id })}>
                        Payments
                      </button>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', client })}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn btn-small btn-danger-outline" disabled={!!client.renewalCount} title={client.renewalCount ? 'Clients with renewal history are retained for audit.' : undefined} onClick={() => setModal({ type: 'delete', client })}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <nav className="client-pagination" aria-label="Clients pagination">
          <div className="pagination-summary">
            <span className="muted small" role="status">Showing {visibleRows.length ? start + 1 : 0}–{Math.min(start + pageSize, visibleRows.length)} of {visibleRows.length} clients</span>
            <label className="pagination-size">Rows per page<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setRequestedPage(1); }}>
              {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select></label>
          </div>
          <div className="pagination-buttons">
            <button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setRequestedPage(1)}>First</button>
            <button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}>Previous</button>
            {pageNumbers.map((number, index) => <span className="pagination-page" key={number}>
              {index > 0 && number > pageNumbers[index - 1] + 1 && <span className="muted" aria-hidden="true">…</span>}
              <button type="button" className={number === page ? 'btn btn-small btn-primary' : 'btn btn-small'} aria-label={`Go to page ${number}`} aria-current={number === page ? 'page' : undefined} onClick={() => setRequestedPage(number)}>{number}</button>
            </span>)}
            <button type="button" className="btn btn-small" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Next</button>
            <button type="button" className="btn btn-small" disabled={page === pageCount} onClick={() => setRequestedPage(pageCount)}>Last</button>
          </div>
        </nav>
      </section>

      {modal?.type === 'add' && <ClientFormModal onClose={close} />}
      {modal?.type === 'edit' && <ClientFormModal client={modal.client} onClose={close} />}
      {modal?.type === 'payments' && <PaymentsModal clientId={modal.clientId} onClose={close} />}
      {modal?.type === 'renew' && <RenewalModal clientId={modal.clientId} onClose={close} />}
      {modal?.type === 'renewal-history' && <RenewalHistoryModal clientId={modal.clientId} onClose={close} />}
      {modal?.type === 'address' && <Modal title={`Address — ${formatClientName(modal.client)}`} onClose={close}>
        <p className="address-full">{modal.client.address}</p><button type="button" className="btn" onClick={close}>Close</button>
      </Modal>}
      {modal?.type === 'delete' && (
        <ConfirmDialog
          title="Delete client"
          message={`Permanently delete ${formatClientName(modal.client)} and ALL of their payment records? This cannot be undone.`}
          confirmLabel="Delete client"
          danger
          onConfirm={() => deleteClient(modal.client.id)}
          onClose={close}
        />
      )}
    </>
  );
}
