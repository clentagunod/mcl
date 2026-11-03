import type { AppSettings, PrintLayout, PrintableKind } from '../config/settings';
import type { Client, Payment } from '../types';
import noteTemplate from '../templates/promissory.html?raw';
import printStyles from '../print.css?raw';
import { formatDate } from './dates';
import { round2, sumAmounts } from './money';
import { dailyPayable, dailySummary, fullClientName, indexEntries, paperDimensions, promissoryValues, publicClientId, summaryClientName, type SummaryEntry } from './printables';

export interface PrintJob {
  kind: PrintableKind;
  clients: readonly Client[];
  /** Total available clients, so a filtered summary can identify its scope. */
  totalClients?: number;
  payments: readonly Payment[];
  settings: AppSettings;
  layout: PrintLayout;
  date: string;
  logoUrl: string;
}
export const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const printMoney = (amount: number) => amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const printableTitles: Record<PrintableKind, string> = { index: 'Index Card', promissory: 'Promissory Note', summary: 'Daily Summary Sheet' };

export function indexCardPages(client: Client, payments: readonly Payment[]): { from: number; to: number; rows: number }[] {
  const count = Math.max(client.loanTermDays, indexEntries(client, payments).length);
  const rows = Math.ceil(client.loanTermDays / 4);
  const capacity = rows * 4;
  return Array.from({ length: Math.ceil(count / capacity) }, (_, i) => ({ from: i * capacity + 1, to: Math.min(count, (i + 1) * capacity), rows }));
}

function indexCards(job: PrintJob): string[] {
  const { index } = job.settings;
  return job.clients.flatMap((client) => {
    const entries = indexEntries(client, job.payments);
    const pages = indexCardPages(client, job.payments);
    return pages.map((page, pageIndex) => {
      const grid = Array.from({ length: page.rows }, (_, row) => `<tr>${Array.from({ length: 4 }, (_, col) => {
        const day = page.from + col * page.rows + row;
        if (day > page.to) return '<td class="unused-cell"></td>';
        const entry = entries[day - 1];
        return `<td><div class="index-entry"><b>${day}.</b><span>${entry ? printMoney(entry.amount) : ''}</span><span>${entry ? escapeHtml(formatDate(entry.date)) : ''}</span><span class="signature-line" aria-label="Signature (blank)"></span></div></td>`;
      }).join('')}</tr>`).join('');
      const amount = index.amountBasis === 'principal' ? client.principal : round2(client.principal + client.interest);
      return `<section class="sheet index-sheet"><div class="sheet-body">
        <header class="index-heading"><img src="${escapeHtml(job.logoUrl)}" alt="MCL Lending logo"><h1>${escapeHtml(index.businessName.toUpperCase())}</h1></header>
        <div class="index-subheading"><i>${escapeHtml(index.branch)}</i><strong>BORROWER’S COPY</strong><strong>MOBILE #: ${escapeHtml(index.mobile)}</strong></div>
        <div class="index-details"><div>Name: <b>${escapeHtml(fullClientName(client))}</b></div><div>Date: <b>${escapeHtml(formatDate(client.approvalDate))}</b></div><div>Address: <b>${escapeHtml(client.address)}</b></div><div>Amount: <b>${printMoney(amount)}</b></div><div>No. of Days: <b>${client.loanTermDays}</b></div><div>Daily: <b>${printMoney(dailyPayable(client))}</b></div></div>
        <div class="index-reference">${escapeHtml(publicClientId(client))} · Transaction ${escapeHtml(client.transactionNumber || 'Pending')} ${pages.length > 1 ? `· Card ${pageIndex + 1}/${pages.length}` : ''}</div>
        <table class="index-grid" aria-label="Sequential paying days"><tbody>${grid}</tbody></table>
      </div></section>`;
    });
  });
}

function promissoryNotes(job: PrintJob): string[] {
  return job.clients.map((client) => {
    const values = promissoryValues(client, job.settings);
    const body = noteTemplate.replace(/\{\{(\w+)\}\}/g, (_, key: string) => escapeHtml(values[key] ?? ''));
    return `<section class="sheet promissory-sheet"><div class="sheet-body"><div class="note-brand"><img src="${escapeHtml(job.logoUrl)}" alt="MCL Lending logo"><span>${escapeHtml(publicClientId(client))} · Transaction ${escapeHtml(client.transactionNumber || 'Pending')}</span></div>${body}</div></section>`;
  });
}

