import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>(), writes: vi.fn(), transactions: vi.fn(), admin: true }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./firestore-admin', () => ({
  requireAdmin: async () => { if (!fake.admin) throw new Error('An active administrator account is required.'); return { uid: 'u', fullName: 'User' }; },
  readQueryDocuments: async (_transaction: unknown, request: { clientId: string }) => [...fake.documents]
    .filter(([path, data]) => path.startsWith('payments/') && data.clientId === request.clientId)
    .map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data })),
}));
vi.mock('firebase/firestore', () => ({
  collection: () => 'payments', doc: (...parts: unknown[]) => ({ id: parts.filter(part => typeof part === 'string').join('/') }),
  Timestamp: class { constructor(public seconds: number, public nanoseconds: number) {} toDate() { return new Date(this.seconds * 1000); } },
  onSnapshot: vi.fn(), deleteDoc: vi.fn(), serverTimestamp: () => 'SERVER_TIME', deleteField: () => 'DELETE_FIELD',
  where: (_field: string, _operator: string, value: string) => ({ clientId: value }),
  query: (_collection: unknown, constraint: unknown) => constraint,
  runTransaction: async (_: unknown, callback: (tx: unknown) => Promise<void>) => {
    fake.transactions(); await callback({
      get: async (ref: { id: string }) => ({ id: ref.id.split('/').at(-1), exists: () => fake.documents.has(ref.id), data: () => fake.documents.get(ref.id) }),
      set: (ref: { id: string }, data: Record<string, unknown>) => { fake.writes(); fake.documents.set(ref.id, data); },
      update: (ref: { id: string }, data: Record<string, unknown>) => {
        fake.writes();
        const next = { ...fake.documents.get(ref.id), ...data };
        Object.keys(next).filter(key => next[key] === 'DELETE_FIELD').forEach(key => delete next[key]);
        fake.documents.set(ref.id, next);
      },
    });
  },
}));
import { Timestamp } from 'firebase/firestore';
import { addPayment, updatePayment } from './payments';
import { paymentFromDoc } from './converters';
import type { Payment } from '../types';
const input = { clientId: 'c', loanId: 'initial', amount: 100, paymentDate: '2026-11-02', collectorId: 'u', collectorName: 'User', notes: '' };
beforeEach(() => { fake.documents.clear(); fake.admin = true; vi.clearAllMocks(); });
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

