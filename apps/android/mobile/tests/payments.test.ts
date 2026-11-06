import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  readError: null as Error | null,
  queryError: null as Error | null,
  records: [] as { id: string; data: () => Record<string, unknown> }[],
  docs: {} as Record<string, Record<string, unknown>>,
  set: vi.fn(), update: vi.fn(),
}));
vi.mock('@web/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_: unknown, path: string) => path,
  doc: (_: unknown, ...parts: string[]) => parts.join('/'),
  query: () => ({}), where: () => ({}),
  getDocsFromServer: async () => { if (mocks.queryError) throw mocks.queryError; return { docs: mocks.records }; },
  serverTimestamp: () => 'SERVER_TIME',
  runTransaction: async (_: unknown, callback: (tx: unknown) => unknown) => callback({
    get: async (path: string) => { if (mocks.readError) throw mocks.readError; return { id: path.split('/').pop(), exists: () => path in mocks.docs, data: () => mocks.docs[path] }; },
    set: mocks.set, update: mocks.update,
  }),
  Timestamp: class {},
}));
import { parseAmount, saveReceipt } from '../src/payments';
const input = { clientId: 'legacy-id', amount: 100, paymentDate: '2026-01-02', collectorId: 'collector', collectorName: 'Test Collector', notes: '' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.records = [];
  mocks.readError = null; mocks.queryError = null;
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
    expect(mocks.set).toHaveBeenCalledWith('payments/receipt-1', { ...input, loanId: 'initial', createdAt: 'SERVER_TIME' });
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
    mocks.docs['settings/Configurations/elements/paymentPolicy'] = { enforceDailyMinimum: false };
    mocks.records = [{ id: 'other', data: () => ({ clientId: input.clientId, amount: 1050 }) }];
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('outstanding balance');
  });
  it('rejects inactive collectors', async () => {
    mocks.docs['users/collector'].active = false;
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('access has changed');
  });
  it('keeps saved corrections admin-only under the renewal contract', async () => {
    mocks.docs['payments/receipt-1'] = input;
    await expect(saveReceipt('receipt-1', { ...input, amount: 200 }, { ...input, id: 'receipt-1', createdAt: null })).rejects.toThrow('administrator');
  });
  it('rejects corrections to another collector receipt', async () => {
    mocks.docs['payments/receipt-1'] = { ...input, collectorId: 'other' };
    await expect(saveReceipt('receipt-1', input, { ...input, id: 'receipt-1', createdAt: null })).rejects.toThrow('administrator');
  });
  it.each(['admin', 'developer'])('allows %s settlements and corrections', async role => {
    mocks.docs['users/collector'].role = role;
    mocks.docs['payments/receipt-1'] = input;
    await saveReceipt('receipt-1', { ...input, amount: 50 }, { ...input, id: 'receipt-1', createdAt: null });
    expect(mocks.update).toHaveBeenCalledWith('payments/receipt-1', { amount: 50, paymentDate: input.paymentDate, notes: '' });
  });
  it.each(['admin', 'developer'])('allows %s to create a below-minimum settlement', async role => {
    mocks.docs['users/collector'].role = role;
    await saveReceipt('settlement', { ...input, amount: 50 });
    expect(mocks.set).toHaveBeenCalledWith('payments/settlement', expect.objectContaining({ amount: 50, createdAt: 'SERVER_TIME' }));
  });
  it.each(['developer', 'unknown', 'Developer'])('rejects inactive or invalid role %s before writing', async role => {
    mocks.docs['users/collector'] = { role, active: role !== 'developer' };
    await expect(saveReceipt('receipt-1', input)).rejects.toThrow('access has changed');
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('protects corrections from stale forms', async () => {
    mocks.docs['users/collector'].role = 'admin';
    mocks.docs['payments/receipt-1'] = { ...input, amount: 200 };
    await expect(saveReceipt('receipt-1', input, { ...input, id: 'receipt-1', createdAt: null })).rejects.toThrow('changed elsewhere');
  });
});

