import { describe, expect, it } from 'vitest';
import type { Client, Payment } from '../types';
import { applyConsolidationWindow, buildConsolidation, consolidationPresetWindow, consolidationTotals, consolidationWindowErrors } from './consolidation';
import { addDays } from './dates';
import { collectorMinimum } from './payment-policy';
import { validatePaymentForm } from './validation';
import { DEFAULT_SETTINGS, mergeSettings } from '../config/settings';

const client: Client = { id: 'legacy', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', middleName: '', lastName: 'Cruz', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250, loanTermDays: 45, approvalDate: '2026-10-20' };
const receipt = (id: string, amount: number, paymentDate: string, clientId = client.id): Payment => ({ id, clientId, amount, paymentDate, collectorId: 'collector', collectorName: 'Collector', createdAt: null });

describe('consolidation ledger', () => {
  it('uses consecutive paying dates and combines all sources on the same date', () => {
    const [row] = buildConsolidation([client], [receipt('c', 500, '2026-11-02'), receipt('a', 100, '2026-10-21'), { ...receipt('b', 150, '2026-10-21'), collectorId: 'admin' }]);
    expect(row.days).toEqual([{ day: 1, date: '2026-10-21', amount: 250, receipts: 2 }, { day: 2, date: '2026-11-02', amount: 500, receipts: 1 }]);
    expect(row).toMatchObject({ totalPayment: 750, principal: 10000, payableAmount: 11250, balance: 10500, contractedInterest: 1250 });
  });
  it('includes non-paying clients and computes payable balances without clamping', () => {
    const rows = buildConsolidation([client, { ...client, id: 'other' }], [receipt('a', 11250, '2026-10-21')]);
    expect(rows[0].balance).toBe(0);
    expect(rows[1]).toMatchObject({ totalPayment: 0, principal: 10000, payableAmount: 11250, balance: 11250, days: [] });
    expect(consolidationTotals(rows)).toMatchObject({ totalPayment: 11250, principal: 20000, payableAmount: 22500, balance: 11250, contractedInterest: 2500 });
  });
  it('retains payments after both day 58 and payoff in the grand total and history', () => {
    const payments = Array.from({ length: 60 }, (_, i) => receipt(String(i), 250, addDays('2026-10-21', i)));
    const [row] = buildConsolidation([client], payments);
    expect(row.days).toHaveLength(60);
    expect(row.totalPayment).toBe(15000);
    expect(row.balance).toBe(-3750);
    expect(consolidationTotals([row]).totalPayment).toBe(15000);
  });
  it('sums decimal amounts in centavos and keeps other client receipts separate', () => {
    const [row] = buildConsolidation([client], [receipt('a', .1, '2026-10-21'), receipt('b', .2, '2026-10-21'), receipt('other', 900, '2026-10-21', 'other')]);
    expect(row.totalPayment).toBe(.3);
    expect(row.days[0].amount).toBe(.3);
    expect(consolidationTotals([])).toMatchObject({ totalPayment: 0, principal: 0, payableAmount: 0, balance: 0, contractedInterest: 0 });
  });

  it('filters collection dates inclusively without rebasing original paying days', () => {
    const rows = buildConsolidation([client], [
      receipt('before', 100, '2026-10-21'), receipt('start', 125, '2026-11-01'),
      receipt('same-date', 125, '2026-11-01'), receipt('end', 500, '2026-11-02'), receipt('after', 50, '2026-11-03'),
    ]);
    const [selected] = applyConsolidationWindow(rows, { from: '2026-11-01', to: '2026-11-02' });
    expect(selected.days).toEqual([{ day: 2, date: '2026-11-01', amount: 250, receipts: 2 }, { day: 3, date: '2026-11-02', amount: 500, receipts: 1 }]);
    expect(selected).toMatchObject({ principal: 10000, payableAmount: 11250, totalPayment: 750, balance: 10500, contractedInterest: 1250 });
    expect(applyConsolidationWindow(rows, null)).toEqual(rows);
    expect(rows[0].totalPayment).toBe(900);
  });

  it('retains clients with no window receipts and isolates renewed loan cycles', () => {
    const renewed = { ...client, activeLoanId: 'renewal-1', renewalCount: 1 };
    const rows = buildConsolidation([renewed, { ...client, id: 'other' }], [
      receipt('original', 10000, '2026-11-01'),
      { ...receipt('current', 250, '2026-11-01'), loanId: 'renewal-1' },
      { ...receipt('later', 500, '2026-11-02'), loanId: 'renewal-1' },
    ]);
    const selected = applyConsolidationWindow(rows, { from: '2026-11-01', to: '2026-11-01' });
    expect(selected[0]).toMatchObject({ totalPayment: 250, balance: 11000 });
    expect(selected[0].days).toHaveLength(1);
    expect(selected[1]).toMatchObject({ days: [], totalPayment: 0, balance: 11250 });
    expect(consolidationTotals(selected)).toMatchObject({ totalPayment: 250, payableAmount: 22500, balance: 22250 });
  });

  it('rounds payable amount and selected balances to centavos', () => {
    const rows = buildConsolidation([{ ...client, principal: .1, interest: .2 }], [receipt('one', .1, '2026-11-01')]);
    expect(rows[0]).toMatchObject({ payableAmount: .3, balance: .2 });
    expect(rows[0].contractedInterest).toBe(.2);
    expect(applyConsolidationWindow(rows, { from: '2026-11-01', to: '2026-11-01' })[0].balance).toBe(.2);
  });

  it('keeps full contracted income independent of collections, date windows and repayment excess', () => {
    const rows = buildConsolidation([client], [receipt('paid', 12000, '2026-11-01')]);
    expect(rows[0]).toMatchObject({ contractedInterest: 1250, balance: -750 });
    const emptyWindow = applyConsolidationWindow(rows, { from: '2026-11-02', to: '2026-11-02' });
    expect(emptyWindow[0]).toMatchObject({ totalPayment: 0, contractedInterest: 1250, balance: 11250 });
    expect(consolidationTotals(emptyWindow).contractedInterest).toBe(1250);
  });

  it('totals income only for included loan cycles and keeps zero-interest loans at zero', () => {
    const loans = [{ ...client, activeLoanId: 'renewed', interest: 750 }, { ...client, id: 'no-interest', interest: 0 }];
    const rows = buildConsolidation(loans, [receipt('old-cycle', 10000, '2026-11-01')]);
    expect(rows[0]).toMatchObject({ totalPayment: 0, contractedInterest: 750 });
    expect(rows[1].contractedInterest).toBe(0);
    expect(consolidationTotals(rows).contractedInterest).toBe(750);
    expect(consolidationTotals(rows.filter(row => row.client.id === 'no-interest')).contractedInterest).toBe(0);
  });

  it('rejects invalid, incomplete and reversed date windows', () => {
    for (const window of [{ from: '', to: '2026-11-01' }, { from: '2026-02-30', to: '2026-11-01' }, { from: '2026-11-02', to: '2026-11-01' }]) {
      expect(Object.keys(consolidationWindowErrors(window)).length).toBeGreaterThan(0);
      expect(() => applyConsolidationWindow([], window)).toThrow('Invalid consolidation date window');
    }
    expect(consolidationWindowErrors({ from: '2026-11-01', to: '2026-11-01' })).toEqual({});
  });

  it('uses inclusive calendar presets across year and leap-month boundaries', () => {
    expect(consolidationPresetWindow('today', '2026-11-02')).toEqual({ from: '2026-11-02', to: '2026-11-02' });
    expect(consolidationPresetWindow('yesterday', '2026-01-01')).toEqual({ from: '2025-12-31', to: '2025-12-31' });
    expect(consolidationPresetWindow('last7', '2026-01-03')).toEqual({ from: '2025-12-28', to: '2026-01-03' });
    expect(consolidationPresetWindow('last30', '2026-11-02')).toEqual({ from: '2026-10-04', to: '2026-11-02' });
    expect(consolidationPresetWindow('month', '2026-11-02')).toEqual({ from: '2026-11-01', to: '2026-11-02' });
    expect(consolidationPresetWindow('previousMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(consolidationPresetWindow('previousMonth', '2024-03-15')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  });
});

describe('collector daily minimum', () => {
  const context = { outstanding: 1000, approvalDate: client.approvalDate, today: '2026-11-02' };
  const validate = (amount: string, enforce: boolean, role: 'admin' | 'collector') => validatePaymentForm({ amount, paymentDate: '2026-11-02' }, { ...context, minimumAmount: collectorMinimum(client, enforce, role) });
  it('keeps daily payable informational by default', () => {
    expect(DEFAULT_SETTINGS.payments.enforceDailyMinimum).toBe(false);
    expect(mergeSettings({}).payments.enforceDailyMinimum).toBe(false);
    expect(validate('100', false, 'collector').ok).toBe(true);
    expect(validate('500', false, 'collector').ok).toBe(true);
  });
  it('rejects collector receipts below the minimum and allows larger amounts within the balance', () => {
    expect(validate('249.99', true, 'collector').ok).toBe(false);
    expect(validate('250', true, 'collector').ok).toBe(true);
    expect(validate('500', true, 'collector').ok).toBe(true);
    expect(validate('1000.01', true, 'collector').ok).toBe(false);
  });
  it('preserves administrator partial payments and final settlements', () => {
    expect(validate('100', true, 'admin').ok).toBe(true);
    expect(validatePaymentForm({ amount: '10', paymentDate: '2026-11-02' }, { ...context, outstanding: 10, minimumAmount: collectorMinimum(client, true, 'admin') }).ok).toBe(true);
  });
  it('derives the same rounded-up fallback for a legacy client without a saved daily amount', () => {
    expect(collectorMinimum({ ...client, dailyAmount: undefined, loanTermDays: 58 }, true, 'collector')).toBe(193.97);
  });
});
