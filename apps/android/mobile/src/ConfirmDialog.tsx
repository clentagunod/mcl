import { useState } from 'react';
import { describeError } from '@web/lib/errors';
import { Modal } from './Modal';
import { LoadingPanel, Notice } from './Status';
import { networkOnline, useConnectivity } from './connectivity';

export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => Promise<void>; onClose: () => void;
}) {
  const online = useConnectivity();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (busy || !networkOnline()) return;
    setBusy(true); setError('');
    try { await onConfirm(); onClose(); }
    catch (caught) { setError(describeError(caught)); }
    finally { setBusy(false); }
  }
  return <Modal title={title} onClose={() => { if (!busy) onClose(); }}>
    <p>{message}</p>
    {error && <Notice tone="error" title="Action wasn't completed">{error}</Notice>}
    {busy && <LoadingPanel title="Waiting for confirmation">Please keep this dialog open until the server responds.</LoadingPanel>}
    <div className="modal-actions">
      <button type="button" className="btn" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className={danger ? 'btn btn-danger' : 'btn btn-primary'} disabled={busy || !online} onClick={() => void confirm()}>{busy ? 'Working…' : confirmLabel}</button>
    </div>
  </Modal>;
}
