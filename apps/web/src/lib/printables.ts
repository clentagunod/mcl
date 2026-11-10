import { DEFAULT_SETTINGS, type AppSettings, type PrintLayout, type PrintableKind } from '../config/settings';
import type { Client, Payment } from '../types';
import { isISODate } from './dates';
import { round2, sumAmounts } from './money';
import { isCurrentLoanPayment } from './loan-cycle';

export function dailyPayable(client: Pick<Client, 'principal' | 'interest' | 'dailyAmount'> & { loanTermDays: number }): number {
  if (client.dailyAmount && Number.isFinite(client.dailyAmount) && client.dailyAmount > 0) return round2(client.dailyAmount);
  const total = client.principal + client.interest;
  if (!Number.isFinite(total) || !Number.isFinite(client.loanTermDays) || client.loanTermDays <= 0) throw new Error('Cannot calculate the daily amount for an invalid loan.');
  return Math.ceil((total / client.loanTermDays) * 100) / 100;
}

export const fullClientName = (client: Client) => [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ');
export const summaryClientName = (client: Client) => `${client.lastName}, ${client.firstName}${client.middleName ? ` ${client.middleName}` : ''}`;
export const publicClientId = (client: Client) => client.clientNumber || client.id;

export interface IndexEntry { day: number; amount: number; date: string }

/** One sequential slot per paying date. Missed days never introduce gaps.
 * Multiple receipts on the same date are combined; the underlying ledger is unmodified.
 */
export function indexEntries(client: Client, payments: readonly Payment[]): IndexEntry[] {
  const byDate = new Map<string, number[]>();
  for (const payment of payments) {
    if (!isCurrentLoanPayment(client, payment) || !isISODate(payment.paymentDate) || payment.amount <= 0) continue;
    const amounts = byDate.get(payment.paymentDate) ?? [];
    amounts.push(payment.amount);
    byDate.set(payment.paymentDate, amounts);
  }
  let balance = round2(client.principal + client.interest);
  const entries: IndexEntry[] = [];
  for (const [date, amounts] of [...byDate].sort(([a], [b]) => a.localeCompare(b))) {
    if (balance <= 0) break;
    const amount = sumAmounts(amounts);
    entries.push({ day: entries.length + 1, amount, date });
    balance = round2(balance - amount);
  }
  return entries;
}

export interface SummaryEntry {
  client: Client;
  transactionNumber: string;
  amount: number;
  collectors: string;
  notes: string;
}

/** Include every client, even with no collection; retain the notes and collectors of
 * each receipt so split collections are never attributed to a single collector.
 */
export function dailySummary(clients: readonly Client[], payments: readonly Payment[], date: string, defaultNote: string): SummaryEntry[] {
  const byClient = new Map<string, Payment[]>();
  for (const payment of payments) {
    if (payment.paymentDate !== date) continue;
    const entries = byClient.get(payment.clientId) ?? [];
    entries.push(payment);
    byClient.set(payment.clientId, entries);
  }
  return [...clients].sort((a, b) => summaryClientName(a).localeCompare(summaryClientName(b))).map((client) => {
    const entries = (byClient.get(client.id) ?? []).sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
    return {
      client, transactionNumber: entries.length ? [...new Set(entries.map((p) => p.loanId && p.loanId !== 'initial' ? p.loanId : client.originalTransactionNumber || client.transactionNumber || 'Pending'))].join('; ') : client.transactionNumber || 'Pending',
      amount: sumAmounts(entries.map((p) => p.amount)),
      collectors: [...new Set(entries.map((p) => p.collectorName || 'Unknown collector'))].join('; '),
      notes: [...new Set(entries.map((p) => p.notes?.trim() || defaultNote))].join('; '),
    };
  });
}

export function paperDimensions(layout: PrintLayout, kind: PrintableKind, indexTermDays = 45): { width: number; height: number } {
  const sizes = { a4: [210, 297], letter: [215.9, 279.4], legal: [215.9, 355.6] };
  const base = layout.paper === 'template'
    ? [DEFAULT_SETTINGS.studio[kind].widthMm, DEFAULT_SETTINGS.studio[kind].heightMm + (kind === 'index' ? Math.max(0, Math.ceil(indexTermDays / 4) - 12) * 5.08 : 0)]
    : layout.paper === 'custom' ? [layout.widthMm, layout.heightMm] : sizes[layout.paper];
  const [small, large] = [...base].sort((a, b) => a - b);
  return layout.orientation === 'landscape' ? { width: large, height: small } : { width: small, height: large };
}

export function summaryPageCapacity(layout: PrintLayout): number {
  const { height } = paperDimensions(layout, 'summary');
  // Each row has fixed minimum line height, with a generous header/footer allowance.
  return Math.max(1, Math.floor((height - 2 * layout.marginMm - 40) / Math.max(8, layout.fontSize * 0.8)));
}

const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
function words(n: number): string {
  if (n < 20) return smallNumbers[n];
  if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${words(n % 10)}` : ''}`;
  if (n < 1000) return `${words(Math.floor(n / 100))} hundred${n % 100 ? ` ${words(n % 100)}` : ''}`;
  for (const [value, name] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1000, 'thousand']] as const) {
    if (n >= value) return `${words(Math.floor(n / value))} ${name}${n % value ? ` ${words(n % value)}` : ''}`;
  }
  return '';
}
export function pesoWords(value: number): string {
  const centavos = Math.round(value * 100);
  if (!Number.isSafeInteger(centavos) || value < 0) throw new Error('Amount is outside the supported printable range.');
  const whole = Math.floor(centavos / 100);
  const fraction = centavos % 100;
  return `${words(whole)} ${whole === 1 ? 'peso' : 'pesos'}${fraction ? ` and ${words(fraction)} ${fraction === 1 ? 'centavo' : 'centavos'}` : ''}`.toUpperCase();
}

export function promissoryValues(client: Client, settings: AppSettings): Record<string, string> {
  const date = new Date(`${client.approvalDate}T00:00:00Z`);
  const longDate = new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
  const month = new Intl.DateTimeFormat('en-PH', { month: 'long', timeZone: 'UTC' }).format(date);
  const day = date.getUTCDate();
  const ordinal = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    principal: money(client.principal), approvalDate: longDate,
    borrower: fullClientName(client).toUpperCase(), address: client.address.toUpperCase(),
    payee: settings.promissory.payee, amountWords: pesoWords(round2(client.principal + client.interest)),
    total: money(round2(client.principal + client.interest)), term: String(client.loanTermDays),
    interestStatement: settings.promissory.interestStatement, dailyAmount: money(dailyPayable(client)),
    day: String(day), ordinal, monthYear: `${month}, ${date.getUTCFullYear()}`,
    executionPlace: settings.promissory.executionPlace, cellphone: client.cellphone || 'N/A',
    clientNumber: publicClientId(client), transactionNumber: client.transactionNumber ?? 'Pending',
  };
}
