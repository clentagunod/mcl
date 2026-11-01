import { useMemo, useState } from 'react';
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

type StatusFilter = LoanStatus | 'all';

/** Due clients first (they need attention), then pending, then paid. */
const STATUS_ORDER: Record<LoanStatus, number> = { due: 0, pending: 1, paid: 2 };

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; client: Client }
  | { type: 'payments'; clientId: string }
  | { type: 'delete'; client: Client }
  | null;

function matchesSearch(row: ClientRow, term: string): boolean {
  if (!term) return true;
  const { client } = row;
  const haystack = `${client.lastName} ${client.firstName} ${client.middleName} ${client.cellphone} ${client.address}`.toLowerCase();
  return haystack.includes(term);
}

export default function ClientsPage() {
  const { rows, loading } = useData();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modal, setModal] = useState<ModalState>(null);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter((row) => (statusFilter === 'all' || row.summary.status === statusFilter) && matchesSearch(row, term))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.summary.status] - STATUS_ORDER[b.summary.status] ||
          formatClientName(a.client).localeCompare(formatClientName(b.client)),
      );
  }, [rows, search, statusFilter]);

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
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search name, number or address"
            aria-label="Search clients"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="due">Due</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
          </select>
          <span className="muted small">
            Showing {visibleRows.length} of {rows.length}
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
                  <th className="num">Outstanding</th>
                  <th>Loan</th>
                  <th>Approved</th>
                  <th>Due date</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(({ client, summary }) => (
                  <tr key={client.id}>
                    <td>
                      <strong>{formatClientName(client)}</strong>
                      <div className="muted small">{client.address}</div>
                    </td>
                    <td>{client.cellphone}</td>
                    <td className="num">{formatPeso(client.principal)}</td>
                    <td className="num">{formatPeso(client.interest)}</td>
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
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'payments', clientId: client.id })}>
                        Payments
                      </button>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', client })}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setModal({ type: 'delete', client })}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal?.type === 'add' && <ClientFormModal onClose={close} />}
      {modal?.type === 'edit' && <ClientFormModal client={modal.client} onClose={close} />}
      {modal?.type === 'payments' && <PaymentsModal clientId={modal.clientId} onClose={close} />}
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
