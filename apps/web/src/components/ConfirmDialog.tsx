import { useState } from 'react';
import { describeError } from '../lib/errors';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  /** Styles the confirm button as destructive (red). */
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel, danger = false, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(describeError(caught));
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <p>{message}</p>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? 'btn btn-danger' : 'btn btn-primary'}
          onClick={handleConfirm}
          disabled={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
