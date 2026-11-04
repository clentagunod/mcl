import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>(), writes: vi.fn(), transactions: vi.fn() }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./firestore-admin', () => ({ requireAdmin: async () => ({ uid: 'u', fullName: 'User' }) }));
vi.mock('firebase/firestore', () => ({
  collection: () => 'payments', doc: (...parts: unknown[]) => ({ id: parts.filter(part => typeof part === 'string').join('/') }),
  Timestamp: class {}, onSnapshot: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (_: unknown, callback: (tx: unknown) => Promise<void>) => {
    fake.transactions(); await callback({
      get: async (ref: { id: string }) => ({ exists: () => fake.documents.has(ref.id), data: () => fake.documents.get(ref.id) }),
      set: (ref: { id: string }, data: Record<string, unknown>) => { fake.writes(); fake.documents.set(ref.id, data); },
    });
  },
}));
import { addPayment } from './payments';
const input = { clientId: 'c', loanId: 'initial', amount: 100, paymentDate: '2026-11-02', collectorId: 'u', collectorName: 'User', notes: '' };
beforeEach(() => { fake.documents.clear(); vi.clearAllMocks(); });
describe('website stable receipt submission', () => {
  it('retries a previously committed legacy receipt without a second write', async () => {
    fake.documents.set('payments/same', { ...input, loanId: undefined, createdAt: 'SERVER_TIME' });
    await addPayment(input, 'same'); expect(fake.writes).not.toHaveBeenCalled();
  });
  it('reuses a new reserved identifier and rejects conflicting contents', async () => {
    await addPayment(input, 'stable'); await addPayment(input, 'stable');
    expect(fake.writes).toHaveBeenCalledOnce();
    await expect(addPayment({ ...input, amount: 101 }, 'stable')).rejects.toThrow('different details');
  });
  it('does not resurrect a deleted receipt after a delayed retry', async () => {
    fake.documents.set('receiptDeletions/stable', { payment: { ...input, createdAt: 'SERVER_TIME' } });
    await addPayment(input, 'stable');
    expect(fake.writes).not.toHaveBeenCalled();
    await expect(addPayment({ ...input, amount: 101 }, 'stable')).rejects.toThrow('different details');
  });
});
