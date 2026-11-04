import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Payment, PaymentInput } from '../types';
import { paymentFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { requireAdmin } from './firestore-admin';
import { loanId } from '../lib/loan-cycle';

const paymentsCollection = collection(db, 'payments');

export const subscribePayments: Subscribe<Payment> = (onData, onError) =>
  subscribeToQuery(paymentsCollection, paymentFromDoc, onData, onError);

/**
 * Records a principal repayment. The Android collector app writes the same document shape
 * (see README -> "Data model"), so both apps feed the same live balance.
 */
export async function addPayment(input: PaymentInput, id: string): Promise<void> {
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    if (input.collectorId !== actor.uid) throw new Error('The payment must belong to the signed-in account.');
    const ref = doc(paymentsCollection, id);
    const deletion = await transaction.get(doc(db, 'receiptDeletions', id));
    const existing = await transaction.get(ref);
    if (existing.exists() || deletion.exists()) {
      const original = existing.exists() ? existing.data() : deletion.data()?.payment;
      const old: Record<string, unknown> = { ...original, loanId: original?.loanId || 'initial' };
      if (Object.entries({ ...input, loanId: input.loanId || 'initial' }).every(([key, value]) => old[key] === value)) return;
      throw new Error('This receipt identifier already exists with different details. Ask an administrator to reconcile it.');
    }
    transaction.set(ref, { ...input, createdAt: serverTimestamp() });
  });
}

export async function deletePayment(id: string, expected?: Payment): Promise<void> {
  if (!expected || expected.id !== id) throw new Error('Reopen the receipt before deleting it.');
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const ref = doc(paymentsCollection, id);
    const deletionRef = doc(db, 'receiptDeletions', id);
    const deletion = await transaction.get(deletionRef);
    const source = await transaction.get(ref);
    if (!source.exists()) {
      if (deletion.exists()) return;
      throw new Error('This payment no longer exists.');
    }
    const current = paymentFromDoc(source);
    const client = await transaction.get(doc(db, 'clients', current.clientId));
    if (!client.exists() || loanId(client.data()) !== (current.loanId || 'initial')) throw new Error('This loan changed. Reopen Payments.');
    const fields = ['clientId', 'amount', 'paymentDate', 'collectorId', 'collectorName', 'notes'] as const;
    if ((current.loanId || 'initial') !== (expected.loanId || 'initial') || fields.some(field => current[field] !== expected[field])
      || current.createdAt?.getTime() !== expected.createdAt?.getTime()) throw new Error('This receipt changed. Reopen Payments before deleting it.');
    transaction.set(deletionRef, { clientId: current.clientId, payment: source.data(), deletedBy: actor.uid, deletedAt: serverTimestamp() });
    transaction.delete(ref);
  });
}
