import type { Client, Payment } from '../types';

export const ORIGINAL_LOAN_ID = 'initial';
export const loanId = (client: Pick<Client, 'activeLoanId'>) => client.activeLoanId || ORIGINAL_LOAN_ID;

/** Legacy receipts always belong to the original loan, even on a renewal's release day. */
export function isCurrentLoanPayment(client: Client, payment: Payment): boolean {
  return payment.clientId === client.id && (payment.loanId || ORIGINAL_LOAN_ID) === loanId(client);
}
