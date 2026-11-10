import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>(), writes: vi.fn(), admin: true }));
vi.mock('../config/firebase', () => ({ db: {} }));
vi.mock('./firestore-admin', () => ({ requireAdmin: async () => {
  if (!fake.admin) throw new Error('An active administrator account is required.');
  return { uid: 'admin' };
} }));
vi.mock('firebase/firestore', () => ({
  collection: (...parts: unknown[]) => ({ path: parts.filter(part => typeof part === 'string').join('/') }),
  doc: (...parts: unknown[]) => {
    const path = parts.flatMap(part => typeof part === 'string' ? [part] : part && typeof part === 'object' && 'path' in part ? [part.path] : []).join('/');
    return { path, id: path.split('/').at(-1) };
  },
  Timestamp: class { toDate() { return new Date(0); } },
  serverTimestamp: () => 'SERVER_TIME', onSnapshot: vi.fn(),
  runTransaction: async (_db: unknown, callback: (tx: unknown) => Promise<void>) => {
    const pending = new Map<string, Record<string, unknown>>();
    await callback({
      get: async (ref: { path: string }) => ({ exists: () => fake.documents.has(ref.path), data: () => fake.documents.get(ref.path) }),
      set: (ref: { path: string }, data: Record<string, unknown>) => pending.set(ref.path, data),
    });
    for (const [path, data] of pending) { fake.writes(path, data); fake.documents.set(path, data); }
  },
}));
import { saveExpense, saveExpenseCategory, voidExpense } from './expenses';
import type { Expense, ExpenseInput } from '../types/expenses';

const input: ExpenseInput = { categoryId: 'fuel', categoryName: 'Fuel', amount: 200, expenseDate: '2026-01-02', description: 'Fuel paid', reference: 'REF-1', clientId: '', loanId: '' };
beforeEach(() => {
  fake.documents.clear(); fake.writes.mockClear(); fake.admin = true;
  fake.documents.set('expenseCategories/fuel', { name: 'Fuel', active: true, revision: 1 });
  fake.documents.set('clients/client', { approvalDate: '2026-01-01', activeLoanId: 'renewal' });
});

describe('expense persistence and concurrent corrections', () => {
  it('reuses a reserved category ID after a committed create retry', async () => {
    await saveExpenseCategory('Rent', true, undefined, 'rent');
    await saveExpenseCategory('Rent', true, undefined, 'rent');
    expect(fake.writes).toHaveBeenCalledOnce();
    await expect(saveExpenseCategory('Different', true, undefined, 'rent')).rejects.toThrow('already exists');
  });
  it('atomically records matching history and makes a committed submission retry idempotent', async () => {
    await saveExpense('stable', input);
    expect(fake.documents.get('expenses/stable/history/1')).toEqual(fake.documents.get('expenses/stable'));
    expect(fake.documents.get('expenses/stable')).toMatchObject({ amount: 200, revision: 1, createdBy: 'admin', updatedBy: 'admin', status: 'posted' });
    await saveExpense('stable', input);
    expect(fake.writes).toHaveBeenCalledTimes(2);
    await expect(saveExpense('stable', { ...input, amount: 300 })).rejects.toThrow('changed');
  });
  it('preserves attribution and prior history while rejecting stale edits', async () => {
    await saveExpense('stable', input);
    const original = fake.documents.get('expenses/stable');
    await saveExpense('stable', { ...input, amount: 300 }, 1);
    expect(fake.documents.get('expenses/stable/history/1')).toEqual(original);
    expect(fake.documents.get('expenses/stable/history/2')).toEqual(fake.documents.get('expenses/stable'));
    await expect(saveExpense('stable', { ...input, amount: 400 }, 1)).rejects.toThrow('changed');
    await saveExpense('stable', { ...input, amount: 300 }, 1);
    expect(fake.writes).toHaveBeenCalledTimes(4);
  });
  it('rejects missing/archived/renamed categories and changed or pre-release loan assignments', async () => {
    for (const changes of [{ categoryId: 'missing' }, { categoryName: 'Old name' }, { clientId: 'client', loanId: 'initial' }, { clientId: 'missing', loanId: 'initial' }, { clientId: 'client', loanId: 'renewal', expenseDate: '2025-12-31' }]) {
      await expect(saveExpense('stable', { ...input, ...changes })).rejects.toThrow();
    }
    fake.documents.set('expenseCategories/fuel', { name: 'Fuel', active: false, revision: 2 });
    await expect(saveExpense('stable', input)).rejects.toThrow('active expense type');
    expect(fake.writes).not.toHaveBeenCalled();
  });
  it('voids once with a reason, preserves financial fields, and prevents further corrections', async () => {
    await saveExpense('stable', input);
    const expense = { ...fake.documents.get('expenses/stable'), id: 'stable' } as unknown as Expense;
    await expect(voidExpense(expense, '   ')).rejects.toThrow('reason');
    await voidExpense(expense, 'Duplicate receipt');
    expect(fake.documents.get('expenses/stable')).toMatchObject({ ...input, status: 'void', voidReason: 'Duplicate receipt', revision: 2 });
    await voidExpense(expense, 'Duplicate receipt');
    expect(fake.writes).toHaveBeenCalledTimes(4);
    await expect(saveExpense('stable', input, 2)).rejects.toThrow('voided');
  });
  it('requires an active administrator and rejects stale category edits', async () => {
    const category = { id: 'fuel', name: 'Fuel', active: true, revision: 1 };
    await saveExpenseCategory('Transport', true, category);
    await expect(saveExpenseCategory('Travel', true, category)).rejects.toThrow('changed');
    fake.admin = false;
    await expect(saveExpense('stable', input)).rejects.toThrow('administrator');
    await expect(saveExpenseCategory('Other', true)).rejects.toThrow('administrator');
  });
});
