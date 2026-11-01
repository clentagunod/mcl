import { useMemo, useState } from 'react';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, LoadingState } from '../../components/StateMessage';
import { useData } from '../../context/DataContext';
import { formatDateTime } from '../../lib/dates';
import { deleteCollector, sendCollectorPasswordReset, updateCollector } from '../../services/collectors';
import type { UserProfile } from '../../types';
import { CollectorFormModal } from './CollectorFormModal';

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; collector: UserProfile }
  | { type: 'toggle'; collector: UserProfile }
  | { type: 'reset'; collector: UserProfile }
  | { type: 'delete'; collector: UserProfile }
  | null;

export default function CollectorsPage() {
  const { collectors, loading } = useData();
  const [modal, setModal] = useState<ModalState>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sorted = useMemo(() => [...collectors].sort((a, b) => a.fullName.localeCompare(b.fullName)), [collectors]);

  if (loading) return <LoadingState />;

  const close = () => setModal(null);

  return (
    <>
      <PageHeader
        title="Collectors"
        description="Collector accounts sign in on the Android app only. They cannot sign in to this website."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setModal({ type: 'add' })}>
            + Add collector
          </button>
        }
      />

      {notice && (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      )}

      <section className="card">
        {sorted.length === 0 ? (
          <EmptyState>No collectors yet. Click “Add collector” to create an account for the Android app.</EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login email</th>
                  <th>Cellphone</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((collector) => (
                  <tr key={collector.uid}>
                    <td>
                      <strong>{collector.fullName}</strong>
                    </td>
                    <td>{collector.email}</td>
                    <td>{collector.phone || '—'}</td>
                    <td>
                      <span className={collector.active ? 'badge badge-paid' : 'badge badge-inactive'}>
                        {collector.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{formatDateTime(collector.createdAt)}</td>
                    <td className="actions-col">
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'edit', collector })}>
                        Edit
                      </button>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'toggle', collector })}>
                        {collector.active ? 'Deactivate' : 'Activate'}
                      </button>{' '}
                      <button type="button" className="btn btn-small" onClick={() => setModal({ type: 'reset', collector })}>
                        Reset password
                      </button>{' '}
                      <button type="button" className="btn btn-small btn-danger-outline" onClick={() => setModal({ type: 'delete', collector })}>
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

      {modal?.type === 'add' && <CollectorFormModal onClose={close} />}
      {modal?.type === 'edit' && <CollectorFormModal collector={modal.collector} onClose={close} />}

      {modal?.type === 'toggle' && (
        <ConfirmDialog
          title={modal.collector.active ? 'Deactivate collector' : 'Activate collector'}
          message={
            modal.collector.active
              ? `${modal.collector.fullName} will immediately lose access to the Android app's data. You can activate the account again later.`
              : `${modal.collector.fullName} will be able to use the Android app again.`
          }
          confirmLabel={modal.collector.active ? 'Deactivate' : 'Activate'}
          danger={modal.collector.active}
          onConfirm={() => updateCollector(modal.collector.uid, { active: !modal.collector.active })}
          onClose={close}
        />
      )}

      {modal?.type === 'reset' && (
        <ConfirmDialog
          title="Reset password"
          message={`Send a password reset email to ${modal.collector.email}?`}
          confirmLabel="Send email"
          onConfirm={async () => {
            await sendCollectorPasswordReset(modal.collector.email);
            setNotice(`Password reset email sent to ${modal.collector.email}.`);
          }}
          onClose={close}
        />
      )}

      {modal?.type === 'delete' && (
        <ConfirmDialog
          title="Delete collector"
          message={`Delete ${modal.collector.fullName}? They lose access immediately. Payments they already entered are kept. (The login itself stays in Firebase Authentication until you remove it in the Firebase Console.)`}
          confirmLabel="Delete collector"
          danger
          onConfirm={() => deleteCollector(modal.collector.uid)}
          onClose={close}
        />
      )}
    </>
  );
}
