import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '../src/config/settings';

const state = vi.hoisted(() => ({ db: null as Firestore | null, auth: { currentUser: null as { uid: string } | null } }));
vi.mock('../src/config/firebase', () => ({ get db() { return state.db; }, auth: state.auth }));

let environment: RulesTestEnvironment;
const client = {
  clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', middleName: '', lastName: 'Cruz',
  address: 'Tagum', cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250,
  loanTermDays: 45, approvalDate: '2026-09-01',
};
const terms = { principal: 20000, interest: 2500, dailyAmount: 450, loanTermDays: 50 as const, approvalDate: '2026-11-02' };

beforeAll(async () => {
  expect(process.env.GCLOUD_PROJECT).toBe('demo-mcl-policy');
  expect(process.env.FIRESTORE_EMULATOR_HOST).toBe('127.0.0.1:8188');
  environment = await initializeTestEnvironment({ projectId: 'demo-mcl-policy', firestore: {
    host: '127.0.0.1', port: 8188, rules: await readFile('firestore.rules', 'utf8'),
  } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/admin'), { role: 'admin', active: true, fullName: 'Admin' }),
      setDoc(doc(db, 'users/developer'), { role: 'developer', active: true, fullName: 'Developer' }),
      setDoc(doc(db, 'users/collector'), { role: 'collector', active: true, fullName: 'Collector' }),
      setDoc(doc(db, 'users/inactive'), { role: 'admin', active: false, fullName: 'Inactive' }),
      setDoc(doc(db, 'clients/c'), { ...client, customImportedField: { keep: true } }),
      setDoc(doc(db, 'payments/settlement'), { clientId: 'c', amount: 11250, paymentDate: '2026-10-23',
        collectorId: 'collector', collectorName: 'Collector', createdAt: serverTimestamp() }),
      setDoc(doc(db, 'settings/Configurations/elements/counters'), { clientSequence: 1, transactionSequence: 1 }),
      // These existing renewal fixtures model the previous Sunday-skipping schedule.
      setDoc(doc(db, 'settings/Configurations/elements/loanSchedule'), { skipSundays: true }),
      setDoc(doc(db, 'settings/Identifiers/transactions/00001'), { clientId: 'c' }),
    ]);
  });
});
afterAll(async () => { await environment?.cleanup(); });

async function services(uid = 'admin') {
  state.db = environment.authenticatedContext(uid).firestore();
  state.auth.currentUser = { uid };
  vi.resetModules();
  const [renewals, trash, payments, converters, settings, trashOperations, expenses, clients] = await Promise.all([
    import('../src/services/renewals'), import('../src/services/client-trash'),
    import('../src/services/payments'), import('../src/services/converters'),
    import('../src/services/settings'), import('../src/services/client-trash-operations'),
    import('../src/services/expenses'),
    import('../src/services/clients'),
  ]);
  const db = state.db;
  return { db, ...renewals, ...trash, ...payments, ...settings, ...trashOperations, ...expenses, ...clients,
    readClient: async () => {
      const source = await getDoc(doc(db, 'clients/c'));
      if (!source.exists()) throw new Error('Missing test client.');
      return converters.clientFromDoc(source);
    },
    readPayment: async (id: string) => {
      const source = await getDoc(doc(db, 'payments', id));
      if (!source.exists()) throw new Error('Missing test payment.');
      return converters.paymentFromDoc(source);
    },
  };
}

describe('client identification through production Firestore services', () => {
  const details = {
    validIdType: 'Philippine Passport', validIdNumber: '000123', validIdIssuedOn: '2024-02-29', validIdIssuedAt: 'Davao',
    coMaker: { name: 'Maria Reyes', validIdType: 'Company ID', validIdNumber: '000009', validIdIssuedOn: '2023-01-01', validIdIssuedAt: 'Tagum', contactNumber: '09171234567' },
    promissoryNote: { payee: 'MCL Lending', interestStatement: 'Agreed charge', executionPlace: 'Tagum City' },
  };

  it.each(['admin', 'developer'])('%s persists, reloads and clears borrower, co-maker and note fields', async uid => {
    const service = await services(uid);
    await service.addClient({ ...client, ...details, loanTermDays: 45 });
    expect((await getDoc(doc(service.db, 'clients/mcl0002'))).data()).toMatchObject(details);
    const opened = await service.readClient();
    await service.updateClient('c', { ...client, ...details, loanTermDays: 45 }, opened);
    const saved = await service.readClient();
    expect(saved).toMatchObject(details);
    expect(saved.revision).toBeTruthy();
    expect((await getDoc(doc(service.db, 'clients/c'))).data()).toMatchObject({ customImportedField: { keep: true } });
    await expect(service.updateClient('c', { ...client, loanTermDays: 45 }, opened)).rejects.toThrow('another session');
    await service.updateClient('c', { ...client, loanTermDays: 45, validIdType: '', validIdNumber: '', validIdIssuedOn: '', validIdIssuedAt: '', coMaker: { name: '', contactNumber: '' }, promissoryNote: { payee: '', interestStatement: '', executionPlace: '' } }, saved);
    expect(await service.readClient()).toMatchObject({ validIdType: '', validIdNumber: '', coMaker: { name: '', contactNumber: '' }, promissoryNote: { payee: '' } });
  });

  it('preserves saved client details through renewal, Trash and restore', async () => {
    const service = await services();
    await service.updateClient('c', { ...client, ...details, loanTermDays: 45 }, await service.readClient());
    await service.renewClient(await service.readClient(), terms, 'Renew with identity preserved');
    expect(await service.readClient()).toMatchObject(details);
    const action = service.createTrashAction('trash', [{ id: 'c' }]);
    await action();
    const archived = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    expect(archived.client).toMatchObject(details);
    await service.createTrashAction('restore', [{ id: 'c', trashId: archived.trashId }])();
    expect(await service.readClient()).toMatchObject(details);
  });

  it('does not grant collectors permission to edit client identity or note text', async () => {
    const service = await services('collector');
    await expect(service.updateClient('c', { ...client, ...details, loanTermDays: 45 }, await service.readClient())).rejects.toThrow();
    expect((await getDoc(doc(service.db, 'clients/c'))).data()).not.toHaveProperty('coMaker');
  });
});

