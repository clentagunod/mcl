import type { PaymentAllocation } from '../config/settings';
import type { Expense, ExpenseInput } from '../types/expenses';
import { isISODate, todayISO } from './dates';
import { isMoney, round2, sumAmounts } from './money';

/** Cumulative allocation makes centavo rounding independent of receipt splitting.
 * Excess above the contractual payable is never recognized as earned interest.
 */
export function allocateCollections(principal: number, interest: number, collected: number, method: PaymentAllocation) {
  const payable = round2(principal + interest);
  const applied = Math.min(Math.max(0, collected), payable);
  // Integer centavos prevent large proportional products from rounding on the
  // wrong side of a half-cent. Supported amounts fit safely before conversion.
  const payableCents = BigInt(Math.round(payable * 100));
  const proportionalCents = payableCents > 0n
    ? (BigInt(Math.round(applied * 100)) * BigInt(Math.round(interest * 100)) + payableCents / 2n) / payableCents : 0n;
  const interestCollected = method === 'principalFirst'
    ? round2(Math.min(interest, Math.max(0, applied - principal)))
    : Number(proportionalCents) / 100;
  return { interestCollected, principalRecovered: round2(applied - interestCollected), excess: round2(Math.max(0, collected - payable)) };
}

export interface DateWindow { from: string; to: string }
export const inDateWindow = (date: string, window: DateWindow | null) => !window || date >= window.from && date <= window.to;

export function businessExpenseTotal(expenses: readonly Expense[], window: DateWindow | null, includeShared: boolean): number {
  return includeShared ? sumAmounts(expenses.filter(expense => expense.status === 'posted' && !expense.clientId
    && inDateWindow(expense.expenseDate, window)).map(expense => expense.amount)) : 0;
}

export function validateExpense(input: ExpenseInput, today = todayISO()): string | null {
  if (!isMoney(input.amount) || input.amount <= 0) return 'Enter a positive amount with at most two decimal places (maximum ₱999,999,999).';
  if (!isISODate(input.expenseDate) || input.expenseDate > today) return 'Choose a valid paid date on or before today.';
  if (!input.categoryId || !input.categoryName.trim() || input.categoryName.length > 80) return 'Choose an active expense type.';
  if (!input.description.trim() || input.description.length > 500) return 'Enter a description of up to 500 characters.';
  if (input.reference.length > 120) return 'The receipt/reference must be at most 120 characters.';
  if (!!input.clientId !== !!input.loanId) return 'Choose a current loan or a shared business expense.';
  return null;
}
