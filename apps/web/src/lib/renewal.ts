import type { Client, Payment, RenewalRecord, RenewalTerms } from '../types';
import { isISODate } from './dates';
import { summarizeLoan } from './loan';
import { round2 } from './money';
import { isCurrentLoanPayment } from './loan-cycle';
import { LOAN_TERMS } from '../config/app';

export interface RenewalEligibility { eligible: boolean; reason: string; paidOn: string | null; dueDate: string; totalPaid: number }

/** Missing calendar payments are allowed; a loan settled after its due date is not. */
export function renewalEligibility(client: Client, payments: readonly Payment[], holidays: ReadonlySet<string>, today: string, skipSundays = false): RenewalEligibility {
  const receipts = payments.filter((p) => isCurrentLoanPayment(client, p));
  const summary = summarizeLoan(client, receipts, holidays, today, skipSundays);
  const result = { eligible: false, reason: '', paidOn: null as string | null, dueDate: summary.dueDate, totalPaid: summary.totalPaid };
  if (summary.totalPayable <= 0 || summary.outstanding > 0) return { ...result, reason: 'The current loan must be fully paid.' };
  if (receipts.some((p) => !Number.isFinite(p.amount) || p.amount <= 0 || !isISODate(p.paymentDate) || p.paymentDate < client.approvalDate || p.paymentDate > today)) {
    return { ...result, reason: 'Correct invalid or future-dated payment records before renewing.' };
  }
  let paid = 0;
  for (const receipt of [...receipts].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.id.localeCompare(b.id))) {
    paid = round2(paid + receipt.amount);
    if (paid >= summary.totalPayable) { result.paidOn = receipt.paymentDate; break; }
  }
  if (!result.paidOn) return { ...result, reason: 'A complete payment history is required.' };
  if (result.paidOn > summary.dueDate) return { ...result, reason: 'This loan was settled after its due date and is not eligible for renewal.' };
  return { ...result, eligible: true, reason: 'Fully paid on or before the due date. Administrator approval is required.' };
}

export function hasGoodRenewalHistory(history: readonly RenewalRecord[]): boolean {
  return history.every((entry) => isISODate(entry.paidOn) && isISODate(entry.dueDate) && entry.paidOn <= entry.dueDate);
}

export function validateRenewalTerms(value: unknown, today: string, paidOn: string): RenewalTerms {
  if (!value || typeof value !== 'object') throw new Error('Enter the new loan details.');
  const v = value as Record<string, unknown>;
  for (const key of ['principal', 'interest', 'dailyAmount'] as const) {
    const n = v[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < (key === 'interest' ? 0 : 0.01) || n > 999999999 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001) throw new Error(`Enter a valid ${key} with at most two decimal places.`);
  }
  if (!(LOAN_TERMS as readonly unknown[]).includes(v.loanTermDays)) throw new Error(`Choose a supported loan term: ${LOAN_TERMS.join(', ')} days.`);
  if (!isISODate(v.approvalDate) || v.approvalDate < paidOn || v.approvalDate > today) throw new Error('Approval date must be on or after settlement and no later than today.');
  return { principal: v.principal as number, interest: v.interest as number, dailyAmount: v.dailyAmount as number, loanTermDays: v.loanTermDays as RenewalTerms['loanTermDays'], approvalDate: v.approvalDate };
}
