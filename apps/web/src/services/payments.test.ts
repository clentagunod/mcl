import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ enabled: false, server: vi.fn(), documents: new Map<string, Record<string, unknown>>(), writes: vi.fn(), transactions: vi.fn() }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./receipt-backend', () => ({ get receiptBackendEnabled() { return fake.enabled; }, writeServerReceipt: fake.server }));
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: (_: unknown, id?: string) => ({ id: id ?? 'operation-id' }),
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
beforeEach(() => { fake.enabled = false; fake.documents.clear(); vi.clearAllMocks(); });
describe('website stable receipt submission', () => {
  it('retries a previously committed legacy receipt without a second write', async () => {
    fake.documents.set('same', { ...input, loanId: undefined, createdAt: 'SERVER_TIME' });
    await addPayment(input, 'same'); expect(fake.writes).not.toHaveBeenCalled();
  });
  it('reuses a new reserved identifier and rejects conflicting contents', async () => {
    await addPayment(input, 'stable'); await addPayment(input, 'stable');
    expect(fake.writes).toHaveBeenCalledOnce();
    await expect(addPayment({ ...input, amount: 101 }, 'stable')).rejects.toThrow('different details');
  });
  it('routes to the trusted backend and never falls back on an uncertain result', async () => {
    fake.enabled = true; fake.server.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(addPayment(input, 'stable')).rejects.toThrow('Unavailable');
    expect(fake.server).toHaveBeenCalledWith('create', 'stable', 'stable', input);
    expect(fake.transactions).not.toHaveBeenCalled(); expect(fake.writes).not.toHaveBeenCalled();
  });
});