describe('developer accounting access through production services', () => {
  it.each(['admin', 'developer'])('%s saves and reloads both states of the daily summary filter', async uid => {
    const service = await services(uid);
    await service.initializeSettings(uid);
    let expected = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    const path = doc(service.db, 'settings/Printables/elements/summaryTemplate');
    expect((await getDoc(path)).data()?.onlyClientsWithPayments).toBe(true);
    for (const onlyClientsWithPayments of [false, true]) {
      const next = { ...expected, summary: { onlyClientsWithPayments } };
      await service.saveSettings(next, uid, expected);
      await service.initializeSettings(uid);
      expect((await getDoc(path)).data()).toMatchObject({ onlyClientsWithPayments, updatedBy: uid });
      expected = next;
    }
  });
  it.each(['admin', 'developer'])('%s persists and reloads the optional ID page and independent box dimensions', async uid => {
    const service = await services(uid);
    await service.initializeSettings(uid);
    const saved = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    const next = { ...saved, promissory: { ...saved.promissory, includeIdPage: true, clientIdWidthMm: 90, clientIdHeightMm: 60, coMakerIdWidthMm: 100, coMakerIdHeightMm: 65 } };
    await service.saveSettings(next, uid, saved);
    await service.initializeSettings(uid);
    const path = doc(service.db, 'settings/Printables/elements/promissoryTemplate');
    expect((await getDoc(path)).data()).toMatchObject({ ...next.promissory, updatedBy: uid });
    await expect(service.saveSettings(saved, uid, saved)).rejects.toThrow('another session');
    const disabled = { ...next, promissory: { ...next.promissory, includeIdPage: false } };
    await service.saveSettings(disabled, uid, next);
    expect((await getDoc(path)).data()).toMatchObject(disabled.promissory);
  });

  it.each(['admin', 'developer'])('%s persists metric visibility through initialization without changing accounting policy', async uid => {
    const service = await services(uid);
    await service.initializeSettings(uid);
    const saved = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    const next = { ...saved, consolidationMetrics: { balance: true, interestCollected: true, expenseAmount: false, netIncome: true, principalReleased: false, cashSurplus: true } };
    await service.saveSettings(next, uid, saved);
    await service.initializeSettings(uid);
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/consolidationMetrics'))).data())
      .toMatchObject({ ...next.consolidationMetrics, updatedBy: uid });
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/accountingPolicy'))).data()).toMatchObject(saved.accounting);
    await expect(service.saveSettings(saved, uid, saved)).rejects.toThrow('another session');
  });
  it.each(['admin', 'developer'])('%s can initialize and save settings, manage types, and record/correct/void expenses with history', async uid => {
    const service = await services(uid);
    await service.initializeSettings(uid);
    const saved = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    const next = { ...saved, accounting: { paymentAllocation: 'proportional' as const, expensesEnabled: true } };
    await service.saveSettings(next, uid, saved);
    await service.saveExpenseCategory('Transport', true, undefined, 'transport');
    await service.saveExpense('expense', { categoryId: 'transport', categoryName: 'Transport', amount: 100,
      expenseDate: '2026-11-02', description: 'Collection trip', reference: '', clientId: 'c', loanId: 'initial' });
    await service.saveExpense('expense', { categoryId: 'transport', categoryName: 'Transport', amount: 125,
      expenseDate: '2026-11-02', description: 'Collection trip', reference: '', clientId: 'c', loanId: 'initial' }, 1);
    const expense = service.expenseFromDoc(await getDoc(doc(service.db, 'expenses/expense')) as Parameters<typeof service.expenseFromDoc>[0]);
    await service.voidExpense(expense, 'Duplicate');
    expect((await getDocs(collection(service.db, 'expenses/expense/history'))).size).toBe(3);
    expect((await getDoc(doc(service.db, 'expenses/expense'))).data()).toMatchObject({ status: 'void', updatedBy: uid, createdBy: uid });
    await service.saveExpenseCategory('Transport', false, { id: 'transport', name: 'Transport', active: true, revision: 1 });
  });
});