/** Estimate wrapped rows conservatively. Preview measurement additionally catches
 * unusually long notes/names before printing, rather than silently clipping them.
 */
export function summaryPages(entries: readonly SummaryEntry[], layout: PrintLayout): SummaryEntry[][] {
  const { width, height } = paperDimensions(layout, 'summary');
  const usableWidth = width - 2 * layout.marginMm;
  const usableHeight = height - 2 * layout.marginMm - 40;
  const result: SummaryEntry[][] = [[]];
  let used = 0;
  for (const entry of entries) {
    const cells: [string, number][] = [[summaryClientName(entry.client), .19], [publicClientId(entry.client), .09], [entry.collectors, .15], [entry.notes, .28]];
    const lines = Math.max(1, ...cells.map(([s, fraction]) => Math.ceil(s.length / Math.max(1, (usableWidth * fraction - 3) / (layout.fontSize * .19)))));
    const rowHeight = lines * layout.fontSize * .43 + 3;
    if (used + rowHeight > usableHeight && result[result.length - 1].length) { result.push([]); used = 0; }
    result[result.length - 1].push(entry); used += rowHeight;
  }
  return result;
}

function summaries(job: PrintJob): string[] {
  const entries = dailySummary(job.clients, job.payments, job.date, job.settings.general.defaultPaymentNote);
  const pages = summaryPages(entries, job.layout);
  let index = 0;
  return pages.map((page, pageIndex) => `<section class="sheet summary-sheet"><div class="sheet-body">
    <header class="summary-heading"><img src="${escapeHtml(job.logoUrl)}" alt="MCL Lending logo"><div><h1>DAILY SUMMARY SHEET</h1><p>${escapeHtml(job.settings.index.businessName)} · ${escapeHtml(job.settings.index.branch)}</p><p class="summary-scope">${job.totalClients !== undefined && job.clients.length < job.totalClients ? `${job.clients.length} of ${job.totalClients} clients selected` : 'All clients'}</p></div><div class="summary-meta"><b>${escapeHtml(formatDate(job.date))}</b><br>Page ${pageIndex + 1} of ${pages.length}</div></header>
    <table class="summary-table"><colgroup>${[3, 7, 9, 19, 9, 10, 15, 28].map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${['Index', 'Transaction number', 'Client ID', 'Client Name [Last–First–Middle]', 'Amount', 'Date', 'Collected by', 'Notes'].map((s) => `<th>${s}</th>`).join('')}</tr></thead>
    <tbody>${page.length ? page.map((entry) => `<tr><td>${++index}</td><td>${escapeHtml(entry.transactionNumber || 'Pending')}</td><td>${escapeHtml(publicClientId(entry.client))}</td><td>${escapeHtml(summaryClientName(entry.client))}</td><td class="num">${printMoney(entry.amount)}</td><td>${escapeHtml(formatDate(job.date))}</td><td>${escapeHtml(entry.collectors || '—')}</td><td>${escapeHtml(entry.notes || '—')}</td></tr>`).join('') : '<tr><td colspan="8">No clients available.</td></tr>'}</tbody>
    ${pageIndex === pages.length - 1 ? `<tfoot><tr><th colspan="4">Grand total (PHP)</th><td class="num"><strong>${printMoney(sumAmounts(entries.map((e) => e.amount)))}</strong></td><td colspan="3">${entries.length} clients · ${entries.filter((e) => e.amount > 0).length} with collections</td></tr></tfoot>` : ''}</table>
    <footer class="summary-footer">Prepared by: ________________________ <span>Checked by: ________________________</span></footer>
    </div></section>`);
}

export function renderPrintDocument(job: PrintJob): { html: string; pages: number } {
  const size = paperDimensions(job.layout, job.kind, Math.max(45, ...job.clients.map((c) => c.loanTermDays)));
  const pages = job.kind === 'index' ? indexCards(job) : job.kind === 'promissory' ? promissoryNotes(job) : summaries(job);
  const variables = `:root{--page-width:${size.width}mm;--page-height:${size.height}mm;--page-margin:${job.layout.marginMm}mm;--print-font:${job.layout.fontSize}pt;--heading-accent:${job.settings.index.headingColor};--cell-accent:${job.settings.index.cellColor}} @page{size:${size.width}mm ${size.height}mm;margin:0}`;
  return {
    html: `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${printableTitles[job.kind]} – ${escapeHtml(job.date)}</title><style>${printStyles}\n${variables}</style></head><body>${pages.join('')}</body></html>`,
    pages: pages.length,
  };
}
