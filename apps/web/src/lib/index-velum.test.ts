import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, INDEX_PAPER_SIZE } from '../config/settings';
import type { Client, Payment } from '../types';
import { renderPrintDocument, type PrintJob } from './print-renderer';
import { paperDimensions } from './printables';

const client: Client = { id: 'mcl0001', clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', middleName: 'Santos', lastName: 'Dela Cruz', address: 'San Miguel', cellphone: '', principal: 10000, interest: 1250, loanTermDays: 58, approvalDate: '2026-10-20' };
const job = (count: number): PrintJob => ({ kind: 'index', clients: Array.from({ length: count }, (_, i) => ({ ...client, id: `client-${i}`, firstName: `Client ${i}` })), payments: [], holidays: [], settings: DEFAULT_SETTINGS, layout: DEFAULT_SETTINGS.studio.index, date: '2026-11-02', logoUrl: '/assets/logo.png' });

describe('index-card velum sheets', () => {
  it.each([1, 2, 3, 4, 6, 7])('groups %s selected cards into sheets of at most three', count => {
    const rendered = renderPrintDocument(job(count));
    expect(rendered.pages).toBe(Math.ceil(count / 3));
    expect(rendered.html.match(/class="sheet index-sheet"/g)).toHaveLength(Math.ceil(count / 3));
    expect(rendered.html.match(/class="index-card"/g)).toHaveLength(count);
    expect(rendered.html).toContain('@page{size:215.9mm 330.2mm;margin:0}');
    for (let i = 1; i < count; i++) expect(rendered.html.indexOf(`data-client-id="client-${i}"`)).toBeGreaterThan(rendered.html.indexOf(`data-client-id="client-${i - 1}"`));
  });

  it('counts continuation cards toward sheet capacity without dropping later payments', () => {
    const printJob = job(3);
    const payments: Payment[] = Array.from({ length: 62 }, (_, i) => ({ id: `receipt-${i}`, clientId: 'client-0', amount: 1, paymentDate: `2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(i % 28 + 1).padStart(2, '0')}`, collectorId: 'collector', collectorName: 'Collector', createdAt: null }));
    const rendered = renderPrintDocument({ ...printJob, payments });
    expect(rendered.pages).toBe(2);
    expect(rendered.html.match(/class="index-card"/g)).toHaveLength(4);
    expect(rendered.html).toContain('Card 2/2');
    expect(rendered.html).toContain('<b>62.</b>');
  });

  it.each([30, 45, 50, 58] as const)('keeps the same portrait sheet for %s-day loans and historical layout choices', loanTermDays => {
    for (const paper of ['template', 'a4', 'letter', 'legal', 'custom'] as const) {
      const layout = { ...DEFAULT_SETTINGS.studio.index, paper, orientation: 'landscape' as const, widthMm: 600, heightMm: 70 };
      expect(paperDimensions(layout, 'index', loanTermDays)).toEqual(INDEX_PAPER_SIZE);
      expect(renderPrintDocument({ ...job(1), layout, clients: [{ ...client, loanTermDays }] }).pages).toBe(1);
    }
  });
});
