import { ACCOUNT_MIN_PASSWORD_LENGTH, LOAN_TERMS } from '../config/app';
import type { AccountInput, ClientInput, LoanTermDays } from '../types';
import { isISODate } from './dates';
import { isMoney, round2 } from './money';
import { isManagedRole } from './roles';
import { VALID_ID_TYPES, type ClientIdentityFormValues } from './client-identity';

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

export interface ClientFormValues extends ClientIdentityFormValues {
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
  notePayee?: string;
  noteInterestStatement?: string;
  noteExecutionPlace?: string;
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

  // Keep the shared cellphone field a string; an empty value means unavailable.
  const cellphoneInput = values.cellphone.trim();
  const cellphone = cellphoneInput === '' || /^n\s*\/\s*a$/i.test(cellphoneInput)
    ? '' : normalizeCellphone(cellphoneInput);
  if (cellphone === null) errors.cellphone = 'Enter a valid mobile number, leave blank, or enter N/A.';

  function optionalText(field: keyof ClientFormValues, max: number): string {
    const value = cleanText(values[field] ?? '');
    if (value.length > max) errors[field] = `Use at most ${max} characters.`;
    return value;
  }
  function idType(field: 'validIdType' | 'coMakerValidIdType', custom: 'customValidIdType' | 'coMakerCustomValidIdType'): string {
    const selected = values[field] ?? '';
    if (selected === 'custom') {
      const specified = optionalText(custom, 200);
      if (!specified) errors[custom] = 'Specify the custom ID type.';
      return specified;
    }
    if (selected && !(VALID_ID_TYPES as readonly string[]).includes(selected)) errors[field] = 'Choose an ID type or select Custom.';
    return selected;
  }
  function issuedOn(field: 'validIdIssuedOn' | 'coMakerValidIdIssuedOn'): string {
    const value = (values[field] ?? '').trim();
    if (value && !isISODate(value)) errors[field] = 'Enter a valid issue date.';
    return value;
  }
  const identity = {
    validIdType: idType('validIdType', 'customValidIdType'),
    validIdNumber: optionalText('validIdNumber', 200),
    validIdIssuedOn: issuedOn('validIdIssuedOn'),
    validIdIssuedAt: optionalText('validIdIssuedAt', 300),
  };
  const contactInput = (values.coMakerContactNumber ?? '').trim();
  const contactNumber = !contactInput || /^n\s*\/\s*a$/i.test(contactInput) ? '' : normalizeCellphone(contactInput);
  if (contactNumber === null) errors.coMakerContactNumber = 'Enter a valid mobile number, leave blank, or enter N/A.';
  const coMaker = {
    name: optionalText('coMakerName', 200),
    validIdType: idType('coMakerValidIdType', 'coMakerCustomValidIdType'),
    validIdNumber: optionalText('coMakerValidIdNumber', 200),
    validIdIssuedOn: issuedOn('coMakerValidIdIssuedOn'),
    validIdIssuedAt: optionalText('coMakerValidIdIssuedAt', 300),
    contactNumber: contactNumber ?? '',
  };
  const noteFields = {
    payee: optionalText('notePayee', 1500),
    interestStatement: optionalText('noteInterestStatement', 1500),
    executionPlace: optionalText('noteExecutionPlace', 1500),
  };

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
      ...identity,
      coMaker,
      // Ordinary client edits preserve note overrides through the partial update.
      ...(values.notePayee !== undefined || values.noteInterestStatement !== undefined || values.noteExecutionPlace !== undefined
        ? { promissoryNote: noteFields } : {}),
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

// ---- Account form ------------------------------------------------------------

export interface AccountFormValues {
  role: AccountInput['role'];
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

export interface AccountFormOptions {
  /** Editing keeps the existing email and password, so they are not validated. */
  requireCredentials: boolean;
}

export function validateAccountForm(
  values: AccountFormValues,
  { requireCredentials }: AccountFormOptions,
): ValidationResult<AccountFormValues, AccountInput> {
  const errors: FieldErrors<AccountFormValues> = {};

  if (!isManagedRole(values.role)) errors.role = 'Choose a valid account role.';

  const fullName = cleanText(values.fullName);
  if (!fullName) errors.fullName = 'Full name is required.';

  const phone = values.phone.trim() === '' ? '' : normalizeCellphone(values.phone);
  if (phone === null) errors.phone = 'Enter a valid mobile number, e.g. 09171234567.';

  const email = values.email.trim().toLowerCase();
  if (requireCredentials) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (values.password.length < ACCOUNT_MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${ACCOUNT_MIN_PASSWORD_LENGTH} characters.`;
    }
  }

  if (Object.keys(errors).length > 0 || phone === null) return { ok: false, errors };
  return { ok: true, value: { role: values.role, fullName, email, phone, password: values.password } };
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
