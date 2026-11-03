import { onSnapshot, type Query, type QueryDocumentSnapshot, type Unsubscribe } from 'firebase/firestore';

/** A live feed: calls `onData` with the full list every time something changes. */
export interface FeedMetadata { fromCache: boolean; hasPendingWrites: boolean }
export type Subscribe<T> = (onData: (items: T[], metadata?: FeedMetadata) => void, onError: (error: Error) => void) => Unsubscribe;

export function subscribeToQuery<T>(
  query: Query,
  map: (snapshot: QueryDocumentSnapshot) => T,
  onData: (items: T[], metadata?: FeedMetadata) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query,
    { includeMetadataChanges: true },
    (snapshot) => {
      const items: T[] = [];
      const errors: string[] = [];
      for (const document of snapshot.docs) {
        try { items.push(map(document)); }
        catch (error) { errors.push(error instanceof Error ? error.message : `Invalid record ${document.id}`); }
      }
      onData(items, snapshot.metadata);
      if (errors.length) onError(new Error(`${errors.length} invalid record(s) excluded from this view. ${errors[0]} Totals may be incomplete.`));
    },
    (error) => onError(error),
  );
}