describe('renewal submission boundary', () => {
  it.each([
    ['admin', 'initial'], ['admin', '00002'],
    ['developer', 'initial'], ['developer', '00002'],
  ])('preserves receipt creation time and attribution when %s corrects loan %s', async (role, loanId) => {
    mocks.docs['users/collector'].role = role;
    mocks.docs['clients/legacy-id'].activeLoanId = loanId;
    const createdAt = new Date('2026-01-02T01:23:45Z');
    const original = { ...input, loanId, collectorId: 'original-collector', collectorName: 'Original Collector', createdAt };
    mocks.docs['payments/receipt-1'] = original;
    const previous = { ...original, id: 'receipt-1' };
    await saveReceipt('receipt-1', { ...input, loanId, amount: 50, notes: 'Corrected' }, previous);
    expect(mocks.update).toHaveBeenCalledWith('payments/receipt-1', { amount: 50, paymentDate: input.paymentDate, notes: 'Corrected' });
    const updated = { ...original, ...mocks.update.mock.calls[0][1] };
    expect(updated.createdAt).toBe(createdAt);
    expect(updated.collectorId).toBe('original-collector');
    expect(updated.collectorName).toBe('Original Collector');
    expect(updated.loanId).toBe(loanId);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('rejects a stale open form after renewal without writing', async () => {
    mocks.docs['clients/legacy-id'].activeLoanId='00002';
    await expect(saveReceipt('stale',input)).rejects.toThrow('renewed');
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('does not retag a persisted untagged queue after renewal', async () => {
    const queued=JSON.parse(JSON.stringify(input));
    mocks.docs['clients/legacy-id'].activeLoanId='00002';
    await expect(saveReceipt('queued',queued)).rejects.toThrow('renewed');
    expect(queued.loanId).toBeUndefined();
  });
  it('excludes historical payments from the current server balance', async () => {
    mocks.docs['clients/legacy-id'].activeLoanId='00002';
    mocks.records=[{id:'old',data:()=>({...input,amount:1100})}];
    await saveReceipt('new',{...input,loanId:'00002'});
    expect(mocks.set).toHaveBeenCalledWith('payments/new',expect.objectContaining({loanId:'00002'}));
  });
  it('retries an uncertain receipt with the same ID without duplication', async () => {
    const failure=Object.assign(new Error('Offline'),{code:'unavailable'});
    mocks.queryError=failure;
    await expect(saveReceipt('stable',input)).rejects.toBe(failure);
    expect(mocks.set).not.toHaveBeenCalled();
    mocks.queryError=null;
    mocks.docs['payments/stable']={...input,loanId:'initial'};
    mocks.docs['clients/legacy-id'].activeLoanId='00002';
    await saveReceipt('stable',input);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('will not recognize a receipt from a different cycle as the same attempt', async () => {
    mocks.docs['payments/same']={...input,loanId:'00002'};
    await expect(saveReceipt('same',input)).rejects.toThrow('different details');
  });
  it.each(['permission-denied','unavailable'])('blocks failed server reads: %s', async code => {
    const error=Object.assign(new Error(code),{code});
    mocks.readError=error;
    await expect(saveReceipt('blocked',input)).rejects.toBe(error);
    expect(mocks.set).not.toHaveBeenCalled();
  });
  it('directs a below-minimum balance to an administrator', async () => {
    mocks.records=[{id:'partial',data:()=>({...input,amount:1050})}];
    await expect(saveReceipt('final',input)).rejects.toThrow('Remaining balance');
  });
  it('checks a changed policy on submission', async () => {
    mocks.docs['settings/Configurations/elements/paymentPolicy']={enforceDailyMinimum:true};
    await expect(saveReceipt('policy',{...input,amount:50})).rejects.toThrow('daily amount');
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