describe('Spark renewals', () => {
  it('renews a settled 30-day loan into another 30-day cycle and accepts its next receipt', async () => {
    const service = await services();
    await updateDoc(doc(service.db, 'clients/c'), { loanTermDays: 30, dailyAmount: 375 });
    await updateDoc(doc(service.db, 'payments/settlement'), { paymentDate: '2026-09-25' });
    const original = await service.readClient();
    await service.renewClient(original, { ...terms, loanTermDays: 30, dailyAmount: 750 }, 'Thirty-day renewal');
    const active = await service.readClient();
    const history = (await getDoc(doc(service.db, 'clients/c/renewals/00002'))).data()!;
    expect(active).toMatchObject({ loanTermDays: 30, dailyAmount: 750, activeLoanId: '00002' });
    expect(history.previousLoan.loanTermDays).toBe(30);
    expect(history.newLoan.loanTermDays).toBe(30);
    const collectorDb = environment.authenticatedContext('collector').firestore();
    await setDoc(doc(collectorDb, 'payments/thirty-day-receipt'), { clientId: 'c', loanId: '00002', amount: 750, paymentDate: terms.approvalDate,
      collectorId: 'collector', collectorName: 'Collector', notes: 'First collection for 30-day cycle', createdAt: serverTimestamp() });
    expect(await service.readPayment('thirty-day-receipt')).toMatchObject({ loanId: '00002', amount: 750, collectorId: 'collector' });
  });

  it.each(['admin', 'developer'])('%s can renew atomically without a Cloud Function', async uid => {
    const service = await services(uid);
    const original = await service.readClient();
    await service.renewClient(original, terms, 'Approved');
    const active = (await getDoc(doc(service.db, 'clients/c'))).data()!;
    const history = (await getDoc(doc(service.db, 'clients/c/renewals/00002'))).data()!;
    expect(active.activeLoanId).toBe('00002');
    expect(active.customImportedField).toEqual({ keep: true });
    expect(history.previousLoan.principal).toBe(10000);
    expect(history.newLoan.principal).toBe(20000);
    expect(history.approvedBy).toBe(uid);
    expect(history.totalPaid).toBe(11250);
    expect(history.paidOn).toBe('2026-10-23');
    await expect(service.renewClient(original, terms, '')).rejects.toThrow('changed');
    await expect(deleteDoc(doc(service.db, 'clients/c/renewals/00002'))).rejects.toThrow();
    expect((await getDocs(collection(service.db, 'clients/c/renewals'))).size).toBe(1);
  });

  it('rejects unpaid, late, stale, and invalid renewals without changing the client', async () => {
    const service = await services();
    const original = await service.readClient();
    await updateDoc(doc(service.db, 'payments/settlement'), { amount: 11249 });
    await expect(service.renewClient(original, terms, '')).rejects.toThrow('fully paid');
    await updateDoc(doc(service.db, 'payments/settlement'), { amount: 11250, paymentDate: '2026-10-24' });
    await expect(service.renewClient(original, terms, '')).rejects.toThrow('after its due date');
    await updateDoc(doc(service.db, 'payments/settlement'), { paymentDate: '2026-10-23' });
    await expect(service.renewClient(original, { ...terms, principal: -1 }, '')).rejects.toThrow('valid principal');
    expect((await getDoc(doc(service.db, 'clients/c'))).data()?.renewalCount).toBeUndefined();
  });

  it('serializes concurrent renewal approvals into exactly one new cycle', async () => {
    const service = await services();
    const original = await service.readClient();
    const results = await Promise.allSettled([service.renewClient(original, terms, ''), service.renewClient(original, terms, '')]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await getDocs(collection(service.db, 'clients/c/renewals'))).size).toBe(1);
  });

  it('requires settlement of the new cycle before a second renewal', async () => {
    const service = await services();
    await service.renewClient(await service.readClient(), terms, 'First approval');
    const current = await service.readClient();
    await expect(service.renewClient(current, terms, '')).rejects.toThrow('fully paid');
    await service.addPayment({ clientId: 'c', loanId: '00002', amount: 22500, paymentDate: '2026-11-03',
      collectorId: 'admin', collectorName: 'Admin', notes: '' }, 'second-settlement');
    await service.renewClient(current, { ...terms, approvalDate: '2026-11-03' }, 'Second approval');
    const next = (await getDoc(doc(service.db, 'clients/c'))).data()!;
    expect(next.renewalCount).toBe(2);
    expect(next.activeLoanId).toBe('00003');
    expect(next.originalTransactionNumber).toBe('00001');
    const record = (await getDoc(doc(service.db, 'clients/c/renewals/00003'))).data()!;
    expect(record.totalPaid).toBe(22500);
    expect(record.previousLoan.transactionNumber).toBe('00002');
  });
});

