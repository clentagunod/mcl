import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  records: [] as { id: string; data: () => Record<string, unknown> }[],
  docs: {} as Record<string, Record<string, unknown>>,
  set: vi.fn(), update: vi.fn(),
}));
vi.mock('@web/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => path,
  doc: (_: unknown, ...parts: string[]) => parts.join('/'),
  query: () => ({}), where: () => ({}),
  getDocsFromServer: async () => ({ docs: mocks.records }),
  serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (_: unknown, callback: (tx: unknown) => unknown) => callback({
    get: async (path: string) => ({ id: path.split('/').pop(), exists: () => path in mocks.docs, data: () => mocks.docs[path] }),
    set: mocks.set, update: mocks.update,
  }),
  Timestamp: class {},
}));
import { parseAmount, saveReceipt } from '../src/payments';
const input = { clientId: 'legacy-id', amount: 100, paymentDate: '2026-01-02', collectorId: 'collector', collectorName: 'Test Collector', notes: '' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records = [];
  mocks.docs = {
    'users/collector': { role: 'collector', active: true },
    'clients/legacy-id': { principal: 1000, interest: 100, loanTermDays: 45, approvalDate: '2026-01-01', dailyAmount: 100 },
    'settings/Configurations/elements/paymentPolicy': { enforceDailyMinimum: true },
  };
});
describe('receipt boundary', () => {
  it.each(['0', '-1', 'NaN', 'Infinity', '1e2', '1.001', '', '999999999999999999999'])('rejects invalid money %s', value => expect(() => parseAmount(value)).toThrow());
  it('accepts centavos', () => expect(parseAmount('123.45')).toBe(123.45));
  it('writes the rules-compatible receipt with a server timestamp', async () => {
    await saveReceipt('receipt-1', input);
    expect(mocks.set).toHaveBeenCalledWith('payments/receipt-1', { ...input, createdAt: 'SERVER_TIME' });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('recognizes a committed retry without writing it twice', async () => {
    mocks.docs['payments/receipt-1'] = { ...input, createdAt: 'SERVER_TIME' };
    await saveReceipt('receipt-1', input);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('refuses a reused ID with different contents', async () => {
    mocks.docs['payments/receipt-1'] = { ...input, amount: 200 };
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('different details');
  });
  it('enforces the current minimum', async () => {
    await expect(saveReceipt('receipt-1', { ...input, amount: 50 })).rejects.toThrow('required daily amount');
  });
  it('allows a partial payment with the policy off', async () => {
    mocks.docs['settings/Configurations/elements/paymentPolicy'] = { enforceDailyMinimum: false };
    await saveReceipt('receipt-1', { ...input, amount: 50 });
    expect(mocks.set).toHaveBeenCalled();
  });
  it('rejects overpayment using fresh receipts', async () => {
    mocks.records = [{ id: 'other', data: () => ({ amount: 1050 }) }];
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('outstanding balance');
  });
  it('rejects inactive collectors', async () => {
    mocks.docs['users/collector'].active = false;
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('access has changed');
  });
  it('allows collectors to correct their own receipts', async () => {
    mocks.docs['payments/receipt-1'] = input;
    await saveReceipt('receipt-1', { ...input, amount: 200 }, { ...input, id: 'receipt-1', createdAt: null });
    expect(mocks.update).toHaveBeenCalledWith('payments/receipt-1', { amount: 200, paymentDate: input.paymentDate, notes: '' });
  });
  it('rejects corrections to another collector receipt', async () => {
    mocks.docs['payments/receipt-1'] = { ...input, collectorId: 'other' };
    await expect(saveReceipt('receipt-1', input, { ...input, id: 'receipt-1', createdAt: null })).rejects.toThrow('only edit your own');
  });
  it('allows administrator settlements and corrections', async () => {
    mocks.docs['users/collector'].role = 'admin';
    mocks.docs['payments/receipt-1'] = input;
    await saveReceipt('receipt-1', { ...input, amount: 50 }, { ...input, id: 'receipt-1', createdAt: null });
    expect(mocks.update).toHaveBeenCalledWith('payments/receipt-1', { amount: 50, paymentDate: input.paymentDate, notes: '' });
  });
  it('protects corrections from stale forms', async () => {
    mocks.docs['users/collector'].role = 'admin';
    mocks.docs['payments/receipt-1'] = { ...input, amount: 200 };
    await expect(saveReceipt('receipt-1', input, { ...input, id: 'receipt-1', createdAt: null })).rejects.toThrow('changed elsewhere');
  });
});
