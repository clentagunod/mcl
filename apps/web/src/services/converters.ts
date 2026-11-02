import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { LOAN_TERMS } from '../config/app';
import type { Client, Holiday, LoanTermDays, Payment, UserProfile, UserRole } from '../types';

/**
 * Firestore documents can be written by more than one app (this web app and the Android
 * app), so nothing is trusted blindly: every field is coerced to the type we expect.
 */

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function amount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function loanTerm(value: unknown): LoanTermDays {
  return (LOAN_TERMS as readonly unknown[]).includes(value) ? (value as LoanTermDays) : LOAN_TERMS[0];
}

function read(snapshot: QueryDocumentSnapshot): DocumentData {
  // "estimate" gives a usable timestamp for writes that have not reached the server yet.
  return snapshot.data({ serverTimestamps: 'estimate' });
}

export function clientFromDoc(snapshot: QueryDocumentSnapshot): Client {
  const data = read(snapshot);
  return {
    id: snapshot.id,
    clientNumber: text(data.clientNumber) || undefined,
    transactionNumber: text(data.transactionNumber) || undefined,
    dailyAmount: typeof data.dailyAmount === 'number' && Number.isFinite(data.dailyAmount) && data.dailyAmount > 0
      ? amount(data.dailyAmount) : undefined,
    lastName: text(data.lastName),
    firstName: text(data.firstName),
    middleName: text(data.middleName),
    address: text(data.address),
    cellphone: text(data.cellphone),
    principal: amount(data.principal),
    interest: amount(data.interest),
    loanTermDays: loanTerm(data.loanTermDays),
    approvalDate: text(data.approvalDate),
  };
}

export function paymentFromDoc(snapshot: QueryDocumentSnapshot): Payment {
  const data = read(snapshot);
  return {
    id: snapshot.id,
    clientId: text(data.clientId),
    amount: amount(data.amount),
    paymentDate: text(data.paymentDate),
    collectorId: text(data.collectorId),
    collectorName: text(data.collectorName),
    notes: text(data.notes) || text(data.note),
    createdAt: toDate(data.createdAt),
  };
}

export function userFromDoc(snapshot: { id: string; data: () => DocumentData | undefined }): UserProfile | null {
  const data = snapshot.data();
  if (!data) return null;
  const role: UserRole = data.role === 'admin' ? 'admin' : 'collector';
  return {
    uid: snapshot.id,
    role,
    fullName: text(data.fullName),
    email: text(data.email),
    phone: text(data.phone),
    // A missing flag means "active", matching the Firestore rules.
    active: data.active !== false,
    createdAt: toDate(data.createdAt),
  };
}

export function holidayFromDoc(snapshot: QueryDocumentSnapshot): Holiday {
  const data = read(snapshot);
  return { date: text(data.date) || snapshot.id, name: text(data.name) };
}
