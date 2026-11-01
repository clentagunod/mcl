import { onSnapshot, type Query, type QueryDocumentSnapshot, type Unsubscribe } from 'firebase/firestore';

/** A live feed: calls `onData` with the full list every time something changes. */
export type Subscribe<T> = (onData: (items: T[]) => void, onError: (error: Error) => void) => Unsubscribe;

export function subscribeToQuery<T>(
  query: Query,
  map: (snapshot: QueryDocumentSnapshot) => T,
  onData: (items: T[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query,
    (snapshot) => onData(snapshot.docs.map(map)),
    (error) => onError(error),
  );
}
