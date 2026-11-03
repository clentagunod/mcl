import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

let environment;
const policyPath = 'settings/Configurations/elements/paymentPolicy';
before(async () => {
  environment = await initializeTestEnvironment({ projectId: 'demo-mcl-policy', firestore: { host: '127.0.0.1', port: 8188, rules: await readFile('firestore.rules', 'utf8') } });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/admin'), { role: 'admin', fullName: 'Admin' }),
      setDoc(doc(db, 'users/collector'), { role: 'collector', active: true, fullName: 'Collector' }),
      setDoc(doc(db, 'users/inactive'), { role: 'collector', active: false }),
      setDoc(doc(db, 'users/inactive-admin'), { role: 'admin', active: false }),
      setDoc(doc(db, 'clients/mcl0001'), { principal: 10000, interest: 1250, loanTermDays: 45, dailyAmount: 250, approvalDate: '2026-11-01' }),
      setDoc(doc(db, 'settings/Configurations/elements/counters'), { clientSequence: 1, transactionSequence: 1 }),
      setDoc(doc(db, policyPath), { enforceDailyMinimum: false }),
    ]);
  });
});
after(async () => { await environment?.cleanup(); });

const as = (uid) => environment.authenticatedContext(uid).firestore();
const payment = (amount, extra = {}) => ({ clientId: 'mcl0001', amount, paymentDate: '2026-11-02', collectorId: 'collector', collectorName: 'Collector', createdAt: serverTimestamp(), ...extra });
let sequence = 0;
const write = (db, amount, extra) => setDoc(doc(db, 'payments', `receipt-${++sequence}`), payment(amount, extra));

test('unrestricted collectors can record smaller, agreed or larger payments', async () => {
  const db = as('collector');
  for (const amount of [100, 250, 500]) await assertSucceeds(write(db, amount));
});
test('enabled policy rejects below-minimum collector receipts at the database boundary', async () => {
  await setDoc(doc(as('admin'), policyPath), { enforceDailyMinimum: true });
  const db = as('collector');
  await assertFails(write(db, 249.99));
  await assertSucceeds(write(db, 250));
  await assertSucceeds(write(db, 500));
});
test('policy changes apply to the next receipt even in an already signed-in app', async () => {
  const db = as('collector');
  await assertSucceeds(write(db, 100));
  await setDoc(doc(as('admin'), policyPath), { enforceDailyMinimum: true });
  await assertFails(write(db, 100));
  await setDoc(doc(as('admin'), policyPath), { enforceDailyMinimum: false });
  await assertSucceeds(write(db, 100));
});
test('legacy clients use a rounded-up daily amount if the saved field is absent', async () => {
  await setDoc(doc(as('admin'), policyPath), { enforceDailyMinimum: true });
  await setDoc(doc(as('admin'), 'clients/legacy'), { principal: 10000, interest: 1250, loanTermDays: 58 });
  await assertFails(write(as('collector'), 193.96, { clientId: 'legacy' }));
  await assertSucceeds(write(as('collector'), 193.97, { clientId: 'legacy' }));
});
test('admins can record partial receipts and final settlements below the collector minimum', async () => {
  await setDoc(doc(as('admin'), policyPath), { enforceDailyMinimum: true });
  await assertSucceeds(write(as('admin'), 10, { collectorId: 'admin', collectorName: 'Admin' }));
  await assertFails(write(as('collector'), 10));
});
test('collectors may read the policy document, but cannot list other settings or change policy', async () => {
  const db = as('collector');
  await assertSucceeds(getDoc(doc(db, policyPath)));
  await assertFails(getDocs(collection(db, 'settings/Configurations/elements')));
  await assertFails(getDoc(doc(db, 'settings/Configurations/elements/counters')));
  await assertFails(updateDoc(doc(db, policyPath), { enforceDailyMinimum: false }));
  await assertFails(updateDoc(doc(db, 'clients/mcl0001'), { dailyAmount: 1 }));
});
test('inactive and unauthenticated users cannot read policy or record payments', async () => {
  for (const db of [as('inactive'), as('inactive-admin'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, policyPath)));
    await assertFails(write(db, 250));
  }
});

test('inactive admins cannot access data, edit loans, or change roles and settings', async () => {
  const db = as('inactive-admin');
  await assertFails(getDocs(collection(db, 'clients')));
  await assertFails(updateDoc(doc(db, 'clients/mcl0001'), { principal: 1 }));
  await assertFails(updateDoc(doc(db, 'users/collector'), { active: false }));
  await assertFails(updateDoc(doc(db, policyPath), { enforceDailyMinimum: true }));
  await assertSucceeds(getDoc(doc(db, 'users/inactive-admin')));
});

