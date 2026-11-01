import type { Payment, UserProfile } from '../types';
import { monthKey, type ISODate } from './dates';
import type { ClientRow } from './loan';
import { round2, sumAmounts } from './money';

export interface DashboardStats {
  totalClients: number;
  dueCount: number;
  pendingCount: number;
  paidCount: number;
  totalPrincipal: number;
  totalOutstanding: number;
  collectedToday: number;
  collectedThisMonth: number;
}

export function computeDashboardStats(
  rows: readonly ClientRow[],
  payments: readonly Payment[],
  today: ISODate,
): DashboardStats {
  const thisMonth = monthKey(today);
  return {
    totalClients: rows.length,
    dueCount: rows.filter((row) => row.summary.status === 'due').length,
    pendingCount: rows.filter((row) => row.summary.status === 'pending').length,
    paidCount: rows.filter((row) => row.summary.status === 'paid').length,
    totalPrincipal: sumAmounts(rows.map((row) => row.client.principal)),
    totalOutstanding: sumAmounts(rows.map((row) => row.summary.outstanding)),
    collectedToday: sumAmounts(
      payments.filter((payment) => payment.paymentDate === today).map((payment) => payment.amount),
    ),
    collectedThisMonth: sumAmounts(
      payments.filter((payment) => monthKey(payment.paymentDate) === thisMonth).map((payment) => payment.amount),
    ),
  };
}

export interface CollectorActivity {
  collectorId: string;
  name: string;
  collectionsToday: number;
  amountToday: number;
  lastEntryAt: Date | null;
}

/** One row per collector showing what they have entered for today's payment date. */
export function computeCollectorActivity(
  collectors: readonly UserProfile[],
  payments: readonly Payment[],
  today: ISODate,
): CollectorActivity[] {
  const activity = new Map<string, CollectorActivity>();

  for (const collector of collectors) {
    activity.set(collector.uid, {
      collectorId: collector.uid,
      name: collector.fullName,
      collectionsToday: 0,
      amountToday: 0,
      lastEntryAt: null,
    });
  }

  for (const payment of payments) {
    if (payment.paymentDate !== today) continue;

    // Entries by someone no longer in the collector list (e.g. a removed account or an admin).
    const entry =
      activity.get(payment.collectorId) ??
      ({
        collectorId: payment.collectorId,
        name: payment.collectorName || 'Unknown',
        collectionsToday: 0,
        amountToday: 0,
        lastEntryAt: null,
      } satisfies CollectorActivity);

    entry.collectionsToday += 1;
    entry.amountToday = round2(entry.amountToday + payment.amount);
    if (payment.createdAt && (!entry.lastEntryAt || payment.createdAt > entry.lastEntryAt)) {
      entry.lastEntryAt = payment.createdAt;
    }
    activity.set(entry.collectorId, entry);
  }

  return [...activity.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Newest entries first. Falls back to the payment date when the server time is not known yet. */
export function recentPayments(payments: readonly Payment[], limit: number): Payment[] {
  const sortKey = (payment: Payment) => payment.createdAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...payments]
    .sort((a, b) => sortKey(b) - sortKey(a) || b.paymentDate.localeCompare(a.paymentDate))
    .slice(0, limit);
}
