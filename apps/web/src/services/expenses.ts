import { collection, doc, runTransaction, serverTimestamp, Timestamp, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Expense, ExpenseCategory, ExpenseInput } from '../types/expenses';
import { validateExpense } from '../lib/accounting';
import { isISODate } from '../lib/dates';
import { isMoney } from '../lib/money';
import { requireAdmin } from './firestore-admin';
import { subscribeToQuery, type Subscribe } from './subscribe';

function categoryFromDoc(snapshot: QueryDocumentSnapshot): ExpenseCategory {
  const data = snapshot.data();
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80
    || typeof data.active !== 'boolean' || !Number.isInteger(data.revision) || data.revision < 1) throw new Error(`Expense type ${snapshot.id} is invalid.`);
  return { id: snapshot.id, name: data.name, active: data.active, revision: data.revision };
}

export function expenseFromDoc(snapshot: QueryDocumentSnapshot): Expense {
  const data = snapshot.data({ serverTimestamps: 'estimate' });
  if (!isMoney(data.amount) || data.amount <= 0 || !isISODate(data.expenseDate)
    || !['posted', 'void'].includes(data.status) || !Number.isInteger(data.revision) || data.revision < 1
    || !['categoryId', 'categoryName', 'description', 'reference', 'clientId', 'loanId', 'voidReason', 'createdBy', 'updatedBy'].every(key => typeof data[key] === 'string')
    || !data.categoryId || !data.categoryName.trim() || !data.description.trim() || !!data.clientId !== !!data.loanId
    || data.categoryName.length > 80 || data.description.length > 500 || data.reference.length > 120
    || !(data.createdAt instanceof Timestamp) || !(data.updatedAt instanceof Timestamp)) throw new Error(`Expense ${snapshot.id} is invalid. Financial totals may be incomplete.`);
  return { id: snapshot.id, categoryId: data.categoryId, categoryName: data.categoryName, amount: data.amount,
    expenseDate: data.expenseDate, description: data.description, reference: data.reference,
    clientId: data.clientId, loanId: data.loanId, status: data.status, voidReason: data.voidReason,
    revision: data.revision, createdBy: data.createdBy, createdAt: data.createdAt.toDate(), updatedBy: data.updatedBy, updatedAt: data.updatedAt.toDate() };
}

export const subscribeExpenses: Subscribe<Expense> = (onData, onError) => subscribeToQuery(collection(db, 'expenses'), expenseFromDoc, onData, onError);
export const subscribeExpenseCategories: Subscribe<ExpenseCategory> = (onData, onError) => subscribeToQuery(collection(db, 'expenseCategories'), categoryFromDoc, onData, onError);
export function subscribeExpenseHistory(id: string, onData: (rows: Expense[]) => void, onError: (error: Error) => void) {
  return subscribeToQuery(collection(db, 'expenses', id, 'history'), expenseFromDoc, onData, onError);
}
export const reserveExpenseId = () => doc(collection(db, 'expenses')).id;
export const reserveExpenseCategoryId = () => doc(collection(db, 'expenseCategories')).id;

export async function saveExpenseCategory(name: string, active: boolean, expected?: ExpenseCategory, reservedId?: string): Promise<void> {
  name = name.trim();
  if (!name || name.length > 80) throw new Error('Enter an expense type of up to 80 characters.');
  const ref = doc(db, 'expenseCategories', expected?.id ?? reservedId ?? reserveExpenseCategoryId());
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const snapshot = await transaction.get(ref);
    if (!expected && snapshot.exists()) {
      const current = snapshot.data();
      if (current.revision === 1 && current.name === name && current.active === active) return;
      throw new Error('This expense type already exists. Reopen it before saving.');
    }
    if (expected && (!snapshot.exists() || snapshot.data().revision !== expected.revision)) throw new Error('This expense type changed. Reopen it before saving.');
    transaction.set(ref, { name, active, revision: (expected?.revision ?? 0) + 1, updatedAt: serverTimestamp(), updatedBy: actor.uid });
  });
}

/** Stable IDs make retries idempotent. Every correction has an immutable history entry. */
export async function saveExpense(id: string, input: ExpenseInput, expectedRevision = 0): Promise<void> {
  const clean: ExpenseInput = { categoryId: input.categoryId, categoryName: input.categoryName, amount: input.amount,
    expenseDate: input.expenseDate, description: input.description.trim(), reference: input.reference.trim(), clientId: input.clientId, loanId: input.loanId };
  const error = validateExpense(clean);
  if (error) throw new Error(error);
  const ref = doc(db, 'expenses', id);
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.status === 'posted' && current.revision === expectedRevision + 1
      && Object.entries(clean).every(([key, value]) => current[key] === value)) return;
    if ((current?.revision ?? 0) !== expectedRevision || current?.status === 'void') throw new Error('This expense changed or was voided. Reopen it before saving.');
    const category = await transaction.get(doc(db, 'expenseCategories', clean.categoryId));
    if (!category.exists() || category.data().active !== true) throw new Error('Choose an active expense type.');
    if (category.data().name !== clean.categoryName) throw new Error('The expense type changed. Select it again.');
    if (clean.clientId) {
      const client = await transaction.get(doc(db, 'clients', clean.clientId));
      if (!client.exists() || (client.data().activeLoanId || 'initial') !== clean.loanId) throw new Error('This loan changed. Select its current loan again.');
      if (clean.expenseDate < client.data().approvalDate) throw new Error('A loan expense cannot be dated before its release.');
    }
    const next = { ...clean, status: 'posted', voidReason: '', revision: expectedRevision + 1,
      createdBy: current?.createdBy ?? actor.uid, createdAt: current?.createdAt ?? serverTimestamp(),
      updatedBy: actor.uid, updatedAt: serverTimestamp() };
    transaction.set(ref, next);
    transaction.set(doc(ref, 'history', String(next.revision)), next);
  });
}

export async function voidExpense(expense: Expense, reason: string): Promise<void> {
  reason = reason.trim();
  if (!reason || reason.length > 500) throw new Error('Enter a void reason of up to 500 characters.');
  const ref = doc(db, 'expenses', expense.id);
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const snapshot = await transaction.get(ref);
    const current = snapshot.data();
    if (current?.status === 'void' && current.revision === expense.revision + 1 && current.voidReason === reason) return;
    if (!current || current.revision !== expense.revision || current.status !== 'posted') throw new Error('This expense changed. Reopen it before voiding.');
    const next = { ...current, status: 'void', voidReason: reason, revision: expense.revision + 1, updatedBy: actor.uid, updatedAt: serverTimestamp() };
    transaction.set(ref, next);
    transaction.set(doc(ref, 'history', String(next.revision)), next);
  });
}
