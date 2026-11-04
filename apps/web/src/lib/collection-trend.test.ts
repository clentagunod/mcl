import { describe, expect, it } from 'vitest';
import type { Payment } from '../types';
import { buildCollectionTrend } from './collection-trend';

const receipt = (paymentDate: string, amount: number): Payment => ({ id: `${paymentDate}-${amount}`, clientId: 'client',
  paymentDate, amount, collectorId: 'collector', collectorName: 'Collector', createdAt: new Date('2026-11-04T08:00:00Z') });

describe('collection trend', () => {
  it('combines receipts by collection date and fills every missing day with zero', () => {
    const points = buildCollectionTrend([receipt('2026-11-01', 0.1), receipt('2026-11-01', 0.2), receipt('2026-11-04', 150)], '2026-11-04', 7);
    expect(points).toHaveLength(7);
    expect(points[0]).toEqual({ date: '2026-10-29', amount: 0, receipts: 0 });
    expect(points.find(point => point.date === '2026-11-01')).toEqual({ date: '2026-11-01', amount: 0.3, receipts: 2 });
    expect(points.at(-1)).toEqual({ date: '2026-11-04', amount: 150, receipts: 1 });
    expect(points.filter(point => point.receipts === 0)).toHaveLength(5);
  });

  it('uses an inclusive date window and excludes future and older receipts', () => {
    const points = buildCollectionTrend([receipt('2026-10-28', 999), receipt('2026-10-29', 10), receipt('2026-11-04', 20), receipt('2026-11-05', 999)], '2026-11-04', 7);
    expect(points.reduce((total, point) => total + point.amount, 0)).toBe(30);
  });

  it('handles leap days and year boundaries using calendar dates', () => {
    expect(buildCollectionTrend([], '2024-03-01', 7).map(point => point.date)).toContain('2024-02-29');
    const points = buildCollectionTrend([], '2027-01-04', 14);
    expect(points[0].date).toBe('2026-12-22');
    expect(points.at(-1)?.date).toBe('2027-01-04');
    expect(buildCollectionTrend([], '2026-11-04', 30)).toHaveLength(30);
  });
});
