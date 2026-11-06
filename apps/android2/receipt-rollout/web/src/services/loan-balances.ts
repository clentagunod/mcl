import { doc, serverTimestamp, type DocumentData, type DocumentReference, type Transaction } from 'firebase/firestore';
import { db } from '../config/firebase';
import { loanId } from '../lib/loan-cycle';

export interface LoanBalance {
  loanId: string;
  paidCents: number;
  revision: number;
  operation: 'open' | 'create' | 'delete' | 'adjust' | 'renew';
  receiptId: string;
}
export interface ReadLoanBalance { ref: DocumentReference; value: LoanBalance }

export function moneyCents(value: unknown, positive = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999
    || Math.round(value * 100) / 100 !== value || (positive && value === 0)) {
    throw new Error('Enter a valid amount with at most two decimal places.');
  }
  return Math.round(value * 100);
}

export function loanTotalCents(client: DocumentData): number {
  return moneyCents(client.principal, true) + moneyCents(client.interest);
}

/** The protected gate fails closed while migration or reconciliation is in progress. */
export async function requireReceiptControl(transaction: Transaction): Promise<void> {
  const control = await transaction.get(doc(db, 'settings', 'receiptControl', 'current', 'config'));
  if (!control.exists() || control.data().enabled !== true || control.data().mode !== 'ledger-v1') {
    throw new Error('Receipt maintenance is in progress. Keep reserved receipts and retry after the administrator enables ledger-v1.');
  }
}

export function validateLoanBalance(data: DocumentData | undefined, client: DocumentData): LoanBalance {
  if (!data || typeof data.loanId !== 'string' || !data.loanId || data.loanId !== loanId(client)
    || !Number.isSafeInteger(data.paidCents) || data.paidCents < 0 || data.paidCents > loanTotalCents(client)
    || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !['open', 'create', 'delete', 'adjust', 'renew'].includes(data.operation)
    || typeof data.receiptId !== 'string' || data.receiptId.includes('/') || new TextEncoder().encode(data.receiptId).length > 1500) {
    throw new Error('This loan balance requires administrator reconciliation. No financial changes were saved.');
  }
  return data as LoanBalance;
}

export async function readLoanBalance(transaction: Transaction, clientId: string, client: DocumentData): Promise<ReadLoanBalance> {
  await requireReceiptControl(transaction);
  const ref = doc(db, 'loanBalances', clientId);
  const snapshot = await transaction.get(ref);
  return { ref, value: validateLoanBalance(snapshot.exists() ? snapshot.data() : undefined, client) };
}

export async function prepareOpenBalance(transaction: Transaction, clientId: string): Promise<DocumentReference> {
  await requireReceiptControl(transaction);
  const ref = doc(db, 'loanBalances', clientId);
  if ((await transaction.get(ref)).exists()) throw new Error('This client identifier has retained loan history. Use a new identifier.');
  return ref;
}

export function openLoanBalance() {
  return { loanId: 'initial', paidCents: 0, revision: 0, operation: 'open', receiptId: '', updatedAt: serverTimestamp() };
}

export function advanceLoanBalance(balance: LoanBalance, operation: LoanBalance['operation'], receiptId: string,
  paidCents = balance.paidCents, cycle = balance.loanId) {
  if (!Number.isSafeInteger(paidCents) || paidCents < 0 || !Number.isSafeInteger(balance.revision + 1)) {
    throw new Error('This loan balance cannot be updated safely.');
  }
  return { loanId: cycle, paidCents, revision: balance.revision + 1, operation, receiptId, updatedAt: serverTimestamp() };
}
