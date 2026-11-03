import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validLayout, validateSettings } from '../config/settings';
import type { Client, Payment } from '../types';
import { formatSequence } from './identifiers';
import { dailyPayable, dailySummary, indexEntries, paperDimensions, pesoWords, promissoryValues } from './printables';
import { indexCardPages, renderPrintDocument, summaryPages, type PrintJob } from './print-renderer';
import { validateClientForm } from './validation';

const client: Client = { id: 'legacy-id', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', lastName: 'Dela Cruz', middleName: 'Santos', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-10-20' };
const receipt = (id: string, amount: number, paymentDate: string, extra: Partial<Payment> = {}): Payment => ({ id, amount, paymentDate, clientId: client.id, collectorId: 'admin', collectorName: 'Admin', createdAt: null, ...extra });
const makeJob = (overrides: Partial<PrintJob> = {}): PrintJob => ({ kind: 'index', clients: [client], payments: [], settings: DEFAULT_SETTINGS, layout: DEFAULT_SETTINGS.studio.index, date: '2026-11-02', logoUrl: '/assets/logo.png', ...overrides });

describe('paying day numbering', () => {
  it('fills missed dates without gaps and combines same-day receipts regardless of source', () => {
    const entries = indexEntries(client, [receipt('c', 500, '2026-11-02'), receipt('a', 150, '2026-10-21'), receipt('b', 100, '2026-10-21', { collectorId: 'android' })]);
    expect(entries).toEqual([{ day: 1, date: '2026-10-21', amount: 250 }, { day: 2, date: '2026-11-02', amount: 500 }]);
  });
  it('stops after payoff without losing an overpayment in the final paying day', () => {
    expect(indexEntries(client, [receipt('a', 11260, '2026-10-21'), receipt('b', 100, '2026-10-22')])).toEqual([{ day: 1, amount: 11260, date: '2026-10-21' }]);
  });
  it('ignores another client, zero amounts and malformed dates', () => {
    expect(indexEntries(client, [receipt('a', 100, '2026-10-21', { clientId: 'different' }), receipt('b', 0, '2026-10-22'), receipt('c', 100, 'bad')])).toEqual([]);
  });
  it('continues past the original term instead of dropping late paying days', () => {
    const payments = Array.from({ length: 60 }, (_, i) => receipt(String(i), 1, `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`));
    expect(indexEntries(client, payments)).toHaveLength(60);
    expect(indexCardPages(client, payments)).toEqual([{ from: 1, to: 48, rows: 12 }, { from: 49, to: 60, rows: 12 }]);
  });
});

describe('client amounts and identifiers', () => {
  it('uses a saved daily amount and rounds the legacy suggestion upwards', () => {
    expect(dailyPayable({ ...client, dailyAmount: 275 })).toBe(275);
    expect(dailyPayable({ ...client, loanTermDays: 58 })).toBe(193.97);
  });
  it('never truncates or recycles an exhausted identifier', () => {
    expect(formatSequence(1, 4, 'mcl')).toBe('mcl0001');
    expect(formatSequence(99999, 5)).toBe('99999');
    expect(() => formatSequence(100000, 5)).toThrow('exhausted');
    expect(() => formatSequence(0, 5)).toThrow();
  });
  it('validates and persists a manually entered daily amount', () => {
    const values = { firstName: 'Juan', lastName: 'Dela Cruz', middleName: '', address: 'San Miguel', cellphone: '09170000000', principal: '10000', interest: '1250', approvalDate: '2026-11-02', loanTermDays: '45', dailyAmount: '275.50' };
    const result = validateClientForm(values);
    expect(result.ok && result.value.dailyAmount).toBe(275.5);
    expect(validateClientForm({ ...values, dailyAmount: '' }).ok).toBe(false);
    expect(validateClientForm({ ...values, dailyAmount: '-1' }).ok).toBe(false);
  });
});

describe('daily summary', () => {
  it('includes non-paying clients and only the chosen date, preserving collectors and notes', () => {
    const entries = dailySummary([client, { ...client, id: 'other', lastName: 'Reyes' }], [
      receipt('a', 100, '2026-11-02'), receipt('b', 200, '2026-11-02', { collectorName: 'Collector', notes: 'Partial collection' }), receipt('c', 300, '2026-11-01'),
    ], '2026-11-02', 'Daily Payment');
    expect(entries[0]).toMatchObject({ amount: 300, collectors: 'Admin; Collector', notes: 'Daily Payment; Partial collection' });
    expect(entries[1]).toMatchObject({ amount: 0, collectors: '', notes: '' });
  });
  it('paginates long notes and retains every client exactly once', () => {
    const entries = Array.from({ length: 70 }, (_, i) => ({ client: { ...client, id: String(i) }, transactionNumber: '00001', amount: i, collectors: 'Collector', notes: 'A detailed note about this payment. '.repeat(3) }));
    const pages = summaryPages(entries, DEFAULT_SETTINGS.studio.summary);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flat()).toEqual(entries);
  });
});

describe('templates and settings', () => {
  it('prints exact centavo wording, including round-up boundaries', () => {
    expect(pesoWords(11250)).toBe('ELEVEN THOUSAND TWO HUNDRED FIFTY PESOS');
    expect(pesoWords(1000.01)).toBe('ONE THOUSAND PESOS AND ONE CENTAVO');
    expect(pesoWords(1.999)).toBe('TWO PESOS');
    expect(() => pesoWords(Infinity)).toThrow();
  });
  it('derives approval dates and handles English ordinals correctly', () => {
    expect(promissoryValues({ ...client, approvalDate: '2026-10-11' }, DEFAULT_SETTINGS)).toMatchObject({ principal: '10,000.00', ordinal: 'th', borrower: 'JUAN SANTOS DELA CRUZ', total: '11,250.00' });
    expect(promissoryValues({ ...client, approvalDate: '2026-10-21' }, DEFAULT_SETTINGS).ordinal).toBe('st');
  });
  it('rejects invalid saved configuration and fills missing known values safely', () => {
    expect(mergeSettings({ general: { clientIdPrefix: 'loan', clientIdDigits: 7, unexpected: 'value' } }).general.clientIdDigits).toBe(7);
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    expect(() => mergeSettings({ general: { clientIdPrefix: '../invalid' } })).toThrow();
    expect(validLayout({ ...DEFAULT_SETTINGS.studio.index, fontSize: 9.333 })).toBe(false);
  });
  it('honors physical paper orientation', () => {
    expect(paperDimensions(DEFAULT_SETTINGS.studio.promissory, 'promissory')).toEqual({ width: 210, height: 297 });
    expect(paperDimensions({ ...DEFAULT_SETTINGS.studio.index, paper: 'letter', orientation: 'landscape' }, 'index')).toEqual({ width: 279.4, height: 215.9 });
  });
  it('escapes client content and leaves no template fields unresolved', () => {
    const malicious = { ...client, firstName: '<script>alert(1)</script>' };
    const html = renderPrintDocument(makeJob({ clients: [malicious] })).html;
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    const note = renderPrintDocument(makeJob({ kind: 'promissory', layout: DEFAULT_SETTINGS.studio.promissory })).html;
    expect(note).not.toMatch(/\{\{|NATIONAL ID|ARNAIZ|2739-4913/);
    expect(note).toContain('Valid ID');
  });
  it('changes only the displayed index amount when the principal option is selected', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.index.amountBasis = 'principal';
    expect(renderPrintDocument(makeJob({ settings })).html).toContain('Amount: <b>10,000.00</b>');
    expect(renderPrintDocument(makeJob()).html).toContain('Amount: <b>11,250.00</b>');
  });
});
