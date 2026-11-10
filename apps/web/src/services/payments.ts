import { collection, deleteField, doc, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Payment, PaymentInput } from '../types';
import { clientFromDoc, paymentFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';
import { readQueryDocuments, requireAdmin } from './firestore-admin';
import { isCurrentLoanPayment, loanId } from '../lib/loan-cycle';
import { isISODate } from '../lib/dates';
import { isMoney, round2, sumAmounts } from '../lib/money';

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

export interface PaymentCorrection {
  amount: number;
  paymentDate: string;
  notes: string;
}

/** Correct the existing receipt in place, preserving its collector and recording time.
 * The transaction tracks the source, loan and existing receipts so stale editors do
 * not overwrite another correction or apply a correction to a renewed loan.
 */
export async function updatePayment(id: string, input: PaymentCorrection, expected: Payment): Promise<void> {
  if (!expected || expected.id !== id || !expected.createdAt) throw new Error('Reopen the receipt before editing it.');
  const expectedCreatedAt = expected.createdAt.getTime();
  if (!isMoney(input.amount) || input.amount <= 0) throw new Error('Enter a valid payment amount greater than 0 with at most two decimal places.');
  if (!isISODate(input.paymentDate)) throw new Error('Choose a valid payment date.');
  if (typeof input.notes !== 'string' || input.notes.length > 1500) throw new Error('Notes must be at most 1,500 characters.');
  const notes = input.notes.trim();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (input.paymentDate > today) throw new Error('Payment date cannot be in the future.');
  await runTransaction(db, async transaction => {
    await requireAdmin(transaction);
    const ref = doc(paymentsCollection, id);
    const source = await transaction.get(ref);
    if (!source.exists()) throw new Error('This payment no longer exists.');
    const current = paymentFromDoc(source);
    const clientSource = await transaction.get(doc(db, 'clients', current.clientId));
    if (!clientSource.exists()) throw new Error('This client no longer exists.');
    const client = clientFromDoc(clientSource);
    if (!isCurrentLoanPayment(client, current) || (current.loanId || 'initial') !== (expected.loanId || 'initial')) {
      throw new Error('This loan changed. Close and reopen Payments.');
    }
    if (input.paymentDate < client.approvalDate) throw new Error('Payment date cannot be before the date of approval.');
    const identityFields = ['clientId', 'collectorId', 'collectorName'] as const;
    if (identityFields.some(field => current[field] !== expected[field]) || current.createdAt?.getTime() !== expectedCreatedAt) {
      throw new Error('This receipt changed. Close and reopen Edit before saving.');
    }
    // An acknowledgement may be lost after a successful commit. Repeating the
    // same correction is safe, while a different intervening edit is rejected.
    if (current.amount === input.amount && current.paymentDate === input.paymentDate && (current.notes || '') === notes) return;
    if (current.amount !== expected.amount || current.paymentDate !== expected.paymentDate || (current.notes || '') !== (expected.notes || '')) {
      throw new Error('This receipt changed. Close and reopen Edit before saving.');
    }
    const receipts = await readQueryDocuments(transaction, query(paymentsCollection, where('clientId', '==', current.clientId)));
    const otherPayments = receipts.map(paymentFromDoc).filter(receipt => receipt.id !== id && isCurrentLoanPayment(client, receipt));
    const available = round2(client.principal + client.interest - sumAmounts(otherPayments.map(receipt => receipt.amount)));
    // Legacy/concurrent overpayments must remain correctable: reductions and
    // date/note corrections are allowed, while increases cannot worsen excess.
    if (input.amount > available && input.amount > current.amount) throw new Error('Amount is more than the remaining payable balance. Refresh the payment history and try again.');
    transaction.update(ref, { amount: input.amount, paymentDate: input.paymentDate, notes,
      // Clear the legacy Android note alias as well, so clearing notes stays clear.
      ...('note' in source.data() ? { note: deleteField() } : {}),
    });
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
