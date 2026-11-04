import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}

/**
 * Uses the browser's built-in <dialog> element: it already traps keyboard focus,
 * closes on Escape and dims the page, so no extra library or hand-rolled logic is needed.
 * Render it only while it should be open.
 */
export function Modal({ title, onClose, children, wide = false, dismissible = true }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={wide ? 'modal modal-wide' : 'modal'}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => { if (!dismissible) event.preventDefault(); }}
      onClick={(event) => {
        // A click on the dimmed backdrop targets the <dialog> itself.
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-body">
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close" disabled={!dismissible}>
            <Icon name="close" size={19} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
