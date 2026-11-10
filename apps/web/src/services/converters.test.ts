import { describe, expect, it } from 'vitest';
import { LOAN_TERMS } from '../config/app';
import { clientFromDoc } from './converters';

const data = {
  firstName: 'Juan', lastName: 'Cruz', middleName: '', address: 'Tagum', cellphone: '',
  principal: 10000, interest: 1250, dailyAmount: 375, approvalDate: '2026-11-02',
};

const snapshot = (loanTermDays: unknown) => ({ id: 'client', data: () => ({ ...data, loanTermDays }) }) as unknown as Parameters<typeof clientFromDoc>[0];

describe('shared client loan conversion', () => {
  it.each(LOAN_TERMS)('reads %s-day loans without changing their financial details', (loanTermDays) => {
    expect(clientFromDoc(snapshot(loanTermDays))).toMatchObject({ id: 'client', ...data, loanTermDays });
  });

  it.each([undefined, '30', 0, 29, 31, 60])('rejects unsupported source term %j instead of silently replacing it', (loanTermDays) => {
    expect(() => clientFromDoc(snapshot(loanTermDays))).toThrow('invalid loan details');
  });
});
