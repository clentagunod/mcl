import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../context/SettingsContext';
import { describeError } from '../lib/errors';
import { purgeExpiredClientTrash } from '../services/client-trash-operations';

/** Runs for the whole admin session, regardless of the currently selected page. */
export function TrashAutoDeletion() {
  const { settings, loading, error } = useSettings();
  const [cleanupError, setCleanupError] = useState('');
  const running = useRef(false);

  useEffect(() => {
    if (loading || error) return;
    const controller = new AbortController();
    async function clean() {
      if (running.current || controller.signal.aborted) return;
      running.current = true;
      try {
        await purgeExpiredClientTrash(controller.signal);
        if (!controller.signal.aborted) setCleanupError('');
      } catch (caught) {
        if (!controller.signal.aborted) setCleanupError(describeError(caught));
      } finally { running.current = false; }
    }
    void clean();
    const timer = window.setInterval(() => void clean(), 60_000);
    window.addEventListener('online', clean);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('online', clean); };
  }, [loading, error, settings.trash.autoDeleteDays]);

  return cleanupError ? <p className="alert alert-warning" role="status">Trash cleanup could not finish: {cleanupError} Cleanup will retry automatically.</p> : null;
}