describe('administrator receipt corrections', () => {
  const timestamp = new Timestamp(1793577600, 0);
  function seed(overrides: Record<string, unknown> = {}): Payment {
    fake.documents.set('clients/c', { principal: 1000, interest: 100, loanTermDays: 45, approvalDate: '2026-09-01' });
    const receipt = { ...input, collectorId: 'collector', collectorName: 'Original collector', createdAt: timestamp, ...overrides };
    fake.documents.set('payments/receipt', receipt);
    return paymentFromDoc({ id: 'receipt', data: () => receipt } as unknown as Parameters<typeof paymentFromDoc>[0]);
  }
  const correction = { amount: 150, paymentDate: '2026-10-30', notes: 'Corrected collection' };

  it('edits the receipt in place and preserves original attribution and timestamp', async () => {
    const expected = seed();
    await updatePayment('receipt', correction, expected);
    expect(fake.documents.get('payments/receipt')).toEqual({
      ...input, collectorId: 'collector', collectorName: 'Original collector', createdAt: timestamp, ...correction,
    });
    expect(fake.documents.size).toBe(2);
  });

  it('clears the legacy Android note alias so an empty correction remains empty', async () => {
    const expected = seed({ notes: undefined, note: 'Legacy collection note' });
    await updatePayment('receipt', { ...correction, notes: '' }, expected);
    expect(fake.documents.get('payments/receipt')).not.toHaveProperty('note');
    expect(fake.documents.get('payments/receipt')?.notes).toBe('');
  });

  it('retries an acknowledged-late correction without a second write', async () => {
    const expected = seed();
    await updatePayment('receipt', correction, expected);
    await updatePayment('receipt', correction, expected);
    expect(fake.writes).toHaveBeenCalledOnce();
  });

  it.each(['amount', 'paymentDate', 'notes', 'collectorName', 'collectorId', 'clientId', 'createdAt'])('rejects stale %s rather than overwriting a concurrent correction', async field => {
    const expected = seed();
    const changed: Record<string, unknown> = { amount: 120, paymentDate: '2026-11-01', notes: 'Changed elsewhere', collectorName: 'Different', collectorId: 'other', clientId: 'other', createdAt: new Timestamp(1793577601, 0) };
    fake.documents.get('payments/receipt')![field] = changed[field];
    await expect(updatePayment('receipt', correction, expected)).rejects.toThrow();
    expect(fake.writes).not.toHaveBeenCalled();
  });

  it('rechecks current-cycle receipts and excludes the receipt being edited and older loans', async () => {
    const expected = seed();
    fake.documents.set('payments/other', { ...input, amount: 950, createdAt: timestamp });
    fake.documents.set('payments/closed', { ...input, loanId: 'older', amount: 1000, createdAt: timestamp });
    await expect(updatePayment('receipt', { ...correction, amount: 151 }, expected)).rejects.toThrow('remaining payable');
    await updatePayment('receipt', correction, expected);
    expect(fake.documents.get('payments/receipt')?.amount).toBe(150);
  });

  it('allows reducing an existing overpayment and correcting its notes without increasing excess', async () => {
    const expected = seed({ amount: 200 });
    fake.documents.set('payments/other', { ...input, amount: 1000, createdAt: timestamp });
    await expect(updatePayment('receipt', { ...correction, amount: 201 }, expected)).rejects.toThrow('remaining payable');
    await updatePayment('receipt', { ...correction, amount: 150 }, expected);
    const saved = fake.documents.get('payments/receipt')!;
    const updated = paymentFromDoc({ id: 'receipt', data: () => saved } as unknown as Parameters<typeof paymentFromDoc>[0]);
    await updatePayment('receipt', { ...correction, amount: 150, notes: 'Reviewed excess' }, updated);
    expect(fake.documents.get('payments/receipt')?.notes).toBe('Reviewed excess');
  });

  it('rejects renewed loans, deleted receipts and nonadministrators', async () => {
    const expected = seed();
    fake.documents.get('clients/c')!.activeLoanId = 'renewed';
    await expect(updatePayment('receipt', correction, expected)).rejects.toThrow('loan changed');
    fake.documents.delete('payments/receipt');
    await expect(updatePayment('receipt', correction, expected)).rejects.toThrow('no longer exists');
    fake.admin = false;
    await expect(updatePayment('receipt', correction, expected)).rejects.toThrow('administrator');
    expect(fake.writes).not.toHaveBeenCalled();
  });

  it('validates amount, dates and notes at the service boundary', async () => {
    const expected = seed();
    for (const amount of [0, -1, Infinity, NaN, 1.001]) await expect(updatePayment('receipt', { ...correction, amount }, expected)).rejects.toThrow('valid payment amount');
    for (const paymentDate of ['2026-02-30', '2026-13-01']) await expect(updatePayment('receipt', { ...correction, paymentDate }, expected)).rejects.toThrow('valid payment date');
    await expect(updatePayment('receipt', { ...correction, paymentDate: '2099-01-01' }, expected)).rejects.toThrow('future');
    await expect(updatePayment('receipt', { ...correction, paymentDate: '2026-08-31' }, expected)).rejects.toThrow('before');
    await expect(updatePayment('receipt', { ...correction, notes: 'a'.repeat(1501) }, expected)).rejects.toThrow('1,500');
    expect(fake.writes).not.toHaveBeenCalled();
  });
});