describe('Spark loan schedule settings', () => {
  it('persists both Sunday settings across initialization and another administrator session', async () => {
    const service = await services();
    const { DEFAULT_SETTINGS, mergeSettings } = await import('../src/config/settings');
    const policyPath = 'settings/Configurations/elements/loanSchedule';
    await deleteDoc(doc(service.db, policyPath));
    await service.initializeSettings('admin');
    expect((await getDoc(doc(service.db, policyPath))).data()?.skipSundays).toBe(false);
    let expected = structuredClone(DEFAULT_SETTINGS);
    for (const skipSundays of [true, false, true]) {
      const next = { ...expected, schedule: { skipSundays } };
      await service.saveSettings(next, 'admin', expected);
      await service.initializeSettings('admin');
      const saved = (await getDoc(doc(service.db, policyPath))).data()!;
      expect(mergeSettings({ schedule: saved }).schedule.skipSundays).toBe(skipSundays);
      expect(saved.updatedBy).toBe('admin');
      expected = next;
    }
    const secondSession = environment.authenticatedContext('developer').firestore();
    expect((await getDoc(doc(secondSession, policyPath))).data()?.skipSundays).toBe(true);
    const collector = environment.authenticatedContext('collector').firestore();
    expect((await getDoc(doc(collector, policyPath))).data()?.skipSundays).toBe(true);
    await expect(updateDoc(doc(collector, policyPath), { skipSundays: false })).rejects.toThrow();
    await expect(service.saveSettings(DEFAULT_SETTINGS, 'admin', DEFAULT_SETTINGS)).rejects.toThrow('changed in another session');
  });

  it.each(['missing', false, true] as const)('assesses an October 23 settlement using Sunday policy %s', async policy => {
    const service = await services();
    const policyRef = doc(service.db, 'settings/Configurations/elements/loanSchedule');
    if (policy === 'missing') await deleteDoc(policyRef);
    else await setDoc(policyRef, { skipSundays: policy, updatedAt: serverTimestamp(), updatedBy: 'admin' });
    const original = await service.readClient();
    if (policy === true) {
      await expect(service.renewClient(original, terms, 'Sunday policy eligibility')).resolves.toBeUndefined();
      const history = (await getDoc(doc(service.db, 'clients/c/renewals/00002'))).data()!;
      expect(history.paidOn).toBe('2026-10-23');
      expect(history.dueDate).toBe('2026-10-23');
    } else {
      await expect(service.renewClient(original, terms, '')).rejects.toThrow('after its due date');
      expect((await getDocs(collection(service.db, 'clients/c/renewals'))).size).toBe(0);
      expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()?.transactionSequence).toBe(1);
    }
  });

  it.each(['missing', false, true] as const)('archives both actual due dates using Sunday policy %s', async policy => {
    const service = await services();
    const { computeSchedule } = await import('../src/lib/loan');
    const policyRef = doc(service.db, 'settings/Configurations/elements/loanSchedule');
    if (policy === 'missing') await deleteDoc(policyRef);
    else await setDoc(policyRef, { skipSundays: policy, updatedAt: serverTimestamp(), updatedBy: 'admin' });
    await updateDoc(doc(service.db, 'payments/settlement'), { paymentDate: '2026-10-15' });
    await service.renewClient(await service.readClient(), terms, 'On-time under either schedule');
    const history = (await getDoc(doc(service.db, 'clients/c/renewals/00002'))).data()!;
    expect(history.dueDate).toBe(computeSchedule(client.approvalDate, client.loanTermDays, new Set(), terms.approvalDate, undefined, policy === true).dueDate);
    expect(history.newDueDate).toBe(computeSchedule(terms.approvalDate, terms.loanTermDays, new Set(), terms.approvalDate, undefined, policy === true).dueDate);
    expect(history.newDueDate).toBe(policy === true ? '2026-12-30' : '2026-12-22');
  });
});

