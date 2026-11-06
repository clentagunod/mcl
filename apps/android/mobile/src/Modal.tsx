import { useEffect, useId, useRef, type ReactNode } from 'react';
import { OfflineNotice } from './Status';
import { networkOnline } from './connectivity';
import { createPortal } from 'react-dom';

let openDialogs = 0;
let previousOverflow = '';
export function Modal({ title, onClose, children, wide = false }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    if (openDialogs++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.getElementById('root')?.setAttribute('inert', '');
    }
    const element = panel.current!;
    element.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      // Only the last portal handles input when a confirmation opens over a form.
      const dialogs = document.querySelectorAll('.mcl-dialog-panel');
      if (dialogs[dialogs.length - 1] !== element) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); }
      if (event.key === 'Tab') {
        const controls = [...element.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')]
          .filter(node => node.getClientRects().length > 0);
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (--openDialogs === 0) {
        document.body.style.overflow = previousOverflow;
        document.getElementById('root')?.removeAttribute('inert');
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div className="mcl-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) close.current(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        onSubmitCapture={event => {
          if (!networkOnline()) { event.preventDefault(); event.stopPropagation(); }
        }}
        className={wide ? 'mcl-dialog-panel mcl-dialog-wide' : 'mcl-dialog-panel'}>
        <header className="mcl-dialog-header"><h2 id={titleId}>{title}</h2><div className="dialog-header-actions"><button type="button" className="btn btn-ghost" aria-label="Close" onClick={() => close.current()}>✕</button></div></header>
        <div className="mcl-dialog-content"><OfflineNotice form />
          {children}
        </div>
      </div>
    </div>, document.body);
}
