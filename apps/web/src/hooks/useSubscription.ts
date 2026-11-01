import { useEffect, useState } from 'react';
import { describeError } from '../lib/errors';
import type { Subscribe } from '../services/subscribe';

interface SubscriptionState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

/**
 * Subscribes to a live Firestore feed for as long as the component is mounted.
 * `subscribe` must be a stable reference (the service functions are module-level constants).
 */
export function useSubscription<T>(subscribe: Subscribe<T>): SubscriptionState<T> {
  const [state, setState] = useState<SubscriptionState<T>>({ data: [], loading: true, error: null });

  useEffect(() => {
    return subscribe(
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState((previous) => ({ ...previous, loading: false, error: describeError(error) })),
    );
  }, [subscribe]);

  return state;
}