describe('optional numbering resets', () => {
  async function recycleAndPurge(service: Awaited<ReturnType<typeof services>>, id: string) {
    await service.createTrashAction('trash', [{ id }])();
    const archive = (await getDoc(doc(service.db, 'clientTrash', id))).data()!;
    await service.createTrashAction('purge', [{ id, trashId: archive.trashId }])();
  }
  async function enable(service: Awaited<ReturnType<typeof services>>, uid = 'admin') {
    await setDoc(doc(service.db, 'settings/Configurations/elements/identifierPolicy'), { resetWhenEmpty: true, updatedAt: serverTimestamp(), updatedBy: uid });
  }

  it('preserves counters and historical reservations when the preference is off', async () => {
    const service = await services();
    await recycleAndPurge(service, 'c');
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()).toMatchObject({ clientSequence: 1, transactionSequence: 1 });
    await service.addClient(client);
    expect((await getDoc(doc(service.db, 'clients/mcl0002'))).data()).toMatchObject({ clientNumber: 'mcl0002', transactionNumber: '00002' });
  });

  it.each(['admin', 'developer'])('%s restarts both numbers after the final purge with fresh internal IDs and no old expense association', async uid => {
    const service = await services(uid);
    await service.initializeSettings(uid);
    const saved = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    const next = { ...saved, identifiers: { resetWhenEmpty: true } };
    await service.saveSettings(next, uid, saved);
    await service.initializeSettings(uid);
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/identifierPolicy'))).data()?.resetWhenEmpty).toBe(true);
    await service.createTrashAction('trash', [{ id: 'c' }])();
    const archive = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()?.clientSequence).toBe(1);
    const purge = service.createTrashAction('purge', [{ id: 'c', trashId: archive.trashId }]);
    await purge(); await purge();
    const counters = (await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()!;
    expect(counters).toMatchObject({ clientSequence: 0, transactionSequence: 0 });
    expect(typeof counters.identifierEpoch).toBe('string');
    await Promise.all([service.addClient(client), service.addClient(client)]);
    const created = (await getDocs(collection(service.db, 'clients'))).docs.map(source => ({ ...source.data(), id: source.id }));
    expect(created.map(record => record.clientNumber).sort()).toEqual(['mcl0001', 'mcl0002']);
    expect(created.map(record => record.transactionNumber).sort()).toEqual(['00001', '00002']);
    expect(new Set(created.map(record => record.id)).size).toBe(2);
    expect(created.every(record => !['c', 'mcl0001', 'mcl0002'].includes(record.id))).toBe(true);
    const { buildConsolidation } = await import('../src/lib/consolidation');
    const { clientFromDoc } = await import('../src/services/converters');
    const current = (await getDocs(collection(service.db, 'clients'))).docs.map(clientFromDoc);
    const oldCost = { id: 'old-expense', clientId: 'c', loanId: 'initial', status: 'posted', amount: 200 } as import('../src/types/expenses').Expense;
    expect(buildConsolidation(current, [], 'principalFirst', [oldCost]).every(row => row.expenseAmount === 0)).toBe(true);
  });

  it('does not reset while active clients or recoverable Trash remain; concurrent final purges reset once empty', async () => {
    const service = await services();
    await enable(service);
    await service.addClient(client); // c is still active; this is number 2.
    await recycleAndPurge(service, 'c');
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()).toMatchObject({ clientSequence: 2, transactionSequence: 2 });
    await service.addClient(client);
    await service.addClient(client);
    await service.createTrashAction('trash', [{ id: 'mcl0002' }, { id: 'mcl0003' }, { id: 'mcl0004' }])();
    const entries = (await getDocs(collection(service.db, 'clientTrash'))).docs.map(source => ({ id: source.id, trashId: source.data().trashId }));
    await service.createTrashAction('purge', [entries[0]])();
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()).toMatchObject({ clientSequence: 4, transactionSequence: 4 });
    await Promise.all(entries.slice(1).map(entry => service.createTrashAction('purge', [entry])()));
    expect((await getDocs(collection(service.db, 'clientTrash'))).empty).toBe(true);
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()).toMatchObject({ clientSequence: 0, transactionSequence: 0 });
    await service.addClient(client);
    expect((await getDocs(collection(service.db, 'clients'))).docs[0].data()).toMatchObject({ clientNumber: 'mcl0001', transactionNumber: '00001' });
  });

  it('serializes a final purge against a concurrent client creation without duplicate numbers', async () => {
    const service = await services();
    await enable(service);
    await service.createTrashAction('trash', [{ id: 'c' }])();
    const archive = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    await Promise.all([
      service.createTrashAction('purge', [{ id: 'c', trashId: archive.trashId }])(),
      service.addClient(client),
    ]);
    await service.addClient(client);
    const current = (await getDocs(collection(service.db, 'clients'))).docs;
    expect(current).toHaveLength(2);
    expect(new Set(current.map(record => record.data().clientNumber)).size).toBe(2);
    expect(new Set(current.map(record => record.data().transactionNumber)).size).toBe(2);
    expect(current.every(record => record.id !== 'c')).toBe(true);
    const highest = Math.max(...current.map(record => Number(record.data().transactionNumber)));
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()?.transactionSequence).toBe(highest);
  });

  it('starts at 1 when enabled after earlier permanent deletion and renews past retired reservations', async () => {
    const service = await services();
    await service.renewClient(await service.readClient(), terms, 'Prior loan');
    await recycleAndPurge(service, 'c');
    await enable(service);
    await service.addClient(client);
    const source = (await getDocs(collection(service.db, 'clients'))).docs[0];
    const { clientFromDoc } = await import('../src/services/converters');
    const current = clientFromDoc(source);
    expect(current).toMatchObject({ clientNumber: 'mcl0001', transactionNumber: '00001' });
    await service.addPayment({ clientId: current.id, amount: 11250, paymentDate: '2026-10-15', collectorId: 'admin', collectorName: 'Admin' }, 'new-settlement');
    await service.renewClient(current, terms, 'New generation renewal');
    expect((await getDoc(doc(service.db, 'clients', current.id))).data()?.transactionNumber).toBe('00002');
    expect((await getDoc(doc(service.db, 'settings/Identifiers/transactions/00002'))).data()?.clientId).toBe(current.id);
  });

  it('resets after automatic retention cleanup permanently removes the final client', async () => {
    const service = await services();
    await enable(service);
    await service.createTrashAction('trash', [{ id: 'c' }])();
    await environment.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'settings/Configurations/elements/trashPolicy'), { autoDeleteDays: 3 });
      await updateDoc(doc(context.firestore(), 'clientTrash/c'), { deletedAt: Timestamp.fromMillis(Date.now() - 4 * 86_400_000) });
    });
    await service.purgeExpiredClientTrash();
    expect((await getDoc(doc(service.db, 'settings/Configurations/elements/counters'))).data()).toMatchObject({ clientSequence: 0, transactionSequence: 0 });
  });
});

