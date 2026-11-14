import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Client, ClientInput } from '../types';
import { clientFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { DEFAULT_SETTINGS, mergeSettings } from '../config/settings';
import { currentIdentifierReservation, formatSequence, identifierEpoch } from '../lib/identifiers';
import { canResetIdentifiers } from './identifier-reset';
import { dailyPayable } from '../lib/printables';
import { loanId } from '../lib/loan-cycle';

const clientsCollection = collection(db, 'clients');

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
    const reset = !existingRef && await canResetIdentifiers(transaction);
    const epoch = reset ? crypto.randomUUID() : identifierEpoch(counters);
    let clientSequence = reset ? 0 : Number(counters.clientSequence ?? 0);
    let transactionSequence = reset ? 0 : Number(counters.transactionSequence ?? 0);
    let clientNumber = typeof data?.clientNumber === 'string' ? data.clientNumber : '';
    let transactionNumber = typeof data?.transactionNumber === 'string' ? data.transactionNumber : '';
    // Skip occupied names, including manually imported IDs, without replacing records.
    for (let attempts = 0; !clientNumber && attempts < 100; attempts += 1) {
      const candidate = formatSequence(++clientSequence, general.clientIdDigits, general.clientIdPrefix);
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'clients', candidate));
      const client = await transaction.get(doc(clientsCollection, candidate));
      if (!currentIdentifierReservation(reservation.data(), epoch) && (!client.exists() || candidate === existingId)) clientNumber = candidate;
    }
    for (let attempts = 0; !transactionNumber && attempts < 100; attempts += 1) {
      const candidate = formatSequence(++transactionSequence, 5);
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'transactions', candidate));
      if (!currentIdentifierReservation(reservation.data(), epoch)) transactionNumber = candidate;
    }
    if (!clientNumber || !transactionNumber) throw new Error('Too many occupied identifiers. Contact an administrator to check the allocation counters.');
    if (!/^\d{5}$/.test(transactionNumber)) throw new Error('An existing transaction number is invalid. It must contain exactly five digits.');
    if (data?.clientNumber) {
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'clients', clientNumber));
      if (currentIdentifierReservation(reservation.data(), epoch) && reservation.data()!.clientId !== existingId) throw new Error(`Client number ${clientNumber} is already reserved for another client.`);
    }
    if (data?.transactionNumber) {
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'transactions', transactionNumber));
      if (currentIdentifierReservation(reservation.data(), epoch) && reservation.data()!.clientId !== existingId) throw new Error(`Transaction ${transactionNumber} is already reserved for another client.`);
    }
    // Public numbers can restart; an internal client ID must never be reused or
    // old expenses, audit records and stale collector forms could change owner.
    const ref = existingRef ?? (epoch ? doc(clientsCollection) : doc(clientsCollection, clientNumber));
    const epochFields = epoch ? { identifierEpoch: epoch } : {};
    // All reads above precede writes, as required by Firestore transactions.
    transaction.set(counterRef, { clientSequence, transactionSequence, ...epochFields, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(doc(db, 'settings', 'Identifiers', 'clients', clientNumber), { clientId: ref.id, ...epochFields });
    transaction.set(doc(db, 'settings', 'Identifiers', 'transactions', transactionNumber), { clientId: ref.id, ...epochFields });
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

export async function updateClient(id: string, input: ClientInput, expected: Client): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const ref = doc(clientsCollection, id);
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('This client no longer exists.');
    const current = clientFromDoc(snapshot);
    // Compare fields as well as the timestamp: legacy records may lack updatedAt,
    // and older import tools may not advance it when they change a loan.
    const fields = ['firstName', 'middleName', 'lastName', 'address', 'cellphone', 'principal', 'interest', 'loanTermDays', 'approvalDate', 'dailyAmount', 'transactionNumber', 'renewalCount', 'revision'] as const;
    const identityFields = ['validIdType', 'validIdNumber', 'validIdIssuedOn', 'validIdIssuedAt'] as const;
    const coMakerFields = ['name', 'contactNumber', ...identityFields] as const;
    const noteFields = ['payee', 'interestStatement', 'executionPlace'] as const;
    if (loanId(current) !== loanId(expected) || fields.some((key) => current[key] !== expected[key])
      || identityFields.some(key => (current[key] ?? '') !== (expected[key] ?? ''))
      || coMakerFields.some(key => (current.coMaker?.[key] ?? '') !== (expected.coMaker?.[key] ?? ''))
      || noteFields.some(key => (current.promissoryNote?.[key] ?? '') !== (expected.promissoryNote?.[key] ?? ''))) {
      throw new Error('This client changed in another session. Close and reopen Edit before saving.');
    }
    transaction.update(ref, { ...input, updatedAt: serverTimestamp() });
  });
}
