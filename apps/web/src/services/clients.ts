import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Client, ClientInput } from '../types';
import { clientFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { DEFAULT_SETTINGS, mergeSettings } from '../config/settings';
import { formatSequence } from '../lib/identifiers';
import { dailyPayable } from '../lib/printables';

const clientsCollection = collection(db, 'clients');
const paymentsCollection = collection(db, 'payments');

/** Firestore allows at most 500 operations per batch. */
const BATCH_LIMIT = 400;

export const subscribeClients: Subscribe<Client> = (onData, onError) =>
  subscribeToQuery(clientsCollection, clientFromDoc, onData, onError);

export async function addClient(input: ClientInput): Promise<void> {
  await allocateClient(input);
}

/** Shared transaction protects allocations against concurrent tabs/admins and retries. */
async function allocateClient(input?: ClientInput, existingId?: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const existingRef = existingId ? doc(clientsCollection, existingId) : null;
    const existing = existingRef ? await transaction.get(existingRef) : null;
    if (existingRef && !existing?.exists()) return;
    const data = existing?.data();
    if (data?.clientNumber && data?.transactionNumber && data?.dailyAmount > 0) return;
    const configuration = await transaction.get(doc(db, 'settings', 'Configurations', 'elements', 'general'));
    const { general } = configuration.exists()
      ? mergeSettings({ general: configuration.data() }) : DEFAULT_SETTINGS;
    const counterRef = doc(db, 'settings', 'Configurations', 'elements', 'counters');
    const counter = await transaction.get(counterRef);
    const counters = counter.data() ?? {};
    let clientSequence = Number(counters.clientSequence ?? 0);
    let transactionSequence = Number(counters.transactionSequence ?? 0);
    let clientNumber = typeof data?.clientNumber === 'string' ? data.clientNumber : '';
    let transactionNumber = typeof data?.transactionNumber === 'string' ? data.transactionNumber : '';
    // Skip occupied names, including manually imported IDs, without replacing records.
    for (let attempts = 0; !clientNumber && attempts < 100; attempts += 1) {
      const candidate = formatSequence(++clientSequence, general.clientIdDigits, general.clientIdPrefix);
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'clients', candidate));
      const client = await transaction.get(doc(clientsCollection, candidate));
      if (!reservation.exists() && (!client.exists() || candidate === existingId)) clientNumber = candidate;
    }
    for (let attempts = 0; !transactionNumber && attempts < 100; attempts += 1) {
      const candidate = formatSequence(++transactionSequence, 5);
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'transactions', candidate));
      if (!reservation.exists()) transactionNumber = candidate;
    }
    if (!clientNumber || !transactionNumber) throw new Error('Too many occupied identifiers. Contact an administrator to check the allocation counters.');
    if (!/^\d{5}$/.test(transactionNumber)) throw new Error('An existing transaction number is invalid. It must contain exactly five digits.');
    if (data?.clientNumber) {
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'clients', clientNumber));
      if (reservation.exists() && reservation.data().clientId !== existingId) throw new Error(`Client number ${clientNumber} is already reserved for another client.`);
    }
    if (data?.transactionNumber) {
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'transactions', transactionNumber));
      if (reservation.exists() && reservation.data().clientId !== existingId) throw new Error(`Transaction ${transactionNumber} is already reserved for another client.`);
    }
    const ref = existingRef ?? doc(clientsCollection, clientNumber);
    // All reads above precede writes, as required by Firestore transactions.
    transaction.set(counterRef, { clientSequence, transactionSequence, updatedAt: serverTimestamp() });
    transaction.set(doc(db, 'settings', 'Identifiers', 'clients', clientNumber), { clientId: ref.id });
    transaction.set(doc(db, 'settings', 'Identifiers', 'transactions', transactionNumber), { clientId: ref.id });
    if (existingRef && data) {
      transaction.update(existingRef, {
        clientNumber, transactionNumber,
        dailyAmount: dailyPayable({ principal: Number(data.principal), interest: Number(data.interest), loanTermDays: Number(data.loanTermDays), dailyAmount: data.dailyAmount }),
        updatedAt: serverTimestamp(),
      });
    } else if (input) {
      transaction.set(ref, { ...input, dailyAmount: dailyPayable(input), clientNumber, transactionNumber, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  });
}

/** Add missing fields only. Preserve legacy IDs and every payment's clientId reference. */
export async function completeClientRecords(clients: readonly Client[]): Promise<void> {
  for (const client of clients) {
    if (!client.clientNumber || !client.transactionNumber || !client.dailyAmount) await allocateClient(undefined, client.id);
  }
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
