import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { renewClientLoan } from '../lib/renew-client.js';

// Never fall through to a live project or application default credentials.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-mcl-policy');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8188');
let app, db;
const client = { clientNumber: 'mcl0001', transactionNumber: '00001', firstName: 'Juan', middleName: '', lastName: 'Cruz', address: 'San Miguel', cellphone: '09170000000', principal: 10000, interest: 1250, dailyAmount: 250, loanTermDays: 45, approvalDate: '2026-09-01' };
const terms = { principal: 20000, interest: 2500, dailyAmount: 450, loanTermDays: 50, approvalDate: '2026-11-02' };
const request = (patch = {}) => ({ clientId: 'mcl0001', expectedLoanId: 'initial', expectedTransactionNumber: '00001', terms, notes: 'Approved after review', ...patch });
before(() => { app = initializeApp({ projectId: 'demo-mcl-policy' }, 'renewal-tests'); db = getFirestore(app); });
beforeEach(async () => {
  await fetch('http://127.0.0.1:8188/emulator/v1/projects/demo-mcl-policy/databases/(default)/documents', { method: 'DELETE' });
  await Promise.all([
    db.doc('users/admin').set({ role: 'admin', fullName: 'Admin One', active: true }),
    db.doc('users/collector').set({ role: 'collector', active: true }),
    db.doc('users/inactive').set({ role: 'admin', active: false }),
    db.doc('clients/mcl0001').set(client),
    db.doc('settings/Configurations/elements/counters').set({ clientSequence: 1, transactionSequence: 1 }),
    db.doc('settings/Identifiers/transactions/00001').set({ clientId: 'mcl0001' }),
    db.doc('payments/original').set({ clientId: 'mcl0001', amount: 11250, paymentDate: '2026-10-23', collectorId: 'collector', collectorName: 'Collector One', createdAt: FieldValue.serverTimestamp() }),
  ]);
});
after(async () => { await db.terminate(); await deleteApp(app); });
const renew = (body = request(), uid = 'admin') => renewClientLoan(db, uid, body, '2026-11-02');

test('grants a renewal atomically, preserves identity and receipts, and records both loan snapshots', async () => {
  const result = await renew();
  assert.deepEqual(result, { renewalId: '00002', transactionNumber: '00002' });
  const next = (await db.doc('clients/mcl0001').get()).data();
  assert.equal(next.clientNumber, 'mcl0001');
  assert.equal(next.originalTransactionNumber, '00001');
  assert.equal(next.activeLoanId, '00002');
  assert.equal(next.renewalCount, 1);
  assert.equal(next.principal, 20000);
  const history = (await db.doc('clients/mcl0001/renewals/00002').get()).data();
  assert.equal(history.previousLoan.principal, 10000);
  assert.equal(history.previousLoan.transactionNumber, '00001');
  assert.equal(history.newLoan.transactionNumber, '00002');
  assert.equal(history.totalPaid, 11250);
  assert.equal(history.approvedBy, 'admin');
  assert.equal(history.approvedByName, 'Admin One');
  assert.equal(history.paidOn, '2026-10-23');
  assert.equal(history.dueDate, '2026-10-23');
  assert.equal(history.newDueDate, '2026-12-30');
  assert.ok(history.createdAt.toDate());
  assert.equal((await db.doc('payments/original').get()).data().amount, 11250);
  assert.equal((await db.doc('settings/Configurations/elements/counters').get()).data().clientSequence, 1);
});

test('only active admins can grant renewal', async () => {
  for (const uid of ['', 'collector', 'inactive', 'missing']) await assert.rejects(renew(request(), uid), (e) => ['unauthenticated', 'permission-denied'].includes(e.code));
  assert.equal((await db.collection('clients/mcl0001/renewals').get()).size, 0);
});

test('outstanding and late loans cannot be renewed even with forged eligibility fields', async () => {
  await db.doc('payments/original').update({ amount: 11249.99 });
  await assert.rejects(renew(request({ eligible: true, outstanding: 0 })), /fully paid/);
  await db.doc('payments/original').update({ amount: 11250, paymentDate: '2026-10-24' });
  await assert.rejects(renew(), /after its due date/);
});

test('a duplicate or concurrent renewal request issues exactly one loan', async () => {
  const results = await Promise.allSettled([renew(), renew()]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('clients/mcl0001/renewals').get()).size, 1);
  assert.equal((await db.doc('settings/Configurations/elements/counters').get()).data().transactionSequence, 2);
  await assert.rejects(renew(), /another session/);
});

test('old receipts cannot fund another renewal; a paid current cycle can renew again', async () => {
  await renew();
  const nextRequest = request({ expectedLoanId: '00002', expectedTransactionNumber: '00002' });
  await assert.rejects(renew(nextRequest), /fully paid/);
  await db.doc('payments/renewed').set({ clientId: 'mcl0001', loanId: '00002', amount: 22500, paymentDate: '2026-11-02' });
  await renew(nextRequest);
  assert.equal((await db.doc('clients/mcl0001').get()).data().renewalCount, 2);
  const history = (await db.doc('clients/mcl0001/renewals/00003').get()).data();
  assert.equal(history.previousLoan.transactionNumber, '00002');
  assert.equal(history.totalPaid, 22500);
});

test('invalid new terms and exhausted counters leave no partial changes', async () => {
  await assert.rejects(renew(request({ terms: { ...terms, principal: -100 } })), /valid principal/);
  await db.doc('settings/Configurations/elements/counters').update({ transactionSequence: 99999 });
  await assert.rejects(renew(), /exhausted/);
  assert.equal((await db.collection('clients/mcl0001/renewals').get()).size, 0);
  assert.equal((await db.doc('clients/mcl0001').get()).data().transactionNumber, '00001');
});

test('late or missing prior history blocks subsequent renewal', async () => {
  await renew();
  await db.doc('payments/renewed').set({ clientId: 'mcl0001', loanId: '00002', amount: 22500, paymentDate: '2026-11-02' });
  const next = request({ expectedLoanId: '00002', expectedTransactionNumber: '00002' });
  await db.doc('clients/mcl0001/renewals/00002').update({ paidOn: '2026-10-24' });
  await assert.rejects(renew(next), /history must be complete/);
  await db.doc('clients/mcl0001/renewals/00002').delete();
  await assert.rejects(renew(next), /history must be complete/);
});
