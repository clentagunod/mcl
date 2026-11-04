import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { SelectionCheckbox } from '../../components/SelectionCheckbox';
import { EmptyState, LoadingState } from '../../components/StateMessage';
import { useClientSelection } from '../../hooks/useClientSelection';
import { useSubscription } from '../../hooks/useSubscription';
import { useSettings } from '../../context/SettingsContext';
import { formatClientName } from '../../lib/loan';
import { publicClientId } from '../../lib/printables';
import { createTrashAction, subscribeClientTrash, type TrashedClient } from '../../services/client-trash';
import '../workspace-tools.css';

type Confirmation = { operation: 'restore' | 'purge'; count: number; name?: string; confirm: () => Promise<void> };
const dateFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

export default function TrashPage() {
  return <TrashContent {...useSubscription(subscribeClientTrash)} />;
}

export function TrashContent({ data, loading, error, fresh }: {
  data: TrashedClient[]; loading: boolean; error: string | null; fresh: boolean;
}) {
  const { settings } = useSettings();
  const [search, setSearch] = useState('');
  const [requestedPage, setRequestedPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'trashed' | 'purging'>('all');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const ids = useMemo(() => data.map(entry => entry.id), [data]);
  const selection = useClientSelection(ids);
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.filter(({ client, status }) => (filter === 'all' || status === filter) && `${formatClientName(client)} ${publicClientId(client)} ${client.transactionNumber || ''} ${client.address} ${client.cellphone}`.toLowerCase().includes(term))
      .sort((a, b) => (b.deletedAt?.getTime() || 0) - (a.deletedAt?.getTime() || 0) || a.id.localeCompare(b.id));
  }, [data, search, filter]);
  const pageCount = Math.max(1, Math.ceil(matches.length / 25));
  const page = Math.min(requestedPage, pageCount);
  const pageRows = matches.slice((page - 1) * 25, page * 25);
  const selectedEntries = data.filter(entry => selection.selected.has(entry.id));
  const blocked = !!error || !fresh;
  useEffect(() => setRequestedPage(current => Math.min(current, pageCount)), [pageCount]);

  const confirm = (operation: 'restore' | 'purge', entries: TrashedClient[], name?: string) => {
    const action = createTrashAction(operation, entries.map(({ id, trashId }) => ({ id, trashId })));
    setConfirmation({ operation, count: entries.length, name, confirm: async () => { await action(); selection.clear(); } });
  };
  if (loading) return <LoadingState />;
  return <>
    <PageHeader title="Trash" description={settings.trash.autoDeleteDays === 0
      ? 'Restore deleted clients or permanently remove them. Automatic deletion is turned off.'
      : `Clients are permanently deleted after ${settings.trash.autoDeleteDays} days in Trash while an administrator has the web app open, including their payments and renewal history.`}
      actions={<Link className="btn" to="/clients"><Icon name="chevron-left" />Back to clients</Link>} />
    <div className="tools-summary-grid trash-summary">
      <div className="tools-summary-item"><span className="tools-summary-icon"><Icon name="trash" /></span><div><span className="muted small">Clients in Trash</span><strong>{data.length}</strong></div></div>
      <div className="tools-summary-item"><span className="tools-summary-icon"><Icon name="restore" /></span><div><span className="muted small">Available to restore</span><strong>{data.filter(entry => entry.status === 'trashed').length}</strong></div></div>
      <div className="tools-summary-item tools-summary-detail"><span className="tools-summary-icon"><Icon name="clock" /></span><div><span className="muted small">Automatic deletion</span><strong>{settings.trash.autoDeleteDays === 0 ? 'Turned off' : `After ${settings.trash.autoDeleteDays} days`}</strong><Link to="/settings#settings-trash">Manage retention <Icon name="arrow-up-right" /></Link></div></div>
    </div>
    <div className="trash-recovery-note"><Icon name="info" /><p><strong>Your recovery space.</strong> Restoring a client brings back their original details, payments and renewal history. Permanent deletion removes those records for good.</p></div>
    <section className="card trash-list">
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      {!fresh && !error && <p className="alert alert-warning" role="status">Waiting for server confirmation. Connect to the internet to manage Trash.</p>}
      <div className="tools-section-heading"><div><h2>Deleted clients</h2><p className="muted small">Review a record before restoring or removing it.</p></div><div className="tools-filter-pills" aria-label="Trash status filter">{(['all', 'trashed', 'purging'] as const).map(value => <button key={value} type="button" className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => { setFilter(value); setRequestedPage(1); selection.clear(); }}>{value === 'all' ? 'All clients' : value === 'trashed' ? 'Recoverable' : 'Deletion started'}</button>)}</div></div>
      <div className="toolbar trash-toolbar">
        <label className="tools-search"><Icon name="search" /><input type="search" aria-label="Search trash" placeholder="Search deleted clients" value={search} onChange={event => { setSearch(event.target.value); setRequestedPage(1); selection.clear(); }} /></label>
        <span className="muted small">{matches.length} matching clients · {data.length} in Trash</span>
      </div>
      <div className="bulk-actions" aria-label="Trash selection">
        <span className="tools-selection-count" role="status">{selection.selectedIds.length} selected</span>
        <button type="button" className="btn btn-small" disabled={!matches.length} onClick={() => selection.selectAll(matches.map(entry => entry.id))}>Select all {matches.length} matching</button>
        <button type="button" className="btn btn-small" disabled={!selectedEntries.length} onClick={selection.clear}>Clear selection</button>
        <button type="button" className="btn btn-small" disabled={blocked || !selectedEntries.length || selectedEntries.some(entry => entry.status === 'purging')} onClick={() => confirm('restore', selectedEntries)}><Icon name="restore" />Restore selected</button>
        <button type="button" className="btn btn-small btn-danger-outline" disabled={blocked || !selectedEntries.length} onClick={() => confirm('purge', selectedEntries)}><Icon name="trash" />Permanently delete selected</button>
      </div>
      {matches.length === 0 ? <EmptyState>{data.length ? 'No deleted clients match your search.' : 'Trash is empty.'}</EmptyState> : <div className="table-wrap"><table>
        <thead><tr>
          <th className="selection-col"><SelectionCheckbox label="Select trashed clients on this page" checked={pageRows.length > 0 && pageRows.every(entry => selection.selected.has(entry.id))} mixed={pageRows.some(entry => selection.selected.has(entry.id)) && !pageRows.every(entry => selection.selected.has(entry.id))} onChange={() => selection.togglePage(pageRows.map(entry => entry.id))} /></th>
          <th>Client</th><th>Deleted</th><th>Deleted by</th><th>Status</th><th className="actions-col">Actions</th>
        </tr></thead>
        <tbody>{pageRows.map(entry => <tr key={entry.id} className={selection.selected.has(entry.id) ? 'row-selected' : undefined}>
          <td className="selection-col"><SelectionCheckbox label={`Select ${formatClientName(entry.client)}`} checked={selection.selected.has(entry.id)} onChange={() => selection.toggle(entry.id)} /></td>
          <td><div className="trash-client-identity"><span className="trash-client-avatar" aria-hidden="true">{entry.client.firstName?.charAt(0)}{entry.client.lastName?.charAt(0)}</span><div><strong>{formatClientName(entry.client)}</strong><div className="muted small">{publicClientId(entry.client)} · Txn {entry.client.transactionNumber || 'Pending'}</div></div></div></td>
          <td>{entry.deletedAt ? dateFormat.format(entry.deletedAt) : 'Pending'}</td><td>{entry.deletedByName || 'Administrator'}</td>
          <td><span className={entry.status === 'purging' ? 'trash-status trash-status-warning' : 'trash-status'}><Icon name={entry.status === 'purging' ? 'clock' : 'restore'} />{entry.status === 'purging' ? 'Deletion started — retry to finish' : 'Ready to restore'}</span>{entry.status === 'trashed' && settings.trash.autoDeleteDays > 0 && entry.deletedAt && <div className="muted small trash-expiry">Auto deletion: {dateFormat.format(new Date(entry.deletedAt.getTime() + settings.trash.autoDeleteDays * 86_400_000))}</div>}</td>
          <td className="actions-col"><div className="selection-actions">
            <button type="button" className="btn btn-small" disabled={blocked || entry.status === 'purging'} onClick={() => confirm('restore', [entry], formatClientName(entry.client))}><Icon name="restore" />Restore</button>
            <button type="button" className="btn btn-small btn-danger-outline" disabled={blocked} onClick={() => confirm('purge', [entry], formatClientName(entry.client))}><Icon name="trash" />{entry.status === 'purging' ? 'Retry permanent deletion' : 'Permanently delete'}</button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <nav className="client-pagination" aria-label="Trash pagination">
        <span className="muted small" role="status">Showing {matches.length ? (page - 1) * 25 + 1 : 0}–{Math.min(page * 25, matches.length)} of {matches.length} clients</span>
        <div className="pagination-buttons"><button type="button" className="btn btn-small" disabled={page === 1} onClick={() => setRequestedPage(page - 1)}><Icon name="chevron-left" />Previous</button><span className="small">Page {page} of {pageCount}</span><button type="button" className="btn btn-small" disabled={page === pageCount} onClick={() => setRequestedPage(page + 1)}>Next<Icon name="chevron-right" /></button></div>
      </nav>
    </section>
    {confirmation && <ConfirmDialog title={confirmation.operation === 'restore' ? 'Restore clients' : 'Permanently delete clients'}
      message={confirmation.operation === 'restore'
        ? `Restore ${confirmation.name || `${confirmation.count} selected clients`} with their original IDs, payments and renewal history?`
        : `Permanently delete ${confirmation.name || `${confirmation.count} selected clients`} and all their payment records and renewal history? This cannot be undone. Once deletion starts, restoration is no longer available.`}
      confirmLabel={confirmation.operation === 'restore' ? 'Restore' : 'Permanently delete'} danger={confirmation.operation === 'purge'} onConfirm={confirmation.confirm} onClose={() => setConfirmation(null)} />}
  </>;
}
