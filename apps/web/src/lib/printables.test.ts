import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validLayout, validateSettings, type PrintableKind } from '../config/settings';
import type { Client, Payment } from '../types';
import { formatSequence } from './identifiers';
import { dailyPayable, dailySummary, indexEntries, paperDimensions, pesoWords, promissoryIdPageError, promissoryValues, summaryClients } from './printables';
import { indexCardPages, renderPrintDocument, summaryPages, type PrintJob } from './print-renderer';
import { validateClientForm } from './validation';
import { computeSchedule, summarizeLoan } from './loan';
import { addDays, formatDate } from './dates';
import { LOAN_TERMS } from '../config/app';

const client: Client = { id: 'legacy-id', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', lastName: 'Dela Cruz', middleName: 'Santos', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-10-20' };
const receipt = (id: string, amount: number, paymentDate: string, extra: Partial<Payment> = {}): Payment => ({ id, amount, paymentDate, clientId: client.id, collectorId: 'admin', collectorName: 'Admin', createdAt: null, ...extra });
const makeJob = (overrides: Partial<PrintJob> = {}): PrintJob => ({ kind: 'index', clients: [client], payments: [], holidays: [], settings: DEFAULT_SETTINGS, layout: DEFAULT_SETTINGS.studio.index, date: '2026-11-02', logoUrl: '/assets/logo.png', ...overrides });

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
  it('defaults to paid clients and preserves the saved off switch for older settings', () => {
    expect(mergeSettings({}).summary.onlyClientsWithPayments).toBe(true);
    expect(mergeSettings({ summary: { onlyClientsWithPayments: false } }).summary.onlyClientsWithPayments).toBe(false);
  });
  it('matches the collection date across loan cycles, excludes nonpayments and keeps each client once', () => {
    const others = [{ ...client, id: 'yesterday' }, { ...client, id: 'unpaid' }];
    const clients = [client, ...others];
    const payments = [receipt('a', 100, '2026-11-02', { loanId: 'old-cycle' }), receipt('b', 200, '2026-11-02'), receipt('c', 300, '2026-11-01', { clientId: 'yesterday' }), receipt('zero', 0, '2026-11-02', { clientId: 'unpaid' })];
    expect(summaryClients(clients, payments, '2026-11-02', true)).toEqual([client]);
    expect(summaryClients(clients, payments, '2026-11-01', true)).toEqual([others[0]]);
    expect(summaryClients(clients, payments, '2026-11-03', true)).toEqual([]);
    expect(summaryClients(clients, payments, '2026-11-02', false)).toEqual(clients);
  });
  it('filters before pagination and totaling, honors selected subsets and refuses an empty paid-only document', () => {
    const clients = [client, { ...client, id: 'other', lastName: 'Reyes' }];
    const job = makeJob({ kind: 'summary', clients, payments: [receipt('a', 100, '2026-11-02'), receipt('b', 200, '2026-11-02')], layout: DEFAULT_SETTINGS.studio.summary });
    const rendered = renderPrintDocument(job);
    expect(rendered.html).not.toContain('Reyes,');
    expect(rendered.html).toContain('300.00');
    expect(rendered.html).toContain('1 client with payments');
    expect(rendered.pages).toBe(1);
    const all = renderPrintDocument({ ...job, settings: { ...DEFAULT_SETTINGS, summary: { onlyClientsWithPayments: false } } });
    expect(all.html).toContain('Reyes,');
    expect(() => renderPrintDocument({ ...job, clients: [clients[1]] })).toThrow('No clients have payments');
    expect(() => renderPrintDocument({ ...job, date: '2026-11-03' })).toThrow('No clients have payments');
  });
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
  it('fills both signature columns from saved details and escapes custom identity content', () => {
    const identified: Client = { ...client, validIdType: 'Philippine Passport', validIdNumber: '00123', validIdIssuedOn: '2024-02-29', validIdIssuedAt: 'Davao', coMaker: { name: 'Maria Reyes', validIdType: '<Company & ID>', validIdNumber: '00009', validIdIssuedOn: '2023-01-01', validIdIssuedAt: 'Tagum', contactNumber: '09171234567' } };
    const html = renderPrintDocument(makeJob({ kind: 'promissory', clients: [identified], layout: DEFAULT_SETTINGS.studio.promissory })).html;
    expect(html).toContain('MARIA REYES');
    expect(html).toContain('Valid ID: Philippine Passport');
    expect(html).toContain('Valid ID: &lt;Company &amp; ID&gt;');
    expect(html).toContain('Valid ID #: 00123');
    expect(html).toContain('Valid ID #: 00009');
    expect(html).toContain(`Issued on ${formatDate('2024-02-29')} at Davao`);
    expect(html).toContain('Contact Number: 09171234567');
    expect(html).not.toMatch(/\{\{/);
  });

  it('uses per-client note text and falls back to shared defaults when reset', () => {
    expect(promissoryValues({ ...client, promissoryNote: { payee: 'Client payee', interestStatement: 'Agreed charge', executionPlace: 'Tagum' } }, DEFAULT_SETTINGS)).toMatchObject({ payee: 'Client payee', interestStatement: 'Agreed charge', executionPlace: 'Tagum' });
    const { payee, interestStatement, executionPlace } = DEFAULT_SETTINGS.promissory;
    expect(promissoryValues({ ...client, promissoryNote: { payee: '', interestStatement: '', executionPlace: '' } }, DEFAULT_SETTINGS)).toMatchObject({ payee, interestStatement, executionPlace });
    expect(promissoryValues(client, DEFAULT_SETTINGS)).toMatchObject({ coMakerName: 'N/A', validIdType: '__________', coMakerContactNumber: 'N/A' });
  });

  it.each([undefined, { name: '', contactNumber: '' }, { name: '  ', contactNumber: '\t', validIdType: ' ', validIdNumber: ' ', validIdIssuedOn: '', validIdIssuedAt: ' ' }])('prints every empty co-maker value as N/A (%j)', coMaker => {
    const values = promissoryValues({ ...client, coMaker }, DEFAULT_SETTINGS);
    for (const key of ['coMakerName', 'coMakerValidIdType', 'coMakerValidIdNumber', 'coMakerValidIdIssuedOn', 'coMakerValidIdIssuedAt', 'coMakerContactNumber']) expect(values[key]).toBe('N/A');
    expect(coMaker?.name).not.toBe('N/A'); // Display fallback never changes persisted data.
  });

  it('keeps supplied co-maker fields while missing fields print N/A', () => {
    expect(promissoryValues({ ...client, coMaker: { name: 'Maria Reyes', contactNumber: '', validIdIssuedOn: 'invalid' } }, DEFAULT_SETTINGS)).toMatchObject({ coMakerName: 'MARIA REYES', coMakerValidIdType: 'N/A', coMakerValidIdNumber: 'N/A', coMakerValidIdIssuedOn: 'N/A', coMakerValidIdIssuedAt: 'N/A', coMakerContactNumber: 'N/A' });
  });

  it('defaults the optional ID page off for existing workspaces and validates its sizes', () => {
    const settings = mergeSettings({ promissory: { payee: 'Existing payee' } });
    expect(settings.promissory.includeIdPage).toBe(false);
    const job = makeJob({ kind: 'promissory', settings, layout: settings.studio.promissory });
    expect(renderPrintDocument(job).pages).toBe(1);
    expect(renderPrintDocument(job).html).not.toContain('class="sheet promissory-id-sheet"');
    expect(validateSettings({ ...settings, promissory: { ...settings.promissory, clientIdWidthMm: NaN } })).toContain('ID box dimensions');
  });

  it('adds exactly one ID sheet after each selected note with independent saved physical sizes', () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.promissory = { ...settings.promissory, includeIdPage: true, clientIdWidthMm: 90, clientIdHeightMm: 60, coMakerIdWidthMm: 100, coMakerIdHeightMm: 65 };
    const rendered = renderPrintDocument(makeJob({ kind: 'promissory', layout: settings.studio.promissory, settings, clients: [client, { ...client, id: 'another', clientNumber: 'mcl0002' }] }));
    expect(rendered.pages).toBe(4);
    expect([...rendered.html.matchAll(/<section class="sheet ([^"]+)"/g)].map(match => match[1])).toEqual(['promissory-sheet', 'promissory-id-sheet', 'promissory-sheet', 'promissory-id-sheet']);
    expect(rendered.html.match(/Put your ID here/g)).toHaveLength(4);
    expect(rendered.html).toContain('width:90mm;height:60mm');
    expect(rendered.html).toContain('width:100mm;height:65mm');
    expect(renderPrintDocument(makeJob({ kind: 'index', settings })).pages).toBe(1);
  });

  it('rejects ID layouts that exceed paper width or height instead of scaling or clipping them', () => {
    const settings = { ...DEFAULT_SETTINGS.promissory, includeIdPage: true };
    expect(promissoryIdPageError(settings, DEFAULT_SETTINGS.studio.promissory)).toBeNull();
    expect(promissoryIdPageError({ ...settings, clientIdWidthMm: 200 }, DEFAULT_SETTINGS.studio.promissory)).toContain('do not fit');
    expect(promissoryIdPageError({ ...settings, coMakerIdHeightMm: 200 }, DEFAULT_SETTINGS.studio.promissory)).toContain('do not fit');
    expect(() => renderPrintDocument(makeJob({ kind: 'promissory', settings: { ...DEFAULT_SETTINGS, promissory: { ...settings, clientIdWidthMm: 200 } }, layout: DEFAULT_SETTINGS.studio.promissory }))).toThrow('do not fit');
  });

  it.each(['index', 'promissory', 'summary'] as const)('renders the %s default with an actual A4 page for every supported term', (kind: PrintableKind) => {
    const settings = mergeSettings({});
    const [width, height] = kind === 'promissory' ? [210, 297] : [297, 210];
    for (const loanTermDays of LOAN_TERMS) {
      const rendered = renderPrintDocument(makeJob({ kind, settings, layout: settings.studio[kind], clients: [{ ...client, loanTermDays }], payments: [receipt('a', 250, '2026-11-02')] }));
      expect(rendered.html).toContain(`@page{size:${width}mm ${height}mm;margin:0}`);
      expect(rendered.html).toContain(`--page-width:${width}mm;--page-height:${height}mm;`);
      expect(rendered.pages).toBe(1);
    }
  });

  it.each(LOAN_TERMS)('prints the actual %s-day loan due date using the shared holiday calendar', (loanTermDays) => {
    const currentClient = { ...client, loanTermDays };
    const withoutHoliday = computeSchedule(currentClient.approvalDate, loanTermDays, new Set(), '2026-11-02').dueDate;
    const holidays = [{ date: withoutHoliday, name: 'Local holiday' }];
    const actual = summarizeLoan(currentClient, [], new Set(holidays.map((holiday) => holiday.date)), '2026-11-02');
    const html = renderPrintDocument(makeJob({ clients: [currentClient], holidays })).html;
    expect(actual.dueDate > withoutHoliday).toBe(true);
    expect(html).toContain(`<div class="index-due-date">Due date: <b>${formatDate(actual.dueDate)}</b></div>`);
  });

  it('uses 30 numbered entries and preserves overflow on a continuation card', () => {
    const thirtyDayClient = { ...client, loanTermDays: 30 as const };
    const firstCard = renderPrintDocument(makeJob({ clients: [thirtyDayClient] }));
    expect(firstCard.pages).toBe(1);
    expect(firstCard.html.match(/class="index-entry"/g)).toHaveLength(30);
    expect(firstCard.html).toContain('No. of Days: <b>30</b>');
    const payments = Array.from({ length: 33 }, (_, i) => receipt(String(i), 1, addDays(client.approvalDate, i + 1)));
    expect(indexCardPages(thirtyDayClient, payments)).toEqual([{ from: 1, to: 32, rows: 8 }, { from: 33, to: 33, rows: 8 }]);
  });

  it('prints the due date using the configured Sunday policy for a 30-day loan', () => {
    const currentClient = { ...client, loanTermDays: 30 as const };
    const dates: string[] = [];
    for (const skipSundays of [false, true]) {
      const settings = structuredClone(DEFAULT_SETTINGS);
      settings.schedule.skipSundays = skipSundays;
      const dueDate = summarizeLoan(currentClient, [], new Set(), '2026-11-02', skipSundays).dueDate;
      const html = renderPrintDocument(makeJob({ clients: [currentClient], settings })).html;
      expect(html).toContain(`<div class="index-due-date">Due date: <b>${formatDate(dueDate)}</b></div>`);
      dates.push(dueDate);
    }
    expect(dates[1] > dates[0]).toBe(true);
  });

  it('repeats the due date on continuation cards and uses a renewed loan’s current terms', () => {
    const renewed: Client = { ...client, activeLoanId: '00002', transactionNumber: '00002', approvalDate: '2026-11-02' };
    const payments = Array.from({ length: 60 }, (_, i) => receipt(String(i), 1, addDays('2026-11-03', i), { loanId: '00002' }));
    const rendered = renderPrintDocument(makeJob({ clients: [renewed], payments }));
    const dueDate = formatDate(computeSchedule(renewed.approvalDate, renewed.loanTermDays, new Set(), '2026-11-02').dueDate);
    expect(rendered.pages).toBe(2);
    expect(rendered.html.match(new RegExp(`Due date: <b>${dueDate}</b>`, 'g'))).toHaveLength(2);
  });

  it('shows N/A on the promissory note when a client has no cellphone number', () => {
    expect(promissoryValues({ ...client, cellphone: '' }, DEFAULT_SETTINGS).cellphone).toBe('N/A');
  });

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