test('both roles reject nonfinite, unsupported, or fractional-centavo receipt amounts', async () => {
  for (const uid of ['admin', 'collector']) {
    for (const amount of [Infinity, NaN, 0.001, 1000000000]) await assertFails(write(as(uid), amount));
    for (const amount of [0.01, 0.29, 193.97, 123456789.12]) await assertSucceeds(write(as(uid), amount));
  }
});

test('both roles reject impossible, future, and preapproval receipt dates', async () => {
  for (const uid of ['admin', 'collector']) {
    for (const paymentDate of ['2026-99-99', '2026-02-30', '2099-01-01', '2026-10-31', 'abcdefghij']) {
      await assertFails(write(as(uid), 1, { paymentDate }));
    }
    await assertSucceeds(write(as(uid), 1, { paymentDate: '2026-11-01' }));
  }
});

test('collector display attribution matches the authenticated profile', async () => {
  await assertFails(write(as('collector'), 250, { collectorName: 'Another person' }));
  await assertSucceeds(write(as('collector'), 250));
});

test('backend-only receipt gate closes direct admin and collector mutations; audit events are immutable', async () => {
  await assertSucceeds(write(as('admin'), 250));
  await setDoc(doc(as('admin'), 'settings/Configurations/elements/receiptPolicy'), { backendOnly: true });
  for (const uid of ['admin', 'collector']) await assertFails(write(as(uid), 250));
  await environment.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'payments/existing'), payment(250));
    await setDoc(doc(context.firestore(), 'receiptAudit/entry'), { actorId: 'admin' });
  });
  await assertFails(updateDoc(doc(as('admin'), 'payments/existing'), { amount: 100 }));
  await assertFails(deleteDoc(doc(as('admin'), 'payments/existing')));
  await assertSucceeds(getDoc(doc(as('admin'), 'receiptAudit/entry')));
  await assertFails(getDoc(doc(as('collector'), 'receiptAudit/entry')));
  await assertFails(updateDoc(doc(as('admin'), 'receiptAudit/entry'), { actorId: 'other' }));
  await assertFails(deleteDoc(doc(as('admin'), 'receiptAudit/entry')));
});
test('required receipt validation and collector ownership remain enforced', async () => {
  const db = as('collector');
  await assertFails(write(db, 0));
  await assertFails(write(db, -1));
  await assertFails(write(db, 250, { collectorId: 'another-user' }));
  await assertFails(write(db, 250, { clientId: 'missing' }));
  await assertSucceeds(write(db, 250, { notes: 'Daily Payment' }));
  await assertFails(write(db, 250, { notes: 'x'.repeat(1501) }));
});
test('missing policy preserves backwards-compatible informational behavior', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(context.firestore(), policyPath));
  });
  await assertSucceeds(write(as('collector'), 100));
});

test('only the server may advance loan cycles or write immutable renewal history', async () => {
  const admin = as('admin');
  await assertFails(updateDoc(doc(admin, 'clients/mcl0001'), { activeLoanId: '00002', renewalCount: 1 }));
  await assertFails(setDoc(doc(admin, 'clients/mcl0001/renewals/00002'), { paidOn: '2026-11-02' }));
  await assertFails(setDoc(doc(as('collector'), 'clients/mcl0001/renewals/00002'), { paidOn: '2026-11-02' }));
});

test('renewed clients require the active cycle on every admin and collector receipt', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'clients/mcl0001'), { activeLoanId: '00002', renewalCount: 1, approvalDate: '2026-11-02' });
    await setDoc(doc(context.firestore(), 'payments/old'), payment(11250));
  });
  for (const uid of ['admin', 'collector']) {
    const db = as(uid);
    await assertFails(write(db, 250));
    await assertFails(write(db, 250, { loanId: 'initial' }));
    await assertFails(write(db, 250, { loanId: '00002', paymentDate: '2026-11-01' }));
    await assertSucceeds(write(db, 250, { loanId: '00002' }));
  }
  await assertFails(deleteDoc(doc(as('admin'), 'payments/old')));
  await assertFails(updateDoc(doc(as('admin'), 'payments/old'), { loanId: '00002' }));
  await assertFails(deleteDoc(doc(as('admin'), 'clients/mcl0001')));
});

test('renewal history is readable by admins and private from collectors', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'clients/mcl0001/renewals/00002'), { sequence: 1 });
  });
  const path = 'clients/mcl0001/renewals/00002';
  await assertSucceeds(getDoc(doc(as('admin'), path)));
  await assertFails(getDoc(doc(as('collector'), path)));
  await assertFails(updateDoc(doc(as('admin'), path), { sequence: 2 }));
  await assertFails(deleteDoc(doc(as('admin'), path)));
});
