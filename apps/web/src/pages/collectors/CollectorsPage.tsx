import { useEffect, useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateMessage';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../hooks/useSubscription';
import { formatDateTime } from '../../lib/dates';
import { isManagedRole } from '../../lib/roles';
import { deleteAccount, sendAccountPasswordReset, subscribeAccounts, updateAccount } from '../../services/accounts';
import type { ManagedUserProfile, ManagedUserRole, UserProfile } from '../../types';
import { AccountFormModal } from './AccountFormModal';
import './accounts.css';

type ModalState =
  | { type: 'add'; role: ManagedUserRole }
  | { type: 'edit' | 'toggle' | 'reset' | 'delete'; account: ManagedUserProfile }
  | null;

export default function CollectorsPage() {
  const { data, loading, error } = useSubscription(subscribeAccounts);
  return <AccountsContent accounts={data} loading={loading} error={error} />;
}

interface AccountsContentProps {
  accounts: UserProfile[];
  loading: boolean;
  error: string | null;
}

export function AccountsContent({ accounts, loading, error }: AccountsContentProps) {
  const { user } = useAuth();
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | ManagedUserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const sorted = useMemo(() => accounts
    .filter((account): account is ManagedUserProfile => isManagedRole(account.role))
    .sort((a, b) => a.fullName.localeCompare(b.fullName)), [accounts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return sorted.filter(account => (roleFilter === 'all' || account.role === roleFilter)
      && (statusFilter === 'all' || account.active === (statusFilter === 'active'))
      && `${account.fullName} ${account.email} ${account.phone}`.toLocaleLowerCase().includes(term));
  }, [sorted, search, roleFilter, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  const activeCount = sorted.filter(account => account.active).length;
  const adminCount = sorted.filter(account => account.role === 'admin').length;
  useEffect(() => setRequestedPage(current => Math.min(current, pageCount)), [pageCount]);

  if (loading) return <LoadingState />;

  const close = () => setModal(null);
  const unavailable = !user || !!error;

  return (
    <>
      <PageHeader
        title="Collectors & Admins"
        description="Manage your team's accounts, access and sign-in details."
        actions={
          <>
            <button type="button" className="btn btn-primary" disabled={unavailable} onClick={() => setModal({ type: 'add', role: 'collector' })}>
              + Add collector
            </button>
            <button type="button" className="btn btn-primary" disabled={unavailable} onClick={() => setModal({ type: 'add', role: 'admin' })}>
              + Add admin
            </button>
          </>
        }
      />

      {error && <ErrorState message={error} />}
      {notice && <p className="alert alert-success" role="status">{notice}</p>}

      <div className="account-overview" aria-label="Account overview">
        <div><span className="account-metric-icon"><Icon name="users" /></span><span><span className="muted small">Team accounts</span><strong>{sorted.length}</strong></span></div>
        <div><span className="account-metric-icon"><Icon name="check" /></span><span><span className="muted small">Active accounts</span><strong>{activeCount}</strong></span></div>
        <div><span className="account-metric-icon"><Icon name="shield" /></span><span><span className="muted small">Administrators</span><strong>{adminCount}</strong></span></div>
        <div><span className="account-metric-icon"><Icon name="wallet" /></span><span><span className="muted small">Collectors</span><strong>{sorted.length - adminCount}</strong></span></div>
      </div>

      <section className="card accounts-directory">
        <div className="accounts-directory-heading"><div><h2>Team directory</h2><p className="muted small">Collectors use the collection app. Admins manage this workspace.</p></div><span className="accounts-access-note"><Icon name="shield" /> Your own account is protected from deletion and deactivation.</span></div>
        <div className="accounts-filters">
          <label className="account-search"><span className="sr-only">Search accounts</span><Icon name="search" /><input type="search" aria-label="Search accounts" placeholder="Search name, email or phone" value={search} onChange={event => { setSearch(event.target.value); setRequestedPage(1); }} /></label>
          <label><span>Role</span><select aria-label="Filter accounts by role" value={roleFilter} onChange={event => { setRoleFilter(event.target.value as typeof roleFilter); setRequestedPage(1); }}><option value="all">All roles</option><option value="admin">Admins</option><option value="collector">Collectors</option></select></label>
          <label><span>Status</span><select aria-label="Filter accounts by status" value={statusFilter} onChange={event => { setStatusFilter(event.target.value as typeof statusFilter); setRequestedPage(1); }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        </div>
        {filtered.length === 0 ? (
          <EmptyState>{sorted.length ? 'No accounts match these filters. Try a different name or change the role and status filters.' : 'No accounts to display. Use Add collector or Add admin to create an account.'}</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Login email</th>
                  <th>Cellphone</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((account) => {
                  const isSelf = account.uid === user?.uid;
                  return (
                    <tr key={account.uid}>
                      <td>
                        <div className="account-identity"><span className="account-avatar" aria-hidden="true">{account.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase() || '?'}</span><span><strong>{account.fullName}</strong>{isSelf && <span className="muted small"> (You)</span>}</span></div>
                      </td>
                      <td><span className={`account-role account-role-${account.role}`}>{account.role === 'admin' ? 'Admin' : 'Collector'}</span></td>
                      <td>{account.email}</td>
                      <td>{account.phone || '\u2014'}</td>
                      <td>
                        <span className={account.active ? 'badge badge-paid' : 'badge badge-inactive'}>
                          {account.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>{formatDateTime(account.createdAt)}</td>
                      <td className="actions-col"><div className="account-row-actions">
                        <button type="button" className="btn btn-small" disabled={unavailable} onClick={() => setModal({ type: 'edit', account })}>
                          Edit
                        </button>{' '}
                        <button type="button" className="btn btn-small" disabled={unavailable || isSelf}
                          title={isSelf ? 'You cannot deactivate your own account.' : undefined}
                          onClick={() => setModal({ type: 'toggle', account })}>
                          {account.active ? 'Deactivate' : 'Activate'}
                        </button>{' '}
                        <button type="button" className="btn btn-small" disabled={unavailable || !account.email} onClick={() => setModal({ type: 'reset', account })}>
                          Reset password
                        </button>{' '}
                        <button type="button" className="btn btn-small btn-danger-outline" disabled={unavailable || isSelf}
                          title={isSelf ? 'You cannot delete your own account.' : undefined}
                          onClick={() => setModal({ type: 'delete', account })}>
                          Delete
                        </button>
                      </div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav className="client-pagination accounts-pagination" aria-label="Accounts pagination">
          <div className="pagination-summary"><span className="muted small" role="status">Showing {filtered.length ? start + 1 : 0}–{Math.min(start + pageSize, filtered.length)} of {filtered.length} accounts</span><label className="pagination-size">Rows per page<select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setRequestedPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></label></div>
          <div className="pagination-buttons"><button type="button" className="btn btn-small" disabled={!!error || page === 1} onClick={() => setRequestedPage(page - 1)}><Icon name="chevron-left" /> Previous</button><span className="muted small">Page {page} of {pageCount}</span><button type="button" className="btn btn-small" disabled={!!error || page === pageCount} onClick={() => setRequestedPage(page + 1)}>Next <Icon name="chevron-right" /></button></div>
        </nav>
      </section>

      {modal?.type === 'add' && <AccountFormModal role={modal.role} onClose={close} />}
      {modal?.type === 'edit' && <AccountFormModal account={modal.account} onClose={close} />}

      {modal?.type === 'toggle' && (
        <ConfirmDialog
          title={`${modal.account.active ? 'Deactivate' : 'Activate'} ${modal.account.role}`}
          message={modal.account.active
            ? `${modal.account.fullName} will immediately lose access to ${modal.account.role === 'admin' ? 'this website' : 'the Android app data'}. You can activate the account again later.`
            : `${modal.account.fullName} will be able to use ${modal.account.role === 'admin' ? 'this website' : 'the Android app'} again.`}
          confirmLabel={modal.account.active ? 'Deactivate' : 'Activate'}
          danger={modal.account.active}
          onConfirm={() => updateAccount(modal.account.uid, { active: !modal.account.active })}
          onClose={close}
        />
      )}

      {modal?.type === 'reset' && (
        <ConfirmDialog
          title="Reset password"
          message={`Send a password reset email to ${modal.account.email}?`}
          confirmLabel="Send email"
          onConfirm={async () => {
            await sendAccountPasswordReset(modal.account.email);
            setNotice(`Password reset email sent to ${modal.account.email}.`);
          }}
          onClose={close}
        />
      )}

      {modal?.type === 'delete' && (
        <ConfirmDialog
          title={`Delete ${modal.account.role}`}
          message={`Delete ${modal.account.fullName}? They lose data access immediately. Payments they already entered are kept. Their sign-in account remains registered until a system administrator removes it.`}
          confirmLabel={`Delete ${modal.account.role}`}
          danger
          onConfirm={() => deleteAccount(modal.account.uid)}
          onClose={close}
        />
      )}
    </>
  );
}
