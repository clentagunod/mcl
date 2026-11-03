import { describe, expect, it } from 'vitest';
import { parseMoney, validateClientForm, validatePaymentForm } from './validation';
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
