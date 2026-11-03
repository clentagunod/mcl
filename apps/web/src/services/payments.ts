import { collection, deleteDoc, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Payment, PaymentInput } from '../types';
import { paymentFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { receiptBackendEnabled, writeServerReceipt } from './receipt-backend';

const paymentsCollection = collection(db, 'payments');

export const subscribePayments: Subscribe<Payment> = (onData, onError) =>
  subscribeToQuery(paymentsCollection, paymentFromDoc, onData, onError);

/**
 * Records a principal repayment. The Android collector app writes the same document shape
 * (see README -> "Data model"), so both apps feed the same live balance.
 */
export async function addPayment(input: PaymentInput, id: string): Promise<void> {
  if (receiptBackendEnabled) return writeServerReceipt('create', id, id, input);
  await runTransaction(db, async transaction => {
    const ref = doc(paymentsCollection, id);
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      const old: Record<string, unknown> = { ...existing.data(), loanId: existing.data().loanId || 'initial' };
      if (Object.entries({ ...input, loanId: input.loanId || 'initial' }).every(([key, value]) => old[key] === value)) return;
      throw new Error('This receipt identifier already exists with different details. Ask an administrator to reconcile it.');
    }
    transaction.set(ref, { ...input, createdAt: serverTimestamp() });
  });
}

const deletionIds = new WeakMap<Payment, string>();
export async function deletePayment(id: string, expected?: Payment): Promise<void> {
  if (receiptBackendEnabled) {
    if (!expected) throw new Error('Reopen the receipt before deleting it.');
    const operationId = deletionIds.get(expected) ?? doc(paymentsCollection).id;
    deletionIds.set(expected, operationId);
    return writeServerReceipt('delete', id, operationId, undefined, expected);
  }
  await deleteDoc(doc(paymentsCollection, id));
}
