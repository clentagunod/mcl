import type { LOAN_TERMS } from '../config/app';
import type { ISODate } from '../lib/dates';

export type LoanTermDays = (typeof LOAN_TERMS)[number];

export type UserRole = 'admin' | 'collector';

export interface Client {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  address: string;
  cellphone: string;
  /** Amount lent, in pesos. */
  principal: number;
  /** Fixed interest amount in pesos (NOT a percentage). */
  interest: number;
  loanTermDays: LoanTermDays;
  /** Date the loan was approved; the term is counted from here. */
  approvalDate: ISODate;
}

/** The fields an admin supplies when adding or editing a client. */
export type ClientInput = Omit<Client, 'id'>;

/** A principal repayment entered by a collector (or an admin). */
export interface Payment {
  id: string;
  clientId: string;
  amount: number;
  /** The day the money was collected. */
  paymentDate: ISODate;
  collectorId: string;
  collectorName: string;
  /** When the entry was recorded (server time). Null for a split second after saving. */
  createdAt: Date | null;
}

export type PaymentInput = Omit<Payment, 'id' | 'createdAt'>;

export interface UserProfile {
  uid: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  active: boolean;
  createdAt: Date | null;
}

export interface CollectorInput {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface Holiday {
  date: ISODate;
  name: string;
}

export type LoanStatus = 'due' | 'pending' | 'paid';
