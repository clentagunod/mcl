import { describe, expect, it } from 'vitest';
import type { Client, Payment, RenewalRecord } from '../types';
import { renewalEligibility, validateRenewalTerms, hasGoodRenewalHistory } from './renewal';
import { isCurrentLoanPayment } from './loan-cycle';
import { summarizeLoan } from './loan';
import { indexEntries, dailySummary } from './printables';
import { buildConsolidation } from './consolidation';

const client: Client = { id: 'mcl0001', firstName: 'Juan', middleName: '', lastName: 'Cruz', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250, loanTermDays: 45, approvalDate: '2026-09-01', transactionNumber: '00001' };
const receipt = (amount = 11250, paymentDate = '2026-10-23', loanId?: string): Payment => ({ id: 'receipt', clientId: client.id, amount, paymentDate, collectorId: 'admin', collectorName: 'Admin', createdAt: null, ...(loanId ? { loanId } : {}) });
const assess = (payments: Payment[]) => renewalEligibility(client, payments, new Set(), '2026-11-02');

describe('renewal eligibility', () => {
  it('requires complete settlement including interest', () => {
    expect(assess([]).eligible).toBe(false);
    expect(assess([receipt(10000)]).eligible).toBe(false);
    expect(assess([receipt(11249.99)]).eligible).toBe(false);
    expect(assess([receipt()]).eligible).toBe(true);
  });
  it('allows settlement on the due date and rejects the next day', () => {
    const { dueDate } = assess([]);
    expect(dueDate).toBe('2026-10-23');
    expect(assess([receipt(11250, dueDate)]).eligible).toBe(true);
    expect(assess([receipt(11250, '2026-10-24')])).toMatchObject({ eligible: false, paidOn: '2026-10-24' });
  });
  it('finds the actual settlement date, independent of receipt ordering or a later extra receipt', () => {
    expect(assess([receipt(100, '2026-10-29'), receipt(11250, '2026-10-22')])).toMatchObject({ eligible: true, paidOn: '2026-10-22', totalPaid: 11350 });
    expect(assess([receipt(1250, '2026-10-23'), receipt(10000, '2026-10-01')])).toMatchObject({ eligible: true, paidOn: '2026-10-23' });
  });
  it('rejects invalid, pre-approval and future-dated payments', () => {
    for (const date of ['bad', '2026-08-30', '2026-11-03']) expect(assess([receipt(11250, date)]).eligible).toBe(false);
  });
  it('uses the holiday-aware loan schedule', () => {
    expect(renewalEligibility(client, [receipt(11250, '2026-10-24')], new Set(['2026-09-02']), '2026-11-02').eligible).toBe(true);
  });
  it('blocks a late or incomplete previous history', () => {
    expect(hasGoodRenewalHistory([{ paidOn: '2026-10-24', dueDate: '2026-10-23' } as RenewalRecord])).toBe(false);
    expect(hasGoodRenewalHistory([{} as RenewalRecord])).toBe(false);
  });
});

describe('separate loan cycles', () => {
  const renewed = { ...client, activeLoanId: 'renewal-1', approvalDate: '2026-11-02', principal: 5000, interest: 500, renewalCount: 1 };
  const payments = [receipt(11250, '2026-11-02'), receipt(100, '2026-11-02', 'renewal-1')];
  it('never lets old or untagged receipts pay a renewed loan, even on the same day', () => {
    expect(isCurrentLoanPayment(renewed, payments[0])).toBe(false);
    expect(isCurrentLoanPayment(renewed, payments[1])).toBe(true);
    expect(summarizeLoan(renewed, payments, new Set(), '2026-11-02')).toMatchObject({ totalPaid: 100, outstanding: 5400, daysElapsed: 0, status: 'pending' });
  });
  it('resets index day numbering and consolidation for the new loan', () => {
    expect(indexEntries(renewed, payments)).toEqual([{ day: 1, date: '2026-11-02', amount: 100 }]);
    expect(buildConsolidation([renewed], payments)[0]).toMatchObject({ totalPayment: 100, principal: 5000, balance: 4900 });
  });
  it('retains actual daily collections across both cycles in the daily summary', () => {
    expect(dailySummary([renewed], payments, '2026-11-02', 'Daily Payment')[0].amount).toBe(11350);
  });
  it('labels same-day collections with their original transaction numbers across renewals', () => {
    const current = { ...renewed, activeLoanId: '00002', transactionNumber: '00002', originalTransactionNumber: '00001' };
    const result = dailySummary([current], [payments[0], { ...payments[1], loanId: '00002' }], '2026-11-02', 'Daily Payment')[0];
    expect(result.transactionNumber).toBe('00001; 00002');
  });
});

describe('new renewal terms', () => {
  const terms = { principal: 10000, interest: 1250, dailyAmount: 250, loanTermDays: 45, approvalDate: '2026-11-02' };
  it('accepts valid new terms for all supported durations', () => {
    for (const loanTermDays of [45, 50, 58]) expect(validateRenewalTerms({ ...terms, loanTermDays }, '2026-11-02', '2026-10-23').loanTermDays).toBe(loanTermDays);
  });
  it('rejects blank, nonfinite, negative, fractional-cent and unsupported values', () => {
    for (const patch of [{ principal: 0 }, { interest: -1 }, { interest: Infinity }, { dailyAmount: 0 }, { principal: 1.001 }, { loanTermDays: 30 }, { approvalDate: '2026-11-03' }, { approvalDate: '2026-10-01' }, { approvalDate: '2026-02-30' }]) expect(() => validateRenewalTerms({ ...terms, ...patch }, '2026-11-02', '2026-10-23')).toThrow();
  });
});
