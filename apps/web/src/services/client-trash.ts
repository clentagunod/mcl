import { collection, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { clientFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { describeError } from '../lib/errors';
import type { Client } from '../types';
import { mutateTrashEntry, type TrashEntry, type TrashOperation } from './client-trash-operations';

export interface TrashedClient {
  id: string;
  client: Client;
  trashId: string;
  deletedAt: Date | null;
  deletedByName: string;
  status: 'trashed' | 'purging';
}

export const subscribeClientTrash: Subscribe<TrashedClient> = (onData, onError) =>
  subscribeToQuery(collection(db, 'clientTrash'), (snapshot): TrashedClient => {
    const data = snapshot.data();
    return { id: snapshot.id, client: clientFromDoc({ id: snapshot.id, data: () => data.client } as QueryDocumentSnapshot),
      trashId: data.trashId, deletedAt: data.deletedAt instanceof Timestamp ? data.deletedAt.toDate() : null,
      deletedByName: data.deletedByName || '', status: data.status === 'purging' ? 'purging' : 'trashed' };
  }, onData, onError);

/** Retains request IDs and completed clients across retries. */
export function createTrashAction(operation: TrashOperation, entries: readonly TrashEntry[]): () => Promise<void> {
  if (!entries.length || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Choose a nonempty selection of distinct clients.');
  const selected = entries.map(({ id, trashId }) => ({ id, trashId }));
  const operationId = crypto.randomUUID();
  let completed = 0;
  let pending: Promise<void> | null = null;
  async function execute() {
    while (completed < selected.length) {
      const entry = selected[completed];
      try {
        await mutateTrashEntry(operation, entry, operation === 'purge' ? `purge-${entry.trashId}` : `${operationId}_${completed}`);
        completed += 1;
      } catch (error) {
        throw new Error(`${completed ? `${completed} of ${selected.length} clients completed. ` : ''}${describeError(error)} Retry to finish this selection.`);
      }
    }
  }
  return async () => {
    if (!pending) pending = execute().finally(() => { pending = null; });
    await pending;
  };
}
