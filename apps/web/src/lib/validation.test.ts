import { describe, expect, it } from 'vitest';
import { parseMoney, validateAccountForm, validateClientForm, validatePaymentForm } from './validation';
import { MAX_MONEY } from './money';
const values = { lastName: 'Cruz', firstName: 'Juan', middleName: '', address: 'Test', cellphone: '09170000000', principal: '1000', interest: '100', loanTermDays: '45', approvalDate: '2026-11-01', dailyAmount: '25' };
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
