import { COLLECTOR_MIN_PASSWORD_LENGTH, LOAN_TERMS } from '../config/app';
import type { ClientInput, LoanTermDays } from '../types';
import { isISODate } from './dates';
import { isMoney, round2 } from './money';

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export type ValidationResult<TValues, TOutput> =
  | { ok: true; value: TOutput }
  | { ok: false; errors: FieldErrors<TValues> };

/** Trims and collapses repeated spaces: "  Juan   dela Cruz " -> "Juan dela Cruz". */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Accepts Philippine mobile numbers written as 09171234567 or +639171234567
 * (spaces, dashes and brackets are ignored) and returns them without the separators.
 */
export function normalizeCellphone(value: string): string | null {
  const stripped = value.replace(/[\s\-()]/g, '');
  return /^(09\d{9}|\+639\d{9})$/.test(stripped) ? stripped : null;
}

/** Parses a money input. Returns null when it is not a finite number. */
export function parseMoney(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  const rounded = round2(parsed);
  return isMoney(rounded) ? rounded : null;
}

function isLoanTerm(value: number): value is LoanTermDays {
  return (LOAN_TERMS as readonly number[]).includes(value);
}

// ---- Client form -------------------------------------------------------------

export interface ClientFormValues {
  lastName: string;
  firstName: string;
  middleName: string;
  address: string;
  cellphone: string;
  principal: string;
  interest: string;
  loanTermDays: string;
  approvalDate: string;
  dailyAmount?: string;
}

export function validateClientForm(values: ClientFormValues): ValidationResult<ClientFormValues, ClientInput> {
  const errors: FieldErrors<ClientFormValues> = {};

  const lastName = cleanText(values.lastName);
  const firstName = cleanText(values.firstName);
  const middleName = cleanText(values.middleName);
  const address = cleanText(values.address);

  if (!lastName) errors.lastName = 'Last name is required.';
  if (!firstName) errors.firstName = 'First name is required.';
  if (!address) errors.address = 'Permanent address is required.';

  const cellphone = normalizeCellphone(values.cellphone);
  if (!cellphone) errors.cellphone = 'Enter a valid mobile number, e.g. 09171234567.';

  const principal = parseMoney(values.principal);
  if (principal === null || principal <= 0) errors.principal = 'Principal must be greater than 0.';

  const interest = parseMoney(values.interest);
  if (interest === null || interest < 0) errors.interest = 'Interest must be 0 or more.';

  const loanTermDays = Number(values.loanTermDays);
  if (!isLoanTerm(loanTermDays)) errors.loanTermDays = 'Choose a loan type.';

  if (!isISODate(values.approvalDate)) errors.approvalDate = 'Choose the date of approval.';
  const dailyAmount = values.dailyAmount === undefined ? undefined : parseMoney(values.dailyAmount);
  if (dailyAmount !== undefined && (dailyAmount === null || dailyAmount <= 0)) errors.dailyAmount = 'Daily amount must be greater than 0.';

  if (
    Object.keys(errors).length > 0 ||
    cellphone === null ||
    principal === null ||
    interest === null ||
    !isLoanTerm(loanTermDays)
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      lastName,
      firstName,
      middleName,
      address,
      cellphone,
      principal,
      interest,
      loanTermDays,
      approvalDate: values.approvalDate,
      dailyAmount: dailyAmount ?? Math.ceil(((principal + interest) / loanTermDays) * 100) / 100,
    },
  };
}

// ---- Payment form ------------------------------------------------------------

export interface PaymentFormValues {
  amount: string;
  paymentDate: string;
}

export interface PaymentFormContext {
  outstanding: number;
  approvalDate: string;
  today: string;
  minimumAmount?: number;
}

export function validatePaymentForm(
  values: PaymentFormValues,
  context: PaymentFormContext,
): ValidationResult<PaymentFormValues, { amount: number; paymentDate: string }> {
  const errors: FieldErrors<PaymentFormValues> = {};

  const amount = parseMoney(values.amount);
  if (amount === null || amount <= 0) errors.amount = 'Amount must be greater than 0.';
  else if (amount > context.outstanding) errors.amount = 'Amount is more than the outstanding balance.';
  else if (context.minimumAmount && amount < context.minimumAmount) errors.amount = `Collector payments must be at least PHP ${context.minimumAmount.toFixed(2)}. Ask an administrator to record a smaller partial payment or final settlement.`;

  if (!isISODate(values.paymentDate)) errors.paymentDate = 'Choose the payment date.';
  else if (values.paymentDate > context.today) errors.paymentDate = 'Payment date cannot be in the future.';
  else if (values.paymentDate < context.approvalDate) {
    errors.paymentDate = 'Payment date cannot be before the date of approval.';
  }

  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, value: { amount, paymentDate: values.paymentDate } };
}

// ---- Collector form ----------------------------------------------------------

export interface CollectorFormValues {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface CollectorFormOptions {
  /** Editing keeps the existing email and password, so they are not validated. */
  requireCredentials: boolean;
}

export function validateCollectorForm(
  values: CollectorFormValues,
  { requireCredentials }: CollectorFormOptions,
): ValidationResult<CollectorFormValues, CollectorFormValues> {
  const errors: FieldErrors<CollectorFormValues> = {};

  const fullName = cleanText(values.fullName);
  if (!fullName) errors.fullName = 'Full name is required.';

  const phone = values.phone.trim() === '' ? '' : normalizeCellphone(values.phone);
  if (phone === null) errors.phone = 'Enter a valid mobile number, e.g. 09171234567.';

  const email = values.email.trim().toLowerCase();
  if (requireCredentials) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (values.password.length < COLLECTOR_MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${COLLECTOR_MIN_PASSWORD_LENGTH} characters.`;
    }
  }

  if (Object.keys(errors).length > 0 || phone === null) return { ok: false, errors };
  return { ok: true, value: { fullName, email, phone, password: values.password } };
}

// ---- Holiday form ------------------------------------------------------------

export interface HolidayFormValues {
  date: string;
  name: string;
}

export function validateHolidayForm(
  values: HolidayFormValues,
): ValidationResult<HolidayFormValues, HolidayFormValues> {
  const errors: FieldErrors<HolidayFormValues> = {};
  const name = cleanText(values.name);

  if (!isISODate(values.date)) errors.date = 'Choose a date.';
  if (!name) errors.name = 'Enter the holiday name.';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { date: values.date, name } };
}
