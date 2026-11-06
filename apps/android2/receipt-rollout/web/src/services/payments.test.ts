import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({
  documents: new Map<string, Record<string, unknown>>(), writes: vi.fn(), transactions: vi.fn(), queue: Promise.resolve(),
}));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./firestore-admin', () => ({ requireAdmin: async () => ({ uid: 'u', fullName: 'User' }) }));
vi.mock('firebase/firestore', () => ({
  collection: () => 'payments', doc: (...parts: unknown[]) => ({ id: parts.filter(part => typeof part === 'string').join('/') }),
  Timestamp: class {}, onSnapshot: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: () => 'SERVER_TIME',
  runTransaction: (_: unknown, callback: (tx: unknown) => Promise<void>) => {
    const promise = fake.queue.then(async () => {
      fake.transactions();
      const pending = new Map<string, Record<string, unknown>>();
      const deleted = new Set<string>();
      let writing = false;
      await callback({
        get: async (ref: { id: string }) => {
          if (writing) throw new Error('Read after write');
          const data = fake.documents.get(ref.id);
          return { id: ref.id.split('/').at(-1), exists: () => !!data, data: () => data ? structuredClone(data) : undefined };
        },
        set: (ref: { id: string }, data: Record<string, unknown>) => { writing = true; pending.set(ref.id, data); },
        delete: (ref: { id: string }) => { writing = true; deleted.add(ref.id); },
      });
      pending.forEach((data, path) => { fake.writes(path, data); fake.documents.set(path, data); });
      deleted.forEach(path => { fake.writes(path, undefined); fake.documents.delete(path); });
    });
    fake.queue = promise.catch(() => {});
    return promise;
  },
}));
import { addPayment, deletePayment } from './payments';
const input = { clientId: 'c', loanId: 'initial', amount: 100, paymentDate: '2026-11-02', collectorId: 'u', collectorName: 'User', notes: '' };
beforeEach(() => {
  fake.documents.clear(); vi.clearAllMocks(); fake.queue = Promise.resolve();
  fake.documents.set('settings/receiptControl/current/config', { enabled: true, mode: 'ledger-v1' });
  fake.documents.set('clients/c', { principal: 100, interest: 0, activeLoanId: 'initial' });
  fake.documents.set('loanBalances/c', { loanId: 'initial', paidCents: 0, revision: 0, operation: 'open', receiptId: '', updatedAt: 'SERVER_TIME' });
});
describe('website stable receipt submission', () => {
  it('retries a previously committed legacy receipt without a second write', async () => {
    fake.documents.set('payments/same', { ...input, loanId: undefined, createdAt: 'SERVER_TIME' });
    await addPayment(input, 'same'); expect(fake.writes).not.toHaveBeenCalled();
  });
  it('reuses a new reserved identifier and rejects conflicting contents', async () => {
    await addPayment(input, 'stable'); await addPayment(input, 'stable');
    expect(fake.writes.mock.calls.filter(([path]) => path === 'payments/stable')).toHaveLength(1);
    expect(fake.writes.mock.calls.filter(([path]) => path === 'loanBalances/c')).toHaveLength(1);
    expect(fake.documents.get('loanBalances/c')).toMatchObject({ paidCents: 10000, revision: 1, operation: 'create', receiptId: 'stable' });
    await expect(addPayment({ ...input, amount: 101 }, 'stable')).rejects.toThrow('different details');
  });
  it('does not resurrect a deleted receipt after a delayed retry', async () => {
    fake.documents.set('receiptDeletions/stable', { payment: { ...input, createdAt: 'SERVER_TIME' } });
    await addPayment(input, 'stable');
    expect(fake.writes).not.toHaveBeenCalled();
    await expect(addPayment({ ...input, amount: 101 }, 'stable')).rejects.toThrow('different details');
  });
  it('serializes different receipt IDs through the same loan balance', async () => {
    const results = await Promise.allSettled([
      addPayment({ ...input, amount: 75 }, 'first'),
      addPayment({ ...input, amount: 75 }, 'second'),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(fake.documents.get('loanBalances/c')).toMatchObject({ paidCents: 7500, revision: 1 });
    expect([...fake.documents.keys()].filter(path => path.startsWith('payments/'))).toHaveLength(1);
  });
  it('fails closed during maintenance without a partial receipt or delta', async () => {
    fake.documents.set('settings/receiptControl/current/config', { enabled: false, mode: 'ledger-v1' });
    await expect(addPayment(input, 'paused')).rejects.toThrow('maintenance');
    expect(fake.writes).not.toHaveBeenCalled();
    expect(fake.documents.get('loanBalances/c')?.paidCents).toBe(0);
  });
  it('subtracts a deleted receipt once and preserves its immutable retry acknowledgement', async () => {
    await addPayment(input, 'stable');
    const expected = { ...input, id: 'stable', createdAt: null };
    await deletePayment('stable', expected);
    const count = fake.writes.mock.calls.length;
    await deletePayment('stable', expected);
    await addPayment(input, 'stable');
    expect(fake.writes).toHaveBeenCalledTimes(count);
    expect(fake.documents.has('payments/stable')).toBe(false);
    expect(fake.documents.get('receiptDeletions/stable')?.payment).toMatchObject(input);
    expect(fake.documents.get('loanBalances/c')).toMatchObject({ paidCents: 0, revision: 2, operation: 'delete', receiptId: 'stable' });
  });
});