describe('Spark Trash', () => {
  it('persists every retention option and preserves the policy across initialization and sessions', async () => {
    const service = await services();
    const { DEFAULT_SETTINGS, mergeSettings } = await import('../src/config/settings');
    await service.initializeSettings('admin');
    const initial = { ...structuredClone(DEFAULT_SETTINGS), schedule: { skipSundays: true } };
    let expected = structuredClone(initial);
    for (const autoDeleteDays of [3, 7, 30, 0] as const) {
      const next = { ...expected, trash: { autoDeleteDays } };
      await service.saveSettings(next, 'admin', expected);
      await service.initializeSettings('admin');
      const saved = (await getDoc(doc(service.db, 'settings/Configurations/elements/trashPolicy'))).data()!;
      expect(mergeSettings({ trash: saved }).trash.autoDeleteDays).toBe(autoDeleteDays);
      expect(saved.updatedBy).toBe('admin');
      expected = next;
    }
    const secondSession = environment.authenticatedContext('developer').firestore();
    expect((await getDoc(doc(secondSession, 'settings/Configurations/elements/trashPolicy'))).data()?.autoDeleteDays).toBe(0);
    await expect(service.saveSettings({ ...expected, trash: { autoDeleteDays: 7 } }, 'admin', initial)).resolves.toBeUndefined();
    await expect(service.saveSettings(expected, 'admin', expected)).rejects.toThrow('changed in another session');
  });

  it.each([3, 7, 30])('automatically deletes expired clients and their ledgers after %s days, retaining recent clients', async days => {
    const service = await services();
    await service.renewClient(await service.readClient(), terms, 'Approved');
    await service.createTrashAction('trash', [{ id: 'c' }])();
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await Promise.all([
        setDoc(doc(db, 'settings/Configurations/elements/trashPolicy'), { autoDeleteDays: days }),
        updateDoc(doc(db, 'clientTrash/c'), { deletedAt: Timestamp.fromMillis(Date.now() - days * 86_400_000 - 60_000) }),
        setDoc(doc(db, 'clientTrash/recent'), { client, trashId: 'recent-v1', status: 'trashed', deletedAt: Timestamp.now() }),
      ]);
    });
    await service.purgeExpiredClientTrash();
    expect((await getDoc(doc(service.db, 'clientTrash/c'))).exists()).toBe(false);
    expect((await getDocs(collection(service.db, 'payments'))).empty).toBe(true);
    expect((await getDocs(collection(service.db, 'clients/c/renewals'))).empty).toBe(true);
    expect((await getDoc(doc(service.db, 'clientTrash/recent'))).exists()).toBe(true);
    expect((await getDoc(doc(service.db, 'settings/Identifiers/transactions/00002'))).exists()).toBe(true);
  });

  it('checks the current policy and Trash generation before starting automatic deletion', async () => {
    const service = await services();
    await service.createTrashAction('trash', [{ id: 'c' }])();
    const archive = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    const entry = { id: 'c', trashId: archive.trashId };
    const policyRef = doc(service.db, 'settings/Configurations/elements/trashPolicy');
    await environment.withSecurityRulesDisabled(async context => {
      await updateDoc(doc(context.firestore(), 'clientTrash/c'), { deletedAt: Timestamp.fromMillis(Date.now() - 8 * 86_400_000) });
    });
    await service.purgeExpiredClientTrash(); // Missing policy is off.
    for (const autoDeleteDays of [0, 30]) {
      await setDoc(policyRef, { autoDeleteDays });
      await service.mutateTrashEntry('purge', entry, `purge-${entry.trashId}`, true);
      expect((await getDoc(doc(service.db, 'clientTrash/c'))).data()?.status).toBe('trashed');
    }
    await setDoc(policyRef, { autoDeleteDays: 7 });
    await service.createTrashAction('restore', [entry])();
    await service.mutateTrashEntry('purge', entry, `purge-${entry.trashId}`, true);
    expect((await getDoc(doc(service.db, 'clients/c'))).exists()).toBe(true);
    await service.createTrashAction('trash', [{ id: 'c' }])();
    await service.mutateTrashEntry('purge', entry, `purge-${entry.trashId}`, true);
    expect((await getDoc(doc(service.db, 'clientTrash/c'))).data()?.status).toBe('trashed');
  });

  it.each(['admin', 'developer'])('%s can recycle, restore, and permanently delete renewed clients', async uid => {
    const service = await services(uid);
    await service.renewClient(await service.readClient(), terms, 'Approved');
    const original = (await getDoc(doc(service.db, 'clients/c'))).data()!;
    const recycle = service.createTrashAction('trash', [{ id: 'c' }]);
    await recycle(); await recycle();
    expect((await getDoc(doc(service.db, 'clients/c'))).exists()).toBe(false);
    const archive = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    expect(archive.client).toEqual(original);
    expect(archive.deletedBy).toBe(uid);
    await expect(deleteDoc(doc(service.db, 'payments/settlement'))).rejects.toThrow();
    await service.createTrashAction('restore', [{ id: 'c', trashId: archive.trashId }])();
    const restored = (await getDoc(doc(service.db, 'clients/c'))).data()!;
    expect(restored.customImportedField).toEqual(original.customImportedField);
    expect(restored.activeLoanId).toBe('00002');
    expect((await getDoc(doc(service.db, 'payments/settlement'))).exists()).toBe(true);
    await service.createTrashAction('trash', [{ id: 'c' }])();
    const next = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    await expect(service.createTrashAction('restore', [{ id: 'c', trashId: archive.trashId }])()).rejects.toThrow('Trash changed');
    const entry = { id: 'c', trashId: next.trashId };
    await service.createTrashAction('purge', [entry])();
    await service.createTrashAction('purge', [entry])();
    expect((await getDoc(doc(service.db, 'clientTrash/c'))).exists()).toBe(false);
    expect((await getDocs(collection(service.db, 'payments'))).size).toBe(0);
    expect((await getDocs(collection(service.db, 'clients/c/renewals'))).size).toBe(0);
    expect((await getDoc(doc(service.db, 'settings/Identifiers/transactions/00002'))).exists()).toBe(true);
  });

  it('resumes interrupted permanent deletion and refuses restoration once cleanup starts', async () => {
    const service = await services();
    await service.createTrashAction('trash', [{ id: 'c' }])();
    const archive = (await getDoc(doc(service.db, 'clientTrash/c'))).data()!;
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      const batch = writeBatch(db);
      for (let index = 0; index < 205; index += 1) batch.set(doc(db, 'payments', `extra-${index}`), {
        clientId: 'c', amount: 1, loanId: 'initial', paymentDate: '2026-10-20', collectorId: 'collector',
        collectorName: 'Collector', createdAt: serverTimestamp(),
      });
      batch.set(doc(db, 'receiptAudit/retained'), { actorId: 'admin' });
      batch.set(doc(db, 'clientTrashOperations', `purge-${archive.trashId}`), {
        operation: 'purge', requestKey: JSON.stringify({ operation: 'purge', entries: [{ id: 'c', trashId: archive.trashId }] }),
        actorId: 'admin', status: 'pending', updatedAt: serverTimestamp(),
      });
      await batch.commit();
    });
    await updateDoc(doc(service.db, 'clientTrash/c'), { status: 'purging', purgeOperationId: `purge-${archive.trashId}` });
    await expect(service.createTrashAction('restore', [{ id: 'c', trashId: archive.trashId }])()).rejects.toThrow('can no longer be restored');
    await service.purgeExpiredClientTrash(); // Already-started cleanup resumes even with the policy off.
    expect((await getDoc(doc(service.db, 'clientTrash/c'))).exists()).toBe(false);
    expect((await getDocs(collection(service.db, 'payments'))).size).toBe(0);
    expect((await getDoc(doc(service.db, 'receiptAudit/retained'))).exists()).toBe(true);
  });

  it('keeps completed clients when a bulk selection fails and refuses invalid selections', async () => {
    const service = await services();
    await expect(service.createTrashAction('trash', [{ id: 'c' }, { id: 'missing' }])()).rejects.toThrow('1 of 2 clients completed');
    expect((await getDoc(doc(service.db, 'clientTrash/c'))).exists()).toBe(true);
    expect(() => service.createTrashAction('trash', [])).toThrow();
    await expect(service.createTrashAction('trash', [{ id: '../escape' }])()).rejects.toThrow('Invalid client');
  });
});

