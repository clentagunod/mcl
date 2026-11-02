import { before, beforeEach, after, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

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
      setDoc(doc(db, 'clients/mcl0001'), { principal: 10000, interest: 1250, loanTermDays: 45, dailyAmount: 250 }),
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
  for (const db of [as('inactive'), environment.unauthenticatedContext().firestore()]) {
    await assertFails(getDoc(doc(db, policyPath)));
    await assertFails(write(db, 250));
  }
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
