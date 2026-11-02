import { describe, expect, it } from 'vitest';
import type { Client, Payment } from '../types';
import { buildConsolidation, consolidationTotals } from './consolidation';
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
    expect(row).toMatchObject({ totalPayment: 750, principal: 10000, balance: 9250 });
  });
  it('includes non-paying clients and computes principal-only balances without clamping', () => {
    const rows = buildConsolidation([client, { ...client, id: 'other' }], [receipt('a', 11250, '2026-10-21')]);
    expect(rows[0].balance).toBe(-1250);
    expect(rows[1]).toMatchObject({ totalPayment: 0, principal: 10000, balance: 10000, days: [] });
    expect(consolidationTotals(rows)).toEqual({ totalPayment: 11250, principal: 20000, balance: 8750 });
  });
  it('retains payments after both day 58 and payoff in the grand total and history', () => {
    const payments = Array.from({ length: 60 }, (_, i) => receipt(String(i), 250, addDays('2026-10-21', i)));
    const [row] = buildConsolidation([client], payments);
    expect(row.days).toHaveLength(60);
    expect(row.totalPayment).toBe(15000);
    expect(row.balance).toBe(-5000);
    expect(consolidationTotals([row]).totalPayment).toBe(15000);
  });
  it('sums decimal amounts in centavos and keeps other client receipts separate', () => {
    const [row] = buildConsolidation([client], [receipt('a', .1, '2026-10-21'), receipt('b', .2, '2026-10-21'), receipt('other', 900, '2026-10-21', 'other')]);
    expect(row.totalPayment).toBe(.3);
    expect(row.days[0].amount).toBe(.3);
    expect(consolidationTotals([])).toEqual({ totalPayment: 0, principal: 0, balance: 0 });
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
