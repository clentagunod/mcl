import type { ReactNode } from 'react';

export function LoadingState({ text = 'Loading…' }: { text?: string }) {
  return (
    <p className="state" role="status">
      {text}
    </p>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="alert alert-error" role="alert">
      {message}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}
