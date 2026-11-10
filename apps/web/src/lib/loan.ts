import { COUNT_APPROVAL_DATE_AS_DAY_ONE } from '../config/app';
import type { Client, LoanStatus, Payment } from '../types';
import { addDays, isISODate, isSunday, type ISODate } from './dates';
import { round2, sumAmounts } from './money';
import { isCurrentLoanPayment } from './loan-cycle';

/** Safety stop so a bad holiday list can never cause an endless loop. */
const MAX_SCAN_DAYS = 3660;

/** Sundays count by default; configured holidays remain non-collection days. */
export function isCollectionDay(date: ISODate, holidays: ReadonlySet<ISODate>, skipSundays = false): boolean {
  return (!skipSundays || !isSunday(date)) && !holidays.has(date);
}

export interface LoanSchedule {
  /** The last collection day of the loan term (the Nth collection day). */
  dueDate: ISODate;
  /** How many collection days of the term have passed up to and including `today`. */
  daysElapsed: number;
}

/**
 * Walks the calendar from the approval date, counting only collection days
 * excluding holidays and, when configured, Sundays, until the term is reached.
 */
export function computeSchedule(
  approvalDate: ISODate,
  termDays: number,
  holidays: ReadonlySet<ISODate>,
  today: ISODate,
  countApprovalDate: boolean = COUNT_APPROVAL_DATE_AS_DAY_ONE,
  skipSundays = false,
): LoanSchedule {
  if (!isISODate(approvalDate) || !Number.isInteger(termDays) || termDays <= 0 || termDays > MAX_SCAN_DAYS) {
    throw new Error('Invalid loan approval date or term. An administrator must correct the loan details.');
  }
  let cursor = countApprovalDate ? addDays(approvalDate, -1) : approvalDate;
  let counted = 0;
  let daysElapsed = 0;

  for (let scanned = 0; scanned < MAX_SCAN_DAYS; scanned += 1) {
    cursor = addDays(cursor, 1);
    if (!isCollectionDay(cursor, holidays, skipSundays)) continue;

    counted += 1;
    // ISO dates compare correctly as plain strings.
    if (cursor <= today) daysElapsed = counted;
    if (counted === termDays) return { dueDate: cursor, daysElapsed };
  }

  throw new Error(`Could not compute a due date within ${MAX_SCAN_DAYS} days of ${approvalDate}.`);
}

export interface LoanSummary {
  totalPayable: number;
  totalPaid: number;
  outstanding: number;
  dueDate: ISODate;
  daysElapsed: number;
  status: LoanStatus;
  lastPaymentDate: ISODate | null;
}

/**
 * - paid:    nothing left to pay
 * - due:     the loan term has run out (or today is the last day) and a balance remains
 * - pending: still inside the loan term with a balance remaining
 */
export function deriveStatus(outstanding: number, dueDate: ISODate, today: ISODate): LoanStatus {
  if (outstanding <= 0) return 'paid';
  return today >= dueDate ? 'due' : 'pending';
}

export function summarizeLoan(
  client: Client,
  clientPayments: readonly Payment[],
  holidays: ReadonlySet<ISODate>,
  today: ISODate,
  skipSundays = false,
): LoanSummary {
  clientPayments = clientPayments.filter((payment) => isCurrentLoanPayment(client, payment));
  const totalPayable = round2(client.principal + client.interest);
  const totalPaid = sumAmounts(clientPayments.map((payment) => payment.amount));
  const outstanding = Math.max(0, round2(totalPayable - totalPaid));
  const { dueDate, daysElapsed } = computeSchedule(
    client.approvalDate,
    client.loanTermDays,
    holidays,
    today,
    COUNT_APPROVAL_DATE_AS_DAY_ONE,
    skipSundays,
  );

  const lastPaymentDate = clientPayments.reduce<ISODate | null>(
    (latest, payment) => (latest === null || payment.paymentDate > latest ? payment.paymentDate : latest),
    null,
  );

  return {
    totalPayable,
    totalPaid,
    outstanding,
    dueDate,
    daysElapsed,
    status: deriveStatus(outstanding, dueDate, today),
    lastPaymentDate,
  };
}

export interface ClientRow {
  client: Client;
  summary: LoanSummary;
}

export function groupPaymentsByClient(payments: readonly Payment[]): Map<string, Payment[]> {
  const grouped = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = grouped.get(payment.clientId);
    if (list) list.push(payment);
    else grouped.set(payment.clientId, [payment]);
  }
  return grouped;
}

export function buildClientRows(
  clients: readonly Client[],
  payments: readonly Payment[],
  holidays: ReadonlySet<ISODate>,
  today: ISODate,
  skipSundays = false,
): ClientRow[] {
  const paymentsByClient = groupPaymentsByClient(payments);
  return clients.map((client) => ({
    client,
    summary: summarizeLoan(client, paymentsByClient.get(client.id) ?? [], holidays, today, skipSundays),
  }));
}

/** "Dela Cruz, Juan M." */
export function formatClientName(client: Pick<Client, 'lastName' | 'firstName' | 'middleName'>): string {
  const middleInitial = client.middleName ? ` ${client.middleName.charAt(0).toUpperCase()}.` : '';
  return `${client.lastName}, ${client.firstName}${middleInitial}`;
}
