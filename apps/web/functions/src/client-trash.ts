import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isAdminRole } from '../../src/lib/roles';
import { currentIdentifierReservation, identifierEpoch } from '../../src/lib/identifiers';
import { canResetIdentifiers } from './identifier-reset';
import { randomUUID } from 'node:crypto';

type Entry = { id: string; trashId?: string };
const fail = (message: string): never => { throw new HttpsError('failed-precondition', message); };
const identifier = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && Buffer.byteLength(value) <= 1500 && !value.includes('/') && value !== '.' && value !== '..';

/** Web-only entry point. Original client IDs and all ledger links survive recycling. */
export async function manageClientTrash(db: Firestore, uid: string, request: unknown) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in as an administrator.');
  const command = request as { operation?: unknown; operationId?: unknown; clients?: unknown } | null;
  if (!command || !['trash', 'restore', 'purge'].includes(command.operation as string)
    || typeof command.operationId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(command.operationId) || !Array.isArray(command.clients)
    || command.clients.length < 1 || command.clients.length > 75) {
    throw new HttpsError('invalid-argument', 'Choose between 1 and 75 clients per request.');
  }
  const operation = command.operation as 'trash' | 'restore' | 'purge';
  const entries = command.clients as Entry[];
  if (entries.some(entry => !entry || !identifier(entry.id)
    || (operation !== 'trash' && !identifier(entry.trashId)))
    || new Set(entries.map(entry => entry.id)).size !== entries.length
    || (operation === 'purge' && entries.length !== 1)) {
    throw new HttpsError('invalid-argument', 'Invalid or duplicate client selection.');
  }
  const operationId = command.operationId;
  const operationRef = db.doc(`clientTrashOperations/${operationId}`);
  const counterRef = db.doc('settings/Configurations/elements/counters');
  const requestKey = JSON.stringify({ operation, entries: entries.map(entry => ({ id: entry.id, trashId: entry.trashId ?? null })) });
  const activeRefs = entries.map(entry => db.doc(`clients/${entry.id}`));
  const trashRefs = entries.map(entry => db.doc(`clientTrash/${entry.id}`));

  const complete = await db.runTransaction(async tx => {
    const [actor, previous, ...documents] = await tx.getAll(db.doc(`users/${uid}`), operationRef, ...activeRefs, ...trashRefs);
    if (!isAdminRole(actor.data()?.role) || actor.data()?.active === false) {
      throw new HttpsError('permission-denied', 'Only active administrators can manage Trash.');
    }
    if (previous.exists) {
      if (previous.data()?.requestKey !== requestKey) fail('This operation identifier has already been used for a different selection.');
      if (previous.data()?.status === 'complete') return true;
    }
    const counters = await tx.get(counterRef);
    const epoch = identifierEpoch(counters.data());
    const active = documents.slice(0, entries.length);
    const trash = documents.slice(entries.length);
    // Reserve imported/legacy identifiers too. With 75 clients the worst case is
    // 375 document writes plus the operation marker, below Firestore's limit.
    const reservations = operation === 'trash' ? [...new Set(active.flatMap(document => {
      const data = document.data();
      return [`settings/Identifiers/clients/${document.id}`,
        ...(identifier(data?.clientNumber) ? [`settings/Identifiers/clients/${data.clientNumber}`] : []),
        ...(identifier(data?.transactionNumber) ? [`settings/Identifiers/transactions/${data.transactionNumber}`] : [])];
    }))] : [];
    const reserved = reservations.length ? await tx.getAll(...reservations.map(path => db.doc(path))) : [];
    // Validate every entry before writing any of them: each group is atomic.
    entries.forEach((entry, index) => {
      if (operation === 'trash') {
        if (!active[index].exists) fail('A selected client no longer exists. Refresh the selection.');
        if (trash[index].exists) fail('A selected client already has a Trash record. Refresh the selection.');
      } else {
        if (!trash[index].exists || trash[index].data()?.trashId !== entry.trashId) fail('Trash changed in another session. Refresh the selection.');
        if (active[index].exists) fail('A client with this ID already exists. Nothing was overwritten.');
        if (trash[index].data()?.status === 'purging'
          && (operation !== 'purge' || trash[index].data()?.purgeOperationId !== operationId)) {
          fail('Permanent deletion has started. This client can no longer be restored.');
        }
      }
    });
    entries.forEach((_entry, index) => {
      if (operation === 'trash') {
        tx.create(trashRefs[index], { client: active[index].data(), trashId: `${operationId}_${index}`,
          deletedAt: FieldValue.serverTimestamp(), deletedBy: uid, deletedByName: actor.data()?.fullName || '', status: 'trashed' });
        tx.delete(activeRefs[index]);
      } else if (operation === 'restore') {
        tx.create(activeRefs[index], { ...trash[index].data()!.client, updatedAt: FieldValue.serverTimestamp() });
        tx.delete(trashRefs[index]);
      } else {
        tx.update(trashRefs[index], { status: 'purging', purgeOperationId: operationId });
      }
    });
    reserved.forEach(document => {
      if (!currentIdentifierReservation(document.data(), epoch)) {
        const owner = active.find(client => document.ref.parent.id === 'transactions'
          ? client.data()?.transactionNumber === document.id : client.id === document.id || client.data()?.clientNumber === document.id);
        if (owner) tx.set(document.ref, { clientId: owner.id, ...(epoch ? { identifierEpoch: epoch } : {}) });
      }
    });
    tx.set(counterRef, { updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(operationRef, { operation, requestKey, actorId: uid,
      status: operation === 'purge' ? 'pending' : 'complete', updatedAt: FieldValue.serverTimestamp() });
    return operation !== 'purge';
  });
  if (complete) return { confirmed: true };

  // Purging is deliberately resumable. The marker prevents restoration after a
  // partial cleanup, and every bounded transaction checks that the ID is inactive.
  // Receipt audit events are retained; optional resets retire old reservations.
  const clientRef = activeRefs[0];
  const trashRef = trashRefs[0];
  for (;;) {
    const finished = await db.runTransaction(async tx => {
      const [actor, archive, active, attempt] = await tx.getAll(db.doc(`users/${uid}`), trashRef, clientRef, operationRef);
      if (!isAdminRole(actor.data()?.role) || actor.data()?.active === false) throw new HttpsError('permission-denied', 'Only active administrators can manage Trash.');
      if (attempt.data()?.status === 'complete') return true;
      await tx.get(counterRef);
      if (!archive.exists || archive.data()?.trashId !== entries[0].trashId
        || archive.data()?.purgeOperationId !== operationId || active.exists) fail('Trash changed during deletion. Refresh and retry.');
      const [payments, renewals] = await Promise.all([
        tx.get(db.collection('payments').where('clientId', '==', clientRef.id).limit(100)),
        tx.get(clientRef.collection('renewals').limit(100)),
      ]);
      if (payments.empty && renewals.empty) {
        const reset = await canResetIdentifiers(db, tx, clientRef.id);
        tx.set(counterRef, { ...(reset ? { clientSequence: 0, transactionSequence: 0, identifierEpoch: randomUUID() } : {}), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.delete(trashRef);
        tx.update(operationRef, { status: 'complete', updatedAt: FieldValue.serverTimestamp() });
        return true;
      }
      payments.docs.forEach(document => tx.delete(document.ref));
      renewals.docs.forEach(document => tx.delete(document.ref));
      return false;
    });
    if (finished) return { confirmed: true };
  }
}
