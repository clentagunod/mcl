import { describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ next: null as null | ((snapshot: { docs: { id: string; data: () => Record<string, unknown> }[]; metadata: { fromCache: boolean; hasPendingWrites: boolean } }) => void) }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {}, onSnapshot: (_: unknown, __: unknown, next: typeof fake.next) => { fake.next = next; return () => {}; },
}));
import { subscribeToQuery } from './subscribe';
import { clientFromDoc, paymentFromDoc } from './converters';
import type { Query } from 'firebase/firestore';
const client = { principal: 1000, interest: 100, loanTermDays: 45, approvalDate: '2026-11-01' };
describe('financial feed isolation and freshness', () => {
  it('isolates a malformed client while warning about incomplete totals and retains server metadata', () => {
    const onData = vi.fn(), onError = vi.fn(); subscribeToQuery({} as Query, clientFromDoc, onData, onError);
    fake.next!({ docs: [{ id: 'good', data: () => client }, { id: 'bad', data: () => ({ ...client, approvalDate: '' }) }], metadata: { fromCache: true, hasPendingWrites: false } });
    expect(onData.mock.calls[0][0]).toHaveLength(1); expect(onData.mock.calls[0][0][0].id).toBe('good');
    expect(onData.mock.calls[0][1].fromCache).toBe(true); expect(onError.mock.calls[0][0].message).toContain('bad');
    expect(onError.mock.calls[0][0].message).toContain('Totals may be incomplete');
  });
  it('rejects a poisoned receipt instead of converting Infinity into a zero payment', () => {
    const onData = vi.fn(), onError = vi.fn(); subscribeToQuery({} as Query, paymentFromDoc, onData, onError);
    fake.next!({ docs: [{ id: 'poisoned', data: () => ({ amount: Infinity, clientId: 'c', paymentDate: '2026-11-02' }) }], metadata: { fromCache: false, hasPendingWrites: false } });
    expect(onData.mock.calls[0][0]).toEqual([]); expect(onError.mock.calls[0][0].message).toContain('poisoned');
  });
});
