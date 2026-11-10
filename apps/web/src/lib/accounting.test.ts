import { describe, expect, it } from 'vitest';
import { allocateCollections, businessExpenseTotal, validateExpense } from './accounting';
import { applyConsolidationWindow, buildConsolidation, consolidationTotals } from './consolidation';
import type { Client, Payment } from '../types';
import type { Expense } from '../types/expenses';

const client: Client = { id: 'a', firstName: 'A', lastName: 'Borrower', middleName: '', address: '', cellphone: '', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-10-01' };
const receipt = (id: string, amount: number, date: string): Payment => ({ id, clientId: 'a', amount, paymentDate: date, collectorId: 'c', collectorName: 'C', createdAt: null });
const expense = (changes: Partial<Expense> = {}): Expense => ({ id: 'e', categoryId: 'fuel', categoryName: 'Fuel', amount: 200, expenseDate: '2026-11-02', description: 'Paid fuel', reference: '', clientId: 'a', loanId: 'initial', status: 'posted', voidReason: '', revision: 1, createdBy: 'admin', updatedBy: 'admin', createdAt: new Date(), updatedAt: new Date(), ...changes });

describe('cash collection accounting', () => {
  it('matches the two requested allocation examples', () => {
    expect(allocateCollections(10000, 1250, 5000, 'principalFirst')).toEqual({ principalRecovered: 5000, interestCollected: 0, excess: 0 });
    expect(allocateCollections(10000, 1250, 5000, 'proportional')).toEqual({ principalRecovered: 4444.44, interestCollected: 555.56, excess: 0 });
  });
  it.each(['principalFirst', 'proportional'] as const)('caps earned interest for excess payments under %s', method => {
    expect(allocateCollections(10000, 1250, 12000, method)).toEqual({ principalRecovered: 10000, interestCollected: 1250, excess: 750 });
    expect(allocateCollections(10000, 0, 12000, method)).toEqual({ principalRecovered: 10000, interestCollected: 0, excess: 2000 });
    expect(allocateCollections(0, 0, 0, method)).toEqual({ principalRecovered: 0, interestCollected: 0, excess: 0 });
  });
  it('uses prior principal recovery and paid dates without deducting principal released before the window', () => {
    const rows = buildConsolidation([client], [receipt('prior', 9900, '2026-10-31'), receipt('now', 600, '2026-11-02')], 'principalFirst', [expense(), expense({ id: 'prior', amount: 100, expenseDate: '2026-10-31' })]);
    const [row] = applyConsolidationWindow(rows, { from: '2026-11-01', to: '2026-11-02' });
    expect(row).toMatchObject({ totalPayment: 600, interestCollected: 500, principalRecovered: 100, principalReleased: 0, expenseAmount: 200, netIncome: 300, cashSurplus: 400, contractedInterest: 1250, balance: 10650 });
    expect(rows[0]).toMatchObject({ interestCollected: 500, expenseAmount: 300, principalReleased: 10000, netIncome: 200, cashSurplus: 200 });
  });
  it('reconciles proportional centavos across disjoint periods and split receipts', () => {
    const tiny = { ...client, principal: 1, interest: .5 };
    const payments = [receipt('a', .01, '2026-11-01'), receipt('b', .01, '2026-11-01'), receipt('c', .01, '2026-11-02')];
    const rows = buildConsolidation([tiny], payments, 'proportional');
    const first = applyConsolidationWindow(rows, { from: '2026-11-01', to: '2026-11-01' })[0];
    const second = applyConsolidationWindow(rows, { from: '2026-11-02', to: '2026-11-02' })[0];
    expect(first.interestCollected + second.interestCollected).toBe(rows[0].interestCollected);
    expect(rows[0].interestCollected).toBe(.01);
  });
  it('deducts principal when released even if that loan has no receipts in the period', () => {
    const [row] = applyConsolidationWindow(buildConsolidation([client], []), { from: '2026-10-01', to: '2026-10-01' });
    expect(row).toMatchObject({ totalPayment: 0, principalReleased: 10000, cashSurplus: -10000, interestCollected: 0 });
  });
  it('isolates current-loan expenses, excludes voids, and accounts for shared costs only once', () => {
    const expenses = [expense(), expense({ id: 'old', loanId: 'previous', amount: 900 }), expense({ id: 'void', status: 'void', amount: 500 }), expense({ id: 'shared', clientId: '', loanId: '', amount: 50 })];
    const rows = buildConsolidation([client], [receipt('paid', 11250, '2026-11-02')], 'principalFirst', expenses);
    expect(rows[0]).toMatchObject({ expenseAmount: 200, netIncome: 1050, cashSurplus: 1050 });
    expect(consolidationTotals(rows, businessExpenseTotal(expenses, null, true))).toMatchObject({ expenseAmount: 250, netIncome: 1000, cashSurplus: 1000 });
    expect(businessExpenseTotal(expenses, null, false)).toBe(0);
    expect(businessExpenseTotal(expenses, { from: '2026-11-03', to: '2026-11-03' }, true)).toBe(0);
    expect(buildConsolidation([client], [receipt('paid', 11250, '2026-11-02')])[0].netIncome).toBe(1250);
  });
  it('reports expenses without collections as a loss and excludes old receipts after renewal', () => {
    const renewed = { ...client, activeLoanId: 'new' };
    const rows = buildConsolidation([renewed], [receipt('old', 11250, '2026-11-02')], 'principalFirst', [expense({ loanId: 'new' })]);
    expect(rows[0]).toMatchObject({ totalPayment: 0, interestCollected: 0, expenseAmount: 200, netIncome: -200, cashSurplus: -10200 });
  });
  it('rejects invalid expense amounts, dates, empty descriptions, and incomplete assignments', () => {
    expect(validateExpense(expense(), '2026-11-02')).toBeNull();
    for (const changes of [{ amount: 0 }, { amount: -1 }, { amount: .001 }, { amount: Infinity }, { expenseDate: '2026-02-30' }, { expenseDate: '2026-11-03' }, { description: '   ' }, { clientId: '' }, { loanId: '' }, { reference: 'x'.repeat(121) }]) {
      expect(validateExpense(expense(changes), '2026-11-02')).not.toBeNull();
    }
  });
});
