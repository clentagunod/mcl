import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from '../config/firebase';
import type { Payment, PaymentInput } from '../types';

// Explicit rollout switch: never fall back to a direct write after a callable failure.
export const receiptBackendEnabled = import.meta.env.VITE_RECEIPT_BACKEND === 'callable-v1';
export async function writeServerReceipt(operation: 'create' | 'correct' | 'delete', id: string, operationId: string, input?: PaymentInput, expected?: Payment) {
  const call = httpsCallable(getFunctions(auth.app, 'asia-southeast1'), 'writeReceipt');
  const result = await call({ operation, id, operationId,
    ...(input ? { input } : {}),
    ...(expected ? { expected: { clientId: expected.clientId, loanId: expected.loanId || 'initial', amount: expected.amount, paymentDate: expected.paymentDate, notes: expected.notes ?? '' } } : {}),
  });
  if ((result.data as { confirmed?: boolean })?.confirmed !== true) throw new Error('The server did not confirm this receipt. Retry the same operation.');
}
