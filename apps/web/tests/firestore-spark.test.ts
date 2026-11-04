import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';

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
      setDoc(doc(db, 'settings/Identifiers/transactions/00001'), { clientId: 'c' }),
    ]);
  });
});
afterAll(async () => { await environment?.cleanup(); });

async function services(uid = 'admin') {
  state.db = environment.authenticatedContext(uid).firestore();
  state.auth.currentUser = { uid };
  vi.resetModules();
  const [renewals, trash, payments, converters, settings, trashOperations] = await Promise.all([
    import('../src/services/renewals'), import('../src/services/client-trash'),
    import('../src/services/payments'), import('../src/services/converters'),
    import('../src/services/settings'), import('../src/services/client-trash-operations'),
  ]);
  const db = state.db;
  return { db, ...renewals, ...trash, ...payments, ...settings, ...trashOperations,
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

describe('Spark renewals', () => {
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

describe('Spark Trash', () => {
  it('persists every retention option and preserves the policy across initialization and sessions', async () => {
    const service = await services();
    const { DEFAULT_SETTINGS, mergeSettings } = await import('../src/config/settings');
    await service.initializeSettings('admin');
    let expected = structuredClone(DEFAULT_SETTINGS);
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
    await expect(service.saveSettings({ ...expected, trash: { autoDeleteDays: 7 } }, 'admin', DEFAULT_SETTINGS)).resolves.toBeUndefined();
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
