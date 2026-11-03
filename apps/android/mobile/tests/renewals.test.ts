import { describe, it, expect } from 'vitest';
import { normalizeClient, normalizePayment, assertCycle } from '../src/loanCycle';
import { summarizeLoan } from '@web/lib/loan';
import { indexEntries } from '@web/lib/printables';
import type { Client, Payment } from '@web/types';
const client: Client = {id:'c',firstName:'Test',middleName:'',lastName:'Borrower',address:'',cellphone:'',principal:1000,interest:100,loanTermDays:45,approvalDate:'2026-01-01',transactionNumber:'00001'};
const receipt = (loanId?: string, amount=100): Payment => ({id:'p',clientId:'c',loanId,amount,paymentDate:'2026-01-02',collectorId:'u',collectorName:'Test',createdAt:null});
describe('renewed display contract', () => {
 it('normalizes legacy models without changing identifiers', () => {
  expect(normalizeClient(client)).toMatchObject({activeLoanId:'initial',renewalCount:0,transactionNumber:'00001'});
  expect(normalizePayment(receipt()).loanId).toBe('initial');
 });
 it('keeps legacy balances compatible', () => expect(summarizeLoan(client,[receipt()],new Set(),'2026-01-02').outstanding).toBe(1000));
 it('isolates same-day payments across cycles and client IDs', () => {
  const renewed={...client,activeLoanId:'00002',renewalCount:1,transactionNumber:'00002'};
  const payments=[receipt(undefined,1100),receipt('00002',250),{...receipt('00002',999),clientId:'other'}];
  expect(summarizeLoan(renewed,payments,new Set(),'2026-01-02').outstanding).toBe(850);
  expect(indexEntries(renewed,payments)).toEqual([{day:1,date:'2026-01-02',amount:250}]);
  expect(payments).toHaveLength(3);
 });
 it('restarts schedule with renewed terms and skips Sundays/holidays', () => {
  const summary=summarizeLoan({...client,approvalDate:'2026-02-01',activeLoanId:'00002'},[receipt(undefined,1100)],new Set(['2026-02-02']),'2026-02-03');
  expect(summary.daysElapsed).toBe(1); expect(summary.outstanding).toBe(1100);
 });
 it('clamps fully paid current cycles to zero', () => expect(summarizeLoan({...client,activeLoanId:'00002'},[receipt('00002',1200)],new Set(),'2026-01-02').outstanding).toBe(0));
 it('never defaults an untagged queued receipt to the latest cycle', () => {
  const pending=JSON.parse(JSON.stringify({loanId:undefined,amount:100}));
  expect(() => assertCycle(pending.loanId,'00002')).toThrow('reopen');
 });
});
