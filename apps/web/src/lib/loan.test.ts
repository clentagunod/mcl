import { describe, expect, it } from 'vitest';
import type { Client, Payment } from '../types';
import { addDays, isISODate, isSunday, todayISO } from './dates';
import { buildClientRows, computeSchedule, deriveStatus, isCollectionDay, summarizeLoan } from './loan';
import { LOAN_TERMS } from '../config/app';
import { normalizeCellphone, validateClientForm } from './validation';

// Calendar used below: Fri 2026-10-30, Sat 10-31, Sun 11-01, Mon 11-02, Tue 11-03, Wed 11-04
const NO_HOLIDAYS = new Set<string>();

describe('dates', () => {
  it('knows which days are Sundays', () => {
    expect(isSunday('2026-11-01')).toBe(true);
    expect(isSunday('2026-11-02')).toBe(false);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('rejects impossible calendar dates', () => {
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-2-3')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
  });

  it('formats the local date without shifting it', () => {
    expect(todayISO(new Date(2026, 10, 1, 23, 59))).toBe('2026-11-01');
    expect(todayISO(new Date(2026, 10, 1, 0, 1))).toBe('2026-11-01');
  });
});

describe('computeSchedule', () => {
  it('counts Sundays by default', () => {
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-11-01')).toEqual({ dueDate: '2026-11-02', daysElapsed: 2 });
    expect(isCollectionDay('2026-11-01', NO_HOLIDAYS)).toBe(true);
  });

  it('skips Sundays only when enabled', () => {
    const { dueDate } = computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-10-30', undefined, true);
    // Sat = day 1, Sun skipped, Mon = day 2, Tue = day 3
    expect(dueDate).toBe('2026-11-03');
    expect(isCollectionDay('2026-11-01', NO_HOLIDAYS, true)).toBe(false);
  });

  it('continues to exclude holidays with either Sunday preference', () => {
    const holidays = new Set(['2026-11-02']);
    expect(computeSchedule('2026-10-30', 3, holidays, '2026-10-30').dueDate).toBe('2026-11-03');
    expect(computeSchedule('2026-10-30', 3, holidays, '2026-10-30', undefined, true).dueDate).toBe('2026-11-04');
    const sundayHoliday = new Set(['2026-11-01']);
    for (const skipSundays of [false, true]) {
      expect(computeSchedule('2026-10-30', 3, sundayHoliday, '2026-10-30', undefined, skipSundays).dueDate).toBe('2026-11-03');
    }
  });

  it('does not count the approval date by default, but can be configured to', () => {
    expect(computeSchedule('2026-10-30', 1, NO_HOLIDAYS, '2026-10-30', false).dueDate).toBe('2026-10-31');
    expect(computeSchedule('2026-10-30', 1, NO_HOLIDAYS, '2026-10-30', true).dueDate).toBe('2026-10-30');
    expect(computeSchedule('2026-11-01', 1, NO_HOLIDAYS, '2026-11-01', true).dueDate).toBe('2026-11-01');
    expect(computeSchedule('2026-11-01', 1, NO_HOLIDAYS, '2026-11-01', true, true).dueDate).toBe('2026-11-02');
  });

  it('counts how many collection days have passed', () => {
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-10-30').daysElapsed).toBe(0);
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-11-01').daysElapsed).toBe(2);
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-11-02').daysElapsed).toBe(3);
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2027-05-01').daysElapsed).toBe(3); // capped at the term
    expect(computeSchedule('2026-10-30', 3, NO_HOLIDAYS, '2026-11-01', undefined, true).daysElapsed).toBe(1);
  });

  it('handles a real 45-day loan with no holidays', () => {
    const { dueDate } = computeSchedule('2026-11-02', 45, NO_HOLIDAYS, '2026-11-02');
    expect(dueDate).toBe('2026-12-17');
    expect(computeSchedule('2026-11-02', 45, NO_HOLIDAYS, '2026-11-02', undefined, true).dueDate).toBe('2026-12-24');
  });

  it.each(LOAN_TERMS)('counts standard days for a %s-day loan', (term) => {
    expect(computeSchedule('2026-11-02', term, NO_HOLIDAYS, '2026-11-02').dueDate).toBe(addDays('2026-11-02', term));
  });
});

describe('deriveStatus', () => {
  it('is paid when nothing is owed, even after the due date', () => {
    expect(deriveStatus(0, '2026-11-03', '2026-12-01')).toBe('paid');
  });

  it('is pending before the due date and due on or after it', () => {
    expect(deriveStatus(500, '2026-11-03', '2026-11-02')).toBe('pending');
    expect(deriveStatus(500, '2026-11-03', '2026-11-03')).toBe('due');
    expect(deriveStatus(500, '2026-11-03', '2026-11-10')).toBe('due');
  });
});

describe('summarizeLoan', () => {
  const client: Client = {
    id: 'c1',
    lastName: 'Dela Cruz',
    firstName: 'Juan',
    middleName: '',
    address: 'Somewhere',
    cellphone: '09171234567',
    principal: 10000,
    interest: 1250,
    loanTermDays: 45,
    approvalDate: '2026-11-02',
  };

  const payment = (id: string, amount: number, paymentDate: string): Payment => ({
    id,
    clientId: 'c1',
    amount,
    paymentDate,
    collectorId: 'u1',
    collectorName: 'Collector',
    createdAt: null,
  });

  it('subtracts payments from principal plus the fixed interest', () => {
    const summary = summarizeLoan(
      client,
      [payment('p1', 250, '2026-11-03'), payment('p2', 250.5, '2026-11-04')],
      NO_HOLIDAYS,
      '2026-11-05',
    );
    expect(summary.totalPayable).toBe(11250);
    expect(summary.totalPaid).toBe(500.5);
    expect(summary.outstanding).toBe(10749.5);
    expect(summary.status).toBe('pending');
    expect(summary.lastPaymentDate).toBe('2026-11-04');
  });

  it('is paid once the full amount is collected and never goes negative', () => {
    const summary = summarizeLoan(client, [payment('p1', 11300, '2026-11-03')], NO_HOLIDAYS, '2026-11-05');
    expect(summary.outstanding).toBe(0);
    expect(summary.status).toBe('paid');
  });

  it('is due when the term has run out with a balance left', () => {
    const summary = summarizeLoan(client, [payment('p1', 1000, '2026-11-03')], NO_HOLIDAYS, '2026-12-24');
    expect(summary.status).toBe('due');
  });

  it('recalculates due date, elapsed days and status together when the shared Sunday policy changes', () => {
    const current: Client = { ...client, loanTermDays: 30, approvalDate: '2026-10-01' };
    const [standard] = buildClientRows([current], [], NO_HOLIDAYS, '2026-11-02', false);
    const [skip] = buildClientRows([current], [], NO_HOLIDAYS, '2026-11-02', true);
    expect(standard.summary).toMatchObject({ dueDate: '2026-10-31', daysElapsed: 30, status: 'due' });
    expect(skip.summary).toMatchObject({ dueDate: '2026-11-05', daysElapsed: 27, status: 'pending' });
    expect(skip.summary.outstanding).toBe(standard.summary.outstanding);
  });
});

describe('validation', () => {
  it('normalises Philippine mobile numbers', () => {
    expect(normalizeCellphone('0917 123 4567')).toBe('09171234567');
    expect(normalizeCellphone('+63 917-123-4567')).toBe('+639171234567');
    expect(normalizeCellphone('12345')).toBeNull();
  });

  it('accepts a valid client form and rounds money to centavos', () => {
    const result = validateClientForm({
      lastName: '  Dela   Cruz ',
      firstName: 'Juan',
      middleName: '',
      address: 'Purok 1, Somewhere',
      cellphone: '09171234567',
      principal: '10000',
      interest: '1250.555',
      loanTermDays: '45',
      approvalDate: '2026-11-02',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.lastName).toBe('Dela Cruz');
      expect(result.value.interest).toBe(1250.56);
      expect(result.value.loanTermDays).toBe(45);
    }
  });

  it('reports every invalid field', () => {
    const result = validateClientForm({
      lastName: '',
      firstName: '',
      middleName: '',
      address: '',
      cellphone: 'abc',
      principal: '0',
      interest: '-5',
      loanTermDays: '31',
      approvalDate: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ['address', 'approvalDate', 'cellphone', 'firstName', 'interest', 'lastName', 'loanTermDays', 'principal'].sort(),
      );
    }
  });
});
