import { collection, doc, getDocFromServer, getDocsFromServer, limit, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { readQueryDocuments, requireAdmin } from './firestore-admin';

export type TrashOperation = 'trash' | 'restore' | 'purge';
export interface TrashEntry { id: string; trashId?: string }

function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && new TextEncoder().encode(value).length <= 1500
    && !value.includes('/') && value !== '.' && value !== '..';
}

/** Each client commits independently to stay within Firestore's security-rule limits. */
export async function mutateTrashEntry(operation: TrashOperation, entry: TrashEntry, operationId: string, automatic = false): Promise<void> {
  if (automatic && operation !== 'purge') throw new Error('Automatic cleanup can only permanently delete Trash.');
  if (!validId(entry.id) || !validId(operationId) || (operation !== 'trash' && !validId(entry.trashId))) {
    throw new Error('Invalid client or Trash selection.');
  }
  const clientRef = doc(db, 'clients', entry.id);
  const trashRef = doc(db, 'clientTrash', entry.id);
  const operationRef = doc(db, 'clientTrashOperations', operationId);
  const requestKey = JSON.stringify({ operation, entries: [{ id: entry.id, trashId: entry.trashId ?? null }] });

  const complete = await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const previous = await transaction.get(operationRef);
    if (previous.exists()) {
      if (previous.data().requestKey !== requestKey) throw new Error('This operation identifier belongs to a different selection.');
      if (previous.data().status === 'complete') return true;
    }
    const active = await transaction.get(clientRef);
    const archive = await transaction.get(trashRef);
    const data = archive.data();
    if (automatic) {
      // A restored or re-recycled client is never deleted using a stale selection.
      if (!archive.exists() || !data || data.trashId !== entry.trashId || active.exists()) return true;
      if (data.status !== 'purging') {
        // Read the policy in this transaction so disabling/extending retention in
        // another session invalidates a pending automatic deletion.
        const policy = await transaction.get(doc(db, 'settings/Configurations/elements/trashPolicy'));
        const days = policy.data()?.autoDeleteDays;
        if (![3, 7, 30].includes(days) || !(data.deletedAt instanceof Timestamp)
          || data.deletedAt.toMillis() > Date.now() - days * 86_400_000) return true;
      }
    }
    const reservations = operation === 'trash' ? [...new Set([
      `settings/Identifiers/clients/${entry.id}`,
      ...(validId(active.data()?.clientNumber) ? [`settings/Identifiers/clients/${active.data()!.clientNumber}`] : []),
      ...(validId(active.data()?.transactionNumber) ? [`settings/Identifiers/transactions/${active.data()!.transactionNumber}`] : []),
    ])] : [];
    const reserved = await Promise.all(reservations.map(path => transaction.get(doc(db, path))));
    if (reserved.some(document => document.exists() && document.data().clientId !== entry.id)) {
      throw new Error('A client or transaction identifier belongs to another client. Correct it before moving this client to Trash.');
    }
    if (operation === 'trash') {
      if (!active.exists() || archive.exists()) throw new Error('A selected client changed. Refresh the selection.');
      transaction.set(trashRef, { client: active.data(), trashId: operationId,
        deletedAt: serverTimestamp(), deletedBy: actor.uid, deletedByName: actor.fullName, status: 'trashed' });
      transaction.delete(clientRef);
      reserved.forEach(document => { if (!document.exists()) transaction.set(document.ref, { clientId: entry.id }); });
    } else {
      if (!archive.exists() || !data || data.trashId !== entry.trashId) throw new Error('Trash changed in another session. Refresh the selection.');
      if (active.exists()) throw new Error('A client with this ID already exists. Nothing was overwritten.');
      if (data.status === 'purging' && (operation !== 'purge' || data.purgeOperationId !== operationId)) {
        throw new Error('Permanent deletion has started. This client can no longer be restored.');
      }
      if (operation === 'restore') {
        transaction.set(clientRef, { ...data.client, updatedAt: serverTimestamp() });
        transaction.delete(trashRef);
      } else {
        transaction.update(trashRef, { status: 'purging', purgeOperationId: operationId });
      }
    }
    transaction.set(operationRef, { operation, requestKey, actorId: previous.data()?.actorId || actor.uid,
      status: operation === 'purge' ? 'pending' : 'complete', updatedAt: serverTimestamp() });
    return operation !== 'purge';
  });
  if (complete) return;

  // The permanent-deletion marker prevents restore and new receipts during cleanup.
  // If the browser closes, the same operation ID resumes the remaining documents.
  for (;;) {
    const finished = await runTransaction(db, async transaction => {
      await requireAdmin(transaction);
      const attempt = await transaction.get(operationRef);
      if (attempt.data()?.status === 'complete') return true;
      const archive = await transaction.get(trashRef);
      const active = await transaction.get(clientRef);
      if (!archive.exists() || archive.data().trashId !== entry.trashId
        || archive.data().purgeOperationId !== operationId || active.exists()) {
        throw new Error('Trash changed during deletion. Refresh and retry.');
      }
      const [payments, renewals] = await Promise.all([
        readQueryDocuments(transaction, query(collection(db, 'payments'), where('clientId', '==', entry.id), limit(100))),
        readQueryDocuments(transaction, query(collection(clientRef, 'renewals'), limit(100))),
      ]);
      if (payments.length === 0 && renewals.length === 0) {
        transaction.delete(trashRef);
        transaction.update(operationRef, { status: 'complete', updatedAt: serverTimestamp() });
        return true;
      }
      payments.forEach(document => transaction.delete(document.ref));
      renewals.forEach(document => transaction.delete(document.ref));
      return false;
    });
    if (finished) return;
  }
}

/** Bounded, server-confirmed cleanup; the next pass handles any remaining clients. */
export async function purgeExpiredClientTrash(signal?: AbortSignal): Promise<void> {
  const policy = await getDocFromServer(doc(db, 'settings/Configurations/elements/trashPolicy'));
  const days = policy.data()?.autoDeleteDays;
  const trash = collection(db, 'clientTrash');
  const pending = await getDocsFromServer(query(trash, where('status', '==', 'purging'), limit(25)));
  const expired = [3, 7, 30].includes(days)
    ? await getDocsFromServer(query(trash, where('deletedAt', '<=', Timestamp.fromMillis(Date.now() - days * 86_400_000)), limit(25)))
    : null;
  const candidates = new Map([...pending.docs, ...(expired?.docs ?? [])].map(document => [document.id, document]));
  let failure: unknown;
  for (const document of candidates.values()) {
    if (signal?.aborted) return;
    const data = document.data();
    try {
      await mutateTrashEntry('purge', { id: document.id, trashId: data.trashId },
        data.status === 'purging' ? data.purgeOperationId : `purge-${data.trashId}`, true);
    } catch (error) { failure ??= error; }
  }
  if (failure) throw failure;
}
