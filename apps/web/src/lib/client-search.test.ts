import { describe, expect, it } from 'vitest';
import type { Client } from '../types';
import { searchClients } from './client-search';

const client: Client = { id: 'legacy-Firestore-ID', clientNumber: 'mcl0001', transactionNumber: '00042', firstName: 'José', lastName: 'Dela Cruz', middleName: 'Peña', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, loanTermDays: 45, approvalDate: '2026-11-02' };
const other: Client = { ...client, id: 'mcl0002', clientNumber: 'mcl0002', transactionNumber: '00043', firstName: 'Maria', lastName: 'Santos' };

describe('print client search', () => {
  it('finds partial names in any order, ignoring case, accents and punctuation', () => {
    for (const query of ['CRUZ, jose', 'pena de', 'delacruz', 'José Cruz']) {
      expect(searchClients([other, client], query)).toEqual([client]);
    }
  });
  it('matches public IDs, legacy IDs and transaction numbers with separators', () => {
    for (const query of ['MCL-0001', 'mcl 0001', 'legacy firestore id', '00042']) {
      expect(searchClients([other, client], query)).toEqual([client]);
    }
  });
  it('ranks an exact identifier before partial name matches', () => {
    const nameMatch = { ...client, firstName: 'mcl0002' };
    expect(searchClients([nameMatch, other], 'mcl0002')).toEqual([other, nameMatch]);
  });
  it('requires all search terms and does not change the underlying client list', () => {
    const list = [other, client];
    expect(searchClients(list, 'jose santos')).toEqual([]);
    expect(searchClients(list, '')).toEqual([client, other]);
    expect(list).toEqual([other, client]);
  });
});
