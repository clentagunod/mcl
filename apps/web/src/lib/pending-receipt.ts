import type { PaymentInput } from '../types';
import { isISODate } from './dates';
import { isMoney } from './money';

export interface PendingReceipt { version?: 1; id: string; input: PaymentInput }
export interface PendingReceiptState { pending: PendingReceipt | null; error: string | null }
const recoveryMessage = 'A reserved payment could not be restored. Ask an administrator to reconcile it before recording another payment for this client. The saved receipt has been retained.';

/** Read-only recovery: malformed or unfamiliar data is never deleted or replaced. */
export function restorePendingReceipt(storage: Pick<Storage, 'getItem'> | (() => Pick<Storage, 'getItem'>), key: string, uid: string, clientId: string): PendingReceiptState {
  try {
    const raw = (typeof storage === 'function' ? storage() : storage).getItem(key);
    if (raw === null) return { pending: null, error: null };
    const value = JSON.parse(raw);
    const input = value?.input;
    if (!value || ![undefined, 1].includes(value.version) || typeof value.id !== 'string' || !value.id || value.id.includes('/')
      || !input || input.clientId !== clientId || input.collectorId !== uid
      || typeof input.collectorName !== 'string' || !isMoney(input.amount) || input.amount <= 0
      || !isISODate(input.paymentDate) || (input.loanId !== undefined && typeof input.loanId !== 'string')
      || (input.notes !== undefined && (typeof input.notes !== 'string' || input.notes.length > 1500))) {
      return { pending: null, error: recoveryMessage };
    }
    return { pending: value as PendingReceipt, error: null };
  } catch { return { pending: null, error: recoveryMessage }; }
}
