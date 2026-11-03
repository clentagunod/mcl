import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { mutateReceipt } from '../lib/receipt.js';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-mcl-policy');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8188');
let app, db;
before(() => { app = initializeApp({ projectId: 'demo-mcl-policy' }, 'receipt-tests'); db = getFirestore(app); });
beforeEach(async () => {
  await fetch('http://127.0.0.1:8188/emulator/v1/projects/demo-mcl-policy/databases/(default)/documents', { method: 'DELETE' });
  await Promise.all([
    db.doc('users/admin').set({ role: 'admin', fullName: 'Administrator' }),
    db.doc('users/collector').set({ role: 'collector', fullName: 'Verified Collector', active: true }),
    db.doc('users/inactive').set({ role: 'admin', active: false }),
    db.doc('clients/c').set({ principal: 100, interest: 0, loanTermDays: 45, dailyAmount: 25, approvalDate: '2026-11-01' }),
    db.doc('settings/Configurations/elements/paymentPolicy').set({ enforceDailyMinimum: false }),
  ]);
});
after(async () => { await db.terminate(); await deleteApp(app); });
const input = (patch = {}) => ({ clientId: 'c', loanId: 'initial', amount: 75, paymentDate: '2026-11-02', notes: '', collectorId: 'forged', collectorName: 'Forged', ...patch });
const create = (id, patch = {}, uid = 'collector') => mutateReceipt(db, uid, { operation: 'create', id, operationId: id, input: input(patch) }, '2026-11-02');
const change = (operation, id, operationId, expected, patch = {}) => mutateReceipt(db, 'admin', { operation, id, operationId, expected, ...(operation === 'correct' ? { input: input(patch) } : {}) }, '2026-11-02');

test('different simultaneous receipt IDs serialize against one loan balance', async () => {
  const results = await Promise.allSettled([create('a'), create('b')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('payments').get()).docs.reduce((sum, doc) => sum + doc.data().amount, 0), 75);
  assert.equal((await db.doc('clients/c').get()).data().receiptRevision, 1);
});
test('a concurrent duplicate, lost acknowledgement, and later retry never duplicate or resurrect money', async () => {
  await Promise.all([create('stable'), create('stable')]);
  const receipt = (await db.doc('payments/stable').get()).data();
  assert.equal(receipt.collectorId, 'collector'); assert.equal(receipt.collectorName, 'Verified Collector');
  await change('delete', 'stable', 'delete-operation', receipt);
  await create('stable');
  assert.equal((await db.doc('payments/stable').get()).exists, false);
  assert.equal((await db.collection('receiptAudit').get()).size, 2);
});
test('rejects forged actor access, invalid money/dates, and collector corrections', async () => {
  for (const uid of ['', 'missing', 'inactive']) await assert.rejects(create('denied', {}, uid));
  for (const patch of [{ amount: Infinity }, { amount: 0.001 }, { paymentDate: '2026-02-30' }, { paymentDate: '2026-11-03' }, { paymentDate: '2026-10-31' }]) await assert.rejects(create('invalid', patch));
  await create('a');
  await assert.rejects(mutateReceipt(db, 'collector', { operation: 'correct', id: 'a', operationId: 'correction', input: input(), expected: input() }, '2026-11-02'));
  assert.equal((await db.collection('receiptAudit').get()).size, 1);
});
test('minimum policy allows administrator final settlements and remains current at submission', async () => {
  await db.doc('settings/Configurations/elements/paymentPolicy').set({ enforceDailyMinimum: true });
  await create('first', { amount: 90 });
  await assert.rejects(create('collector-final', { amount: 10 }), /minimum/);
  await create('admin-final', { amount: 10 }, 'admin');
  assert.equal((await db.collection('payments').get()).size, 2);
});
test('corrections retain original entry time and actor, check stale edits, and write immutable before/after events', async () => {
  await create('a'); const old = (await db.doc('payments/a').get()).data();
  await change('correct', 'a', 'correction', old, { amount: 50, notes: 'Corrected' });
  await change('correct', 'a', 'correction', old, { amount: 50, notes: 'Corrected' });
  const next = (await db.doc('payments/a').get()).data();
  assert.equal(next.createdAt.toMillis(), old.createdAt.toMillis());
  assert.equal(next.collectorId, 'collector'); assert.equal(next.updatedBy, 'admin'); assert.equal(next.amount, 50);
  const event = (await db.doc('receiptAudit/correction').get()).data();
  assert.equal(event.before.amount, 75); assert.equal(event.after.amount, 50);
  await assert.rejects(change('correct', 'a', 'stale', old, { amount: 60 }), /changed elsewhere/);
});
test('deletion is retryable and preserves a record of the removed receipt', async () => {
  await create('a'); const old = (await db.doc('payments/a').get()).data();
  await change('delete', 'a', 'delete-a', old); await change('delete', 'a', 'delete-a', old);
  assert.equal((await db.doc('payments/a').get()).exists, false);
  assert.equal((await db.doc('receiptAudit/delete-a').get()).data().before.amount, 75);
});

test('deleting a legacy receipt reserves its ID against a delayed original submission', async () => {
  const legacy = { ...input(), collectorId: 'collector', collectorName: 'Verified Collector', createdAt: FieldValue.serverTimestamp() };
  await db.doc('payments/legacy').set(legacy);
  await change('delete', 'legacy', 'delete-legacy', legacy);
  await create('legacy');
  assert.equal((await db.doc('payments/legacy').get()).exists, false);
  await assert.rejects(mutateReceipt(db, 'collector', { operation: 'create', id: 'legacy', operationId: 'different', input: input() }, '2026-11-02'), /receipt ID/);
});
test('old receipts cannot fund the new cycle and stale forms cannot enter or correct it', async () => {
  await create('old'); const old = (await db.doc('payments/old').get()).data();
  await db.doc('clients/c').update({ activeLoanId: '00002', renewalCount: 1 });
  await assert.rejects(create('stale'), /renewed/);
  await assert.rejects(change('delete', 'old', 'stale-delete', old), /renewed/);
  await create('new', { loanId: '00002', amount: 100 });
  assert.equal((await db.doc('payments/new').get()).data().amount, 100);
});
test('malformed current amounts block new receipts and can be corrected by an administrator', async () => {
  await db.doc('payments/bad').set({ ...input({ amount: Infinity }), collectorId: 'collector', createdAt: FieldValue.serverTimestamp() });
  await assert.rejects(create('a'), /invalid existing/);
  const old = (await db.doc('payments/bad').get()).data();
  await change('correct', 'bad', 'repair', old, { amount: 10 });
  await create('a');
});
