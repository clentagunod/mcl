import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Client, ClientInput } from '../types';
import { clientFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const clientsCollection = collection(db, 'clients');
const paymentsCollection = collection(db, 'payments');

/** Firestore allows at most 500 operations per batch. */
const BATCH_LIMIT = 400;

export const subscribeClients: Subscribe<Client> = (onData, onError) =>
  subscribeToQuery(clientsCollection, clientFromDoc, onData, onError);

export async function addClient(input: ClientInput): Promise<void> {
  await addDoc(clientsCollection, {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateClient(id: string, input: ClientInput): Promise<void> {
  await updateDoc(doc(clientsCollection, id), {
    ...input,
    updatedAt: serverTimestamp(),
  });
}

/** Deletes the client AND all of that client's payment records. */
export async function deleteClient(id: string): Promise<void> {
  const payments = await getDocs(query(paymentsCollection, where('clientId', '==', id)));

  for (let start = 0; start < payments.docs.length; start += BATCH_LIMIT) {
    const batch = writeBatch(db);
    payments.docs.slice(start, start + BATCH_LIMIT).forEach((payment) => batch.delete(payment.ref));
    await batch.commit();
  }

  // The client goes last: if anything above fails, the client still exists and can be retried.
  await deleteDoc(doc(clientsCollection, id));
}