describe('Spark receipts and permissions', () => {
  it.each(['admin', 'developer'])('%s can correct a collector receipt without changing its attribution', async uid => {
    const service = await services(uid);
    const expected = await service.readPayment('settlement');
    const correction = { amount: 11000, paymentDate: '2026-10-22', notes: 'Reconciled collector amount' };
    await service.updatePayment('settlement', correction, expected);
    await service.updatePayment('settlement', correction, expected);
    const saved = await service.readPayment('settlement');
    expect(saved).toMatchObject({ ...correction, id: expected.id, collectorId: 'collector', collectorName: 'Collector' });
    expect(saved.createdAt?.getTime()).toBe(expected.createdAt?.getTime());
    expect((await getDocs(collection(service.db, 'payments'))).size).toBe(1);
    await expect(service.updatePayment('settlement', { ...correction, amount: 10999 }, expected)).rejects.toThrow('changed');
    await service.addPayment({ clientId: 'c', amount: 250, paymentDate: '2026-10-22', collectorId: uid, collectorName: uid, notes: '' }, 'other');
    await expect(service.updatePayment('settlement', { ...correction, amount: 11001 }, saved)).rejects.toThrow('remaining payable');
  });

  it('clears legacy notes and rejects corrections after a renewal', async () => {
    const service = await services();
    await updateDoc(doc(service.db, 'payments/settlement'), { note: 'Legacy Android note' });
    const expected = await service.readPayment('settlement');
    await service.updatePayment('settlement', { amount: expected.amount, paymentDate: expected.paymentDate, notes: '' }, expected);
    expect((await service.readPayment('settlement')).notes).toBe('');
    expect((await getDoc(doc(service.db, 'payments/settlement'))).data()).not.toHaveProperty('note');
    await service.renewClient(await service.readClient(), terms, 'Closed cycle');
    await expect(service.updatePayment('settlement', { amount: 11000, paymentDate: expected.paymentDate, notes: '' }, expected)).rejects.toThrow('loan changed');
  });

  it('keeps receipt retries idempotent and never resurrects a deleted receipt', async () => {
    const service = await services();
    const input = { clientId: 'c', loanId: 'initial', amount: 10, paymentDate: '2026-11-02', collectorId: 'admin', collectorName: 'Admin', notes: '' };
    await service.addPayment(input, 'stable');
    await service.addPayment(input, 'stable');
    await expect(service.addPayment({ ...input, amount: 11 }, 'stable')).rejects.toThrow('different details');
    const expected = await service.readPayment('stable');
    await updateDoc(doc(service.db, 'payments/stable'), { amount: 9 });
    await expect(service.deletePayment('stable', expected)).rejects.toThrow('changed');
    await service.deletePayment('stable', await service.readPayment('stable'));
    await service.addPayment({ ...input, amount: 9 }, 'stable');
    expect((await getDoc(doc(service.db, 'payments/stable'))).exists()).toBe(false);
    expect((await getDoc(doc(service.db, 'receiptDeletions/stable'))).exists()).toBe(true);
    await expect(deleteDoc(doc(service.db, 'receiptDeletions/stable'))).rejects.toThrow();
  });

  it.each(['collector', 'inactive'])('%s cannot invoke any administrative transaction', async uid => {
    const service = await services(uid);
    await expect(service.createTrashAction('trash', [{ id: 'c' }])()).rejects.toThrow('administrator');
    await expect(service.renewClient({ id: 'c', ...client }, terms, '')).rejects.toThrow('administrator');
    await expect(service.addPayment({ clientId: 'c', amount: 1, paymentDate: '2026-11-02', collectorId: uid, collectorName: uid }, 'denied')).rejects.toThrow('administrator');
    await expect(service.updatePayment('settlement', { amount: 100, paymentDate: '2026-10-23', notes: '' }, {
      id: 'settlement', clientId: 'c', amount: 11250, paymentDate: '2026-10-23', collectorId: 'collector', collectorName: 'Collector', createdAt: new Date(),
    })).rejects.toThrow('administrator');
  });

  it('security rules require a complete recycle snapshot and preserve manual-only developer profiles', async () => {
    const service = await services();
    const batch = writeBatch(service.db);
    batch.set(doc(service.db, 'clientTrash/c'), { client: { ...client, principal: 1 }, trashId: 'forged',
      deletedAt: serverTimestamp(), deletedBy: 'admin', deletedByName: 'Admin', status: 'trashed' });
    batch.delete(doc(service.db, 'clients/c'));
    await expect(batch.commit()).rejects.toThrow();
    await expect(getDoc(doc(service.db, 'users/developer'))).rejects.toThrow();
    await expect(updateDoc(doc(service.db, 'users/developer'), { active: false })).rejects.toThrow();
    await expect(deleteDoc(doc(service.db, 'users/admin'))).rejects.toThrow();
    expect((await getDoc(doc(service.db, 'clients/c'))).data()?.principal).toBe(10000);
  });
});
