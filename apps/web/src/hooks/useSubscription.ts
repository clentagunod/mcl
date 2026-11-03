import { useEffect, useState } from 'react';
import { describeError } from '../lib/errors';
import type { Subscribe } from '../services/subscribe';

interface SubscriptionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  fresh: boolean;
}

/**
 * Subscribes to a live Firestore feed for as long as the component is mounted.
 * `subscribe` must be a stable reference (the service functions are module-level constants).
 */
export function useSubscription<T>(subscribe: Subscribe<T>): SubscriptionState<T> {
  const [state, setState] = useState<SubscriptionState<T>>({ data: [], loading: true, error: null, fresh: false });

  useEffect(() => {
    return subscribe(
      (data, metadata) => setState({ data, loading: false, error: null, fresh: !metadata?.fromCache && !metadata?.hasPendingWrites }),
      (error) => setState((previous) => ({ ...previous, loading: false, fresh: false, error: describeError(error) })),
    );
  }, [subscribe]);

  return state;
}
