import type { Client as WebClient, Payment as WebPayment } from '@web/types';
export interface Client extends WebClient { activeLoanId: string; renewalCount: number }
export interface Payment extends WebPayment { loanId: string }
export const cycleId = (value?: string) => value || 'initial';
export const normalizeClient = (client: WebClient): Client => ({ ...client, activeLoanId: cycleId(client.activeLoanId), renewalCount: client.renewalCount ?? 0 });
export const normalizePayment = (payment: WebPayment): Payment => ({ ...payment, loanId: cycleId(payment.loanId) });
export class PaymentValidationError extends Error {}
export class StaleLoanError extends PaymentValidationError {
  constructor() { super('This loan was renewed. This receipt has not been moved to the new loan. Close and reopen payment entry to review the current terms.'); }
}
export function assertCycle(captured: string | undefined, active: string | undefined) {
  if (cycleId(captured) !== cycleId(active)) throw new StaleLoanError();
}
