import { useSyncExternalStore } from 'react';

declare global {
  interface Window { __mclNetworkOnline?: boolean | null }
}

/** Android supplies validated connectivity; browser previews use browser events. */
export function networkOnline(): boolean {
  return typeof window.__mclNetworkOnline === 'boolean' ? window.__mclNetworkOnline : navigator.onLine;
}
function subscribe(listener: () => void) {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  window.addEventListener('mcl:connectivity', listener);
  window.addEventListener('pageshow', listener);
  document.addEventListener('visibilitychange', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
    window.removeEventListener('mcl:connectivity', listener);
    window.removeEventListener('pageshow', listener);
    document.removeEventListener('visibilitychange', listener);
  };
}
/** Refresh once per reconnection, coalescing native and browser events. */
export function watchReconnect(refresh: () => Promise<unknown>) {
  let wasOnline = networkOnline();
  let stopped = false;
  let running = false;
  let queued = false;
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { void run(); }, 250);
  };
  async function run() {
    if (stopped || !networkOnline()) return;
    if (running) { queued = true; return; }
    running = true;
    try { await refresh(); }
    // Existing subscriptions retain their error/authorization handling and retry.
    catch { /* Reconnection is silent; never resubmit a mutation here. */ }
    finally {
      running = false;
      if (queued && !stopped) { queued = false; schedule(); }
    }
  }
  const stop = subscribe(() => {
    const online = networkOnline();
    if (online && !wasOnline) schedule();
    wasOnline = online;
  });
  return () => {
    stopped = true;
    stop();
    window.clearTimeout(timer);
  };
}
export function useConnectivity() {
  return useSyncExternalStore(subscribe, networkOnline, () => true);
}

/** Both existing data providers use this message for unconfirmed snapshots. */
export function awaitingServer(error: string | null) {
  return error?.startsWith('Displayed records are awaiting server confirmation.') === true;
}
