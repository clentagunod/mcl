import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Payment, PaymentInput } from '../types';
import { paymentFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const paymentsCollection = collection(db, 'payments');

export const subscribePayments: Subscribe<Payment> = (onData, onError) =>
  subscribeToQuery(paymentsCollection, paymentFromDoc, onData, onError);

/**
 * Records a principal repayment. The Android collector app writes the same document shape
 * (see README -> "Data model"), so both apps feed the same live balance.
 */
export async function addPayment(input: PaymentInput): Promise<void> {
  await addDoc(paymentsCollection, { ...input, createdAt: serverTimestamp() });
}

export async function deletePayment(id: string): Promise<void> {
  await deleteDoc(doc(paymentsCollection, id));
}
