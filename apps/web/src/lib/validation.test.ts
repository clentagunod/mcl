import { describe, expect, it } from 'vitest';
import { parseMoney, validateAccountForm, validateClientForm, validatePaymentForm } from './validation';
import { MAX_MONEY } from './money';
import { LOAN_TERMS } from '../config/app';
import { clientIdentityFormValues, VALID_ID_TYPES } from './client-identity';
const values = { lastName: 'Cruz', firstName: 'Juan', middleName: '', address: 'Test', cellphone: '09170000000', principal: '1000', interest: '100', loanTermDays: '45', approvalDate: '2026-11-01', dailyAmount: '25' };

describe('optional borrower and co-maker identification', () => {
  it('accepts legacy forms and partial co-maker information without requiring the section', () => {
    const result = validateClientForm({ ...values, coMakerName: '  Maria   Reyes  ' });
    expect(result).toMatchObject({ ok: true, value: { validIdType: '', coMaker: { name: 'Maria Reyes', validIdNumber: '', contactNumber: '' } } });
  });

  it.each(VALID_ID_TYPES)('accepts %s for either party', validIdType => {
    expect(validateClientForm({ ...values, validIdType, coMakerValidIdType: validIdType })).toMatchObject({ ok: true, value: { validIdType, coMaker: { validIdType } } });
  });

  it('round-trips custom types, normalizes contact details, and allows clearing saved fields', () => {
    const result = validateClientForm({ ...values, validIdType: 'custom', customValidIdType: '  Company   ID ', validIdNumber: '001-02', validIdIssuedOn: '2024-02-29', validIdIssuedAt: '  Tagum  City ', coMakerValidIdType: 'custom', coMakerCustomValidIdType: 'Barangay ID', coMakerContactNumber: '+63 (917) 123-4567' });
    expect(result).toMatchObject({ ok: true, value: { validIdType: 'Company ID', validIdNumber: '001-02', validIdIssuedOn: '2024-02-29', validIdIssuedAt: 'Tagum City', coMaker: { validIdType: 'Barangay ID', contactNumber: '+639171234567' } } });
    if (!result.ok) throw new Error('Expected valid identity details');
    const form = clientIdentityFormValues({ ...result.value, id: 'legacy' });
    expect(form).toMatchObject({ validIdType: 'custom', customValidIdType: 'Company ID', coMakerValidIdType: 'custom', coMakerCustomValidIdType: 'Barangay ID' });
    expect(validateClientForm({ ...values, ...clientIdentityFormValues() })).toMatchObject({ ok: true, value: { validIdType: '', validIdNumber: '', validIdIssuedOn: '', validIdIssuedAt: '', coMaker: { name: '', validIdType: '', contactNumber: '' } } });
  });

  it('rejects unspecified custom types, invalid dates and invalid supplied contact numbers', () => {
    expect(validateClientForm({ ...values, validIdType: 'custom', coMakerValidIdType: 'custom', validIdIssuedOn: '2025-02-29', coMakerValidIdIssuedOn: 'bad', coMakerContactNumber: '123' })).toMatchObject({ ok: false, errors: {
      customValidIdType: expect.any(String), coMakerCustomValidIdType: expect.any(String), validIdIssuedOn: expect.any(String), coMakerValidIdIssuedOn: expect.any(String), coMakerContactNumber: expect.any(String),
    } });
  });

  it('keeps template overrides out of ordinary edits and permits explicit reset from the note editor', () => {
    const ordinary = validateClientForm(values);
    expect(ordinary.ok && ordinary.value).not.toHaveProperty('promissoryNote');
    expect(validateClientForm({ ...values, notePayee: '  MCL   Lending ', noteInterestStatement: '', noteExecutionPlace: '' })).toMatchObject({ ok: true, value: { promissoryNote: { payee: 'MCL Lending', interestStatement: '', executionPlace: '' } } });
  });
});

describe('supported client loan terms', () => {
  it.each(LOAN_TERMS)('accepts a %s-day loan without altering its term', (loanTermDays) => {
    const result = validateClientForm({ ...values, loanTermDays: String(loanTermDays) });
    expect(result.ok && result.value.loanTermDays).toBe(loanTermDays);
  });

  it('calculates the suggested daily amount for a 30-day loan', () => {
    const result = validateClientForm({ ...values, principal: '10000', interest: '1250', loanTermDays: '30', dailyAmount: undefined });
    expect(result.ok && result.value.dailyAmount).toBe(375);
  });

  it.each(['', '0', '29', '31', '60', 'NaN'])('rejects unsupported duration %j', (loanTermDays) => {
    expect(validateClientForm({ ...values, loanTermDays })).toMatchObject({ ok: false, errors: { loanTermDays: expect.any(String) } });
  });
});

describe('optional client cellphone', () => {
  it.each(['', '  ', 'N/A', ' n/a ', 'N / A'])('stores unavailable number %j as an empty string', (cellphone) => {
    const result = validateClientForm({ ...values, cellphone });
    expect(result.ok && result.value.cellphone).toBe('');
  });

  it.each(['0917 123-4567', '+63 (917) 123-4567'])('continues normalizing a supplied number %s', (cellphone) => {
    const result = validateClientForm({ ...values, cellphone });
    expect(result.ok && result.value.cellphone).toBe(cellphone.startsWith('+') ? '+639171234567' : '09171234567');
  });

  it.each(['123', 'not available', '091712345678', 'N/A0917'])('rejects invalid supplied number %s', (cellphone) => {
    expect(validateClientForm({ ...values, cellphone })).toMatchObject({ ok: false, errors: { cellphone: expect.any(String) } });
  });
});

describe('finite financial input boundaries', () => {
  it.each(['1e308', 'Infinity', 'NaN', String(MAX_MONEY + 1), '-1'])('rejects unsupported amount %s', value => {
    expect(parseMoney(value)).toBeNull();
    expect(validateClientForm({ ...values, principal: value }).ok).toBe(false);
    expect(validatePaymentForm({ amount: value, paymentDate: '2026-11-02' }, { outstanding: 1000, approvalDate: '2026-11-01', today: '2026-11-02' }).ok).toBe(false);
  });
  it('preserves centavos, zero interest, and existing rounding behavior', () => {
    expect(parseMoney('123.45')).toBe(123.45); expect(parseMoney('1.235')).toBe(1.24);
    expect(validateClientForm({ ...values, interest: '0' }).ok).toBe(true);
  });
});

describe('account validation', () => {
  const account = { role: 'admin' as const, fullName: '  New   Admin ', email: ' ADMIN@EXAMPLE.COM ', phone: '', password: 'password123' };

  it('rejects the manually provisioned developer role in account forms', () => {
    // @ts-expect-error Verify validation also rejects a role supplied outside the typed form.
    expect(validateAccountForm({ ...account, role: 'developer' }, { requireCredentials: true })).toEqual({
      ok: false, errors: { role: 'Choose a valid account role.' },
    });
  });

  it.each(['admin', 'collector'] as const)('validates and normalizes a new %s', role => {
    expect(validateAccountForm({ ...account, role }, { requireCredentials: true })).toEqual({
      ok: true, value: { ...account, role, fullName: 'New Admin', email: 'admin@example.com' },
    });
  });

  it('requires credentials when creating accounts and leaves them alone during contact edits', () => {
    const missingCredentials = { ...account, email: '', password: '' };
    expect(validateAccountForm(missingCredentials, { requireCredentials: true }).ok).toBe(false);
    expect(validateAccountForm(missingCredentials, { requireCredentials: false }).ok).toBe(true);
  });
});
