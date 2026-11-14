import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState, LoadingState } from '../../components/StateMessage';
import { useData } from '../../context/DataContext';
import { formatDate } from '../../lib/dates';
import { formatClientName, type ClientRow } from '../../lib/loan';
import { formatPeso } from '../../lib/money';
import { createTrashAction } from '../../services/client-trash';
import { useClientSelection } from '../../hooks/useClientSelection';
import { SelectionCheckbox } from '../../components/SelectionCheckbox';
import type { Client, LoanStatus } from '../../types';
import { ClientFormModal } from './ClientFormModal';
import { PaymentsModal } from './PaymentsModal';
import { dailyPayable, publicClientId } from '../../lib/printables';
import { Link } from 'react-router-dom';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { renewalEligibility } from '../../lib/renewal';
import { isAdminRole } from '../../lib/roles';
import { RenewalModal, RenewalHistoryModal } from './RenewalModal';
import { Icon } from '../../components/Icon';
import './clients.css';

type StatusFilter = LoanStatus | 'all';

/** Due clients first (they need attention), then pending, then paid. */
const STATUS_ORDER: Record<LoanStatus, number> = { due: 0, pending: 1, paid: 2 };

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; client: Client }
  | { type: 'payments'; clientId: string }
  | { type: 'delete'; count: number; name?: string; confirm: () => Promise<void> }
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
  const { settings } = useSettings();
  const holidayDates = useMemo(() => new Set(holidays.map((h) => h.date)), [holidays]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [modal, setModal] = useState<ModalState>(null);
  const [pageSize, setPageSize] = useState(25);
  const [requestedPage, setRequestedPage] = useState(1);
  const clientIds = useMemo(() => rows.map(row => row.client.id), [rows]);
  const selection = useClientSelection(clientIds);

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
  const confirmTrash = (ids: string[], name?: string) => {
    const action = createTrashAction('trash', ids.map(id => ({ id })));
    setModal({ type: 'delete', count: ids.length, name, confirm: async () => { await action(); selection.clear(); } });
  };

  return (
    <>
      <PageHeader
        title="Clients"
        description="Loans, outstanding balances and status. Balances update live as collectors enter payments."
        actions={
          <div className="selection-actions">
            <Link className="btn" to="/trash"><Icon name="trash" size={15} />Trash</Link>
            <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
              <Icon name="plus" size={16} /> Add client
            </button>
          </div>
        }
      />

      <section className="card clients-directory" aria-label="Client directory">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <div className="toolbar clients-toolbar">
          <div className="clients-search"><Icon name="search" size={17} />
          <input
            type="search"
            placeholder="Search name, number or address"
            aria-label="Search clients"
            value={search}
            onChange={(event) => { setSearch(event.target.value); setRequestedPage(1); selection.clear(); }}
          />
          </div>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setRequestedPage(1); selection.clear(); }}
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

        <div className="bulk-actions" aria-label="Client selection">
          <span role="status">{selection.selectedIds.length} selected</span>
          <button type="button" className="btn btn-small" disabled={!visibleRows.length} onClick={() => selection.selectAll(visibleRows.map(row => row.client.id))}>Select all {visibleRows.length} matching</button>
          <button type="button" className="btn btn-small" disabled={!selection.selectedIds.length} onClick={selection.clear}>Clear selection</button>
          <button type="button" className="btn btn-small btn-danger-outline" disabled={!selection.selectedIds.length || !!error} onClick={() => confirmTrash(selection.selectedIds)}>Move selected to Trash</button>
        </div>

        {visibleRows.length === 0 ? (
          <EmptyState>
            {rows.length === 0 ? 'No clients yet. Click “Add client” to create the first one.' : 'No clients match your search.'}
          </EmptyState>
        ) : (
          <div className="table-wrap clients-table-wrap" tabIndex={0} aria-label="Client records">
            <table className="clients-table">
              <colgroup><col className="client-select-col" /><col className="client-identity-col" /><col className="client-loan-col" /><col className="client-balance-col" /><col className="client-schedule-col" /><col className="client-status-col" /><col className="client-actions-col" /></colgroup>
              <thead>
                <tr>
                  <th className="selection-col"><SelectionCheckbox label="Select clients on this page" checked={pageRows.length > 0 && pageRows.every(row => selection.selected.has(row.client.id))} mixed={pageRows.some(row => selection.selected.has(row.client.id)) && !pageRows.every(row => selection.selected.has(row.client.id))} onChange={() => selection.togglePage(pageRows.map(row => row.client.id))} /></th>
                  <th>Client</th>
                  <th className="num">Loan amount</th>
                  <th className="num">Balance</th>
                  <th>Schedule</th>
                  <th>Status</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map(({ client, summary }) => (
                  <tr key={client.id} className={selection.selected.has(client.id) ? 'row-selected' : undefined}>
                    <td className="selection-col"><SelectionCheckbox label={`Select ${formatClientName(client)}`} checked={selection.selected.has(client.id)} onChange={() => selection.toggle(client.id)} /></td>
                    <td className="client-identity">
                      <strong title={formatClientName(client)}>{formatClientName(client)}</strong>
                      <div className="client-contact"><span>{client.cellphone || 'N/A'}</span><button type="button" className="client-address-link" title={client.address} aria-label={`View full address for ${formatClientName(client)}`} onClick={() => setModal({ type: 'address', client })}><Icon name="info" size={13} />Address</button></div>
                      <div className="muted small">{publicClientId(client)} · Txn {client.transactionNumber || 'Pending'}</div>
                      {!!client.renewalCount && isAdminRole(profile?.role) && <button type="button" className="renewal-tag" onClick={() => setModal({ type: 'renewal-history', clientId: client.id })}>Renewal history · {client.renewalCount}</button>}
                    </td>
                    <td className="num"><strong>{formatPeso(client.principal)}</strong><span className="client-cell-detail">+ {formatPeso(client.interest)} interest</span></td>
                    <td className="num">
                      <strong>{formatPeso(summary.outstanding)}</strong>
                      <span className="client-cell-detail">{formatPeso(dailyPayable(client))} / day</span>
                    </td>
                    <td className="client-schedule">
                      <strong>Due {formatDate(summary.dueDate)}</strong>
                      <span className="client-cell-detail">Approved {formatDate(client.approvalDate)}</span>
                      <span className="client-cell-detail">Day {summary.daysElapsed} of {client.loanTermDays}</span>
                    </td>
                    <td>
                      <StatusBadge status={summary.status} />
                    </td>
                    <td className="actions-col"><div className="client-row-actions">
                      {summary.status === 'paid' && isAdminRole(profile?.role) && (() => {
                        const eligibility = renewalEligibility(client, payments, holidayDates, today, settings.schedule.skipSundays);
                        return <button type="button" className="btn btn-small btn-primary" disabled={!eligibility.eligible || !!error || !client.transactionNumber} title={eligibility.reason} onClick={() => setModal({ type: 'renew', clientId: client.id })}>Renew</button>;
                      })()}{' '}
                      <Link className="btn btn-small" to={`/print-studio?client=${encodeURIComponent(client.id)}`} target="_blank" rel="noopener noreferrer" title="Open this client's documents in a separate printing tab"><Icon name="print" size={13} />Print</Link>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'payments', clientId: client.id })}>
                        <Icon name="wallet" size={13} />Payments
                      </button>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', client })}>
                        <Icon name="file" size={13} />Edit
                      </button>{' '}
                      <button type="button" className="btn btn-small btn-danger-outline" disabled={!!error} onClick={() => confirmTrash([client.id], formatClientName(client))}>
                        <Icon name="trash" size={13} />Delete
                      </button>
                    </div></td>
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
          title="Move to Trash"
          message={`Move ${modal.name || `${modal.count} selected clients`} to Trash? They will leave the active client list and reports. Their payments and renewal history will be kept so you can restore them from Trash.`}
          confirmLabel="Move to Trash"
          danger
          onConfirm={modal.confirm}
          onClose={close}
        />
      )}
    </>
  );
}
