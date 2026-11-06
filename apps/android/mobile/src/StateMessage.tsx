import type { ReactNode } from 'react';
import { LoadingPanel, Notice } from './Status';
import { useConnectivity } from './connectivity';

export function LoadingState({ text = 'Loading records' }: { text?: string }) {
  const online = useConnectivity();
  return online ? <LoadingPanel title={text}>Getting the latest information from the server.</LoadingPanel>
    : <div className="empty-panel"><strong>Waiting for a connection</strong><p>Reconnect to load your records. This screen will update automatically.</p></div>;
}
export function ErrorState({ message }: { message: string }) {
  return <Notice tone="error" title="Unable to complete this action">{message}</Notice>;
}
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty-panel">{children}</div>;
}
