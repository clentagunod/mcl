import type { Client, Payment } from '../types';
import { groupPaymentsByClient } from './loan';
import { round2, sumAmounts } from './money';
import { summaryClientName } from './printables';
import { isCurrentLoanPayment, loanId } from './loan-cycle';
import type { PaymentAllocation } from '../config/settings';
import type { Expense } from '../types/expenses';
import { allocateCollections, inDateWindow } from './accounting';
import { addDays, isISODate, type ISODate } from './dates';
import { LOAN_TERMS } from '../config/app';

export const CONSOLIDATION_DAYS = Math.max(...LOAN_TERMS);
export interface CollectionDay { day: number; date: string; amount: number; receipts: number }
export interface ConsolidationWindow { from: ISODate; to: ISODate }
export type ConsolidationPreset = 'all' | 'today' | 'yesterday' | 'last7' | 'last30' | 'month' | 'previousMonth' | 'custom';

export function consolidationWindowErrors(window: ConsolidationWindow): { from?: string; to?: string } {
  const errors: { from?: string; to?: string } = {};
  if (!isISODate(window.from)) errors.from = 'Select a valid start date.';
  if (!isISODate(window.to)) errors.to = 'Select a valid end date.';
  if (!errors.from && !errors.to && window.from > window.to) errors.to = 'The end date must be on or after the start date.';
  return errors;
}

/** Calendar dates only; no timestamp conversions or daylight-saving arithmetic. */
export function consolidationPresetWindow(preset: Exclude<ConsolidationPreset, 'all' | 'custom'>, today: ISODate): ConsolidationWindow {
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const date = addDays(today, -1); return { from: date, to: date }; }
    case 'last7': return { from: addDays(today, -6), to: today };
    case 'last30': return { from: addDays(today, -29), to: today };
    case 'month': return { from: monthStart, to: today };
    case 'previousMonth': { const to = addDays(monthStart, -1); return { from: `${to.slice(0, 7)}-01`, to }; }
  }
}

export interface ConsolidationRow {
  client: Client;
  days: CollectionDay[];
  totalPayment: number;
  principal: number;
  payableAmount: number;
  contractedInterest: number;
  interestCollected: number;
  principalRecovered: number;
  principalReleased: number;
  expenseAmount: number;
  cashSurplus: number;
  netIncome: number;
  allocation: PaymentAllocation;
  /** Full current-loan costs, retained to recalculate date windows. */
  expenses: readonly Expense[];
  /** Payable amount less the receipts included in this report. May show an excess. */
  balance: number;
}

/** Build once per live update. Include every ledger receipt, even after payoff or
 * day 58; the matrix is a view of the ledger, not a replacement loan calculation.
 */
export function buildConsolidation(clients: readonly Client[], payments: readonly Payment[],
  allocation: PaymentAllocation = 'principalFirst', expenses: readonly Expense[] = []): ConsolidationRow[] {
  const grouped = groupPaymentsByClient(payments);
  const expensesByLoan = new Map<string, Expense[]>();
  for (const expense of expenses) {
    if (expense.status !== 'posted' || !expense.clientId) continue;
    const key = JSON.stringify([expense.clientId, expense.loanId]);
    const costs = expensesByLoan.get(key) ?? [];
    costs.push(expense);
    expensesByLoan.set(key, costs);
  }
  return [...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b)) || a.id.localeCompare(b.id)).map((client) => {
    const receipts = (grouped.get(client.id) ?? []).filter((p) => isCurrentLoanPayment(client, p));
    const byDate = new Map<string, number[]>();
    for (const receipt of receipts) {
      const amounts = byDate.get(receipt.paymentDate) ?? [];
      amounts.push(receipt.amount);
      byDate.set(receipt.paymentDate, amounts);
    }
    const days = [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, amounts], i) => ({
      day: i + 1, date, amount: sumAmounts(amounts), receipts: amounts.length,
    }));
    const totalPayment = sumAmounts(receipts.map((payment) => payment.amount));
    const payableAmount = round2(client.principal + client.interest);
    const costs = expensesByLoan.get(JSON.stringify([client.id, loanId(client)])) ?? [];
    const expenseAmount = sumAmounts(costs.map(expense => expense.amount));
    const allocated = allocateCollections(client.principal, client.interest, totalPayment, allocation);
    return { client, days, totalPayment, principal: client.principal, payableAmount,
      contractedInterest: round2(payableAmount - client.principal), ...allocated,
      principalReleased: client.principal, expenseAmount, allocation, expenses: costs,
      netIncome: round2(allocated.interestCollected - expenseAmount),
      cashSurplus: round2(totalPayment - client.principal - expenseAmount), balance: round2(payableAmount - totalPayment) };
  });
}

/** Filter actual collection dates inclusively, retaining original paying-day numbers
 * so a reporting window never moves the configured loan endpoint. Full contracted
 * interest is retained; the window changes included collections, not loan terms.
 */
export function applyConsolidationWindow(rows: readonly ConsolidationRow[], window: ConsolidationWindow | null): ConsolidationRow[] {
  if (!window) return [...rows];
  if (Object.keys(consolidationWindowErrors(window)).length) throw new Error('Invalid consolidation date window.');
  return rows.map((row) => {
    const days = row.days.filter((day) => day.date >= window.from && day.date <= window.to);
    const totalPayment = sumAmounts(days.map((day) => day.amount));
    const before = sumAmounts(row.days.filter(day => day.date < window.from).map(day => day.amount));
    const opening = allocateCollections(row.principal, row.contractedInterest, before, row.allocation);
    const closing = allocateCollections(row.principal, row.contractedInterest, sumAmounts([before, totalPayment]), row.allocation);
    const interestCollected = round2(closing.interestCollected - opening.interestCollected);
    const principalRecovered = round2(closing.principalRecovered - opening.principalRecovered);
    const expenseAmount = sumAmounts(row.expenses.filter(expense => inDateWindow(expense.expenseDate, window)).map(expense => expense.amount));
    const principalReleased = inDateWindow(row.client.approvalDate, window) ? row.principal : 0;
    return { ...row, days, totalPayment, interestCollected, principalRecovered, expenseAmount, principalReleased,
      netIncome: round2(interestCollected - expenseAmount), cashSurplus: round2(totalPayment - principalReleased - expenseAmount),
      balance: round2(row.payableAmount - totalPayment) };
  });
}

export function consolidationTotals(rows: readonly ConsolidationRow[], sharedExpenses = 0) {
  return {
    totalPayment: sumAmounts(rows.map((row) => row.totalPayment)),
    principal: sumAmounts(rows.map((row) => row.principal)),
    payableAmount: sumAmounts(rows.map((row) => row.payableAmount)),
    contractedInterest: sumAmounts(rows.map(row => row.contractedInterest)),
    interestCollected: sumAmounts(rows.map(row => row.interestCollected)),
    principalRecovered: sumAmounts(rows.map(row => row.principalRecovered)),
    principalReleased: sumAmounts(rows.map(row => row.principalReleased)),
    expenseAmount: sumAmounts([...rows.map(row => row.expenseAmount), sharedExpenses]),
    netIncome: round2(sumAmounts(rows.map((row) => row.netIncome)) - sharedExpenses),
    cashSurplus: round2(sumAmounts(rows.map(row => row.cashSurplus)) - sharedExpenses),
    balance: sumAmounts(rows.map((row) => row.balance)),
  };
}
