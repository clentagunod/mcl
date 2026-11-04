import type { Payment } from '../types';
import { addDays, isISODate, type ISODate } from './dates';
import { round2 } from './money';

export type CollectionTrendDays = 7 | 14 | 30;
export interface DailyCollection {
  date: ISODate;
  amount: number;
  receipts: number;
}

/** Calendar days, including today. Entry timestamps never change the collection date. */
export function buildCollectionTrend(payments: readonly Payment[], today: ISODate, days: CollectionTrendDays): DailyCollection[] {
  if (!isISODate(today) || ![7, 14, 30].includes(days)) throw new Error('Choose a valid collection date and chart range.');
  const series = Array.from({ length: days }, (_, index) => ({ date: addDays(today, index - days + 1), amount: 0, receipts: 0 }));
  const byDate = new Map(series.map(point => [point.date, point]));
  for (const payment of payments) {
    const point = byDate.get(payment.paymentDate);
    if (!point) continue;
    point.amount = round2(point.amount + payment.amount);
    point.receipts += 1;
  }
  return series;
}
