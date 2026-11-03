import { describe, expect, it, vi } from 'vitest';
import { restorePendingReceipt } from './pending-receipt';
const receipt = { id: 'stable-id', input: { clientId: 'c', amount: 123.45, paymentDate: '2026-11-02', collectorId: 'u', collectorName: 'Collector', notes: '' } };
describe('persisted uncertain receipt recovery', () => {
  it('preserves valid legacy payloads and their untagged original loan', () => {
    const raw = JSON.stringify(receipt); const storage = { getItem: vi.fn(() => raw) };
    const result = restorePendingReceipt(storage, 'key', 'u', 'c');
    expect(result).toEqual({ pending: receipt, error: null }); expect(result.pending?.input.loanId).toBeUndefined();
  });
  it.each(['{', 'null', '[]', '{"id":"broken"}', JSON.stringify({ ...receipt, version: 99 }), JSON.stringify({ ...receipt, input: { ...receipt.input, collectorId: 'other' } })])('blocks malformed or foreign storage without discarding it: %s', raw => {
    const storage = { getItem: vi.fn(() => raw), setItem: vi.fn(), removeItem: vi.fn() };
    expect(restorePendingReceipt(storage, 'key', 'u', 'c')).toMatchObject({ pending: null, error: expect.any(String) });
    expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled();
  });
  it('blocks submission if storage is inaccessible', () => {
    expect(restorePendingReceipt({ getItem: () => { throw new Error('denied'); } }, 'key', 'u', 'c').error).toBeTruthy();
  });
});
