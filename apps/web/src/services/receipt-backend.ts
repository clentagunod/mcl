import type { Payment, PaymentInput } from '../types';

/** Compatibility export for Android's existing import. Spark always uses direct writes. */
export const receiptBackendEnabled = false;

/**
 * Keep the former signature until Android drops its optional backend branch.
 * Fail explicitly if called directly; never invoke or silently enable a Cloud Function.
 */
export async function writeServerReceipt(
  _operation: 'create' | 'correct' | 'delete',
  _id: string,
  _operationId: string,
  _input?: PaymentInput,
  _expected?: Payment,
): Promise<never> {
  throw new Error('The Cloud Functions receipt backend is disabled. Use direct Firestore receipt operations.');
}
