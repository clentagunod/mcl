import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { bootstrap } from './web/scripts/bootstrap-loan-balances.mjs';

const requireFunctions = createRequire(new URL('../../web/functions/package.json', import.meta.url));
const { initializeApp, deleteApp } = requireFunctions('firebase-admin/app');
const { getFirestore, FieldValue } = requireFunctions('firebase-admin/firestore');
const project = 'demo-mcl-receipts-v1';
const rules = fileURLToPath(new URL('./firestore.rules', import.meta.url));
let app, db;
const sourceClient = {
  clientNumber: 'c', transactionNumber: '00001', firstName: 'Test', middleName: '', lastName: 'Borrower',
  address: 'Tagum', cellphone: '09171234567', principal: 100, interest: 0, dailyAmount: 3,
  loanTermDays: 45, approvalDate: '2026-01-01',
};
const receipt = (patch = {}) => ({
  clientId: 'c', amount: 25, paymentDate: '2026-01-02', collectorId: 'admin', collectorName: 'Admin',
  notes: 'cash', createdAt: FieldValue.serverTimestamp(), ...patch,
});
const options = patch => ({ project, rules, ...patch });
const apply = patch => bootstrap(options({ apply: true, 'confirm-project': project, confirmedLegacyWritersDisabled: true, ...patch }));

before(() => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):[0-9]+$/);
  if (process.env.GCLOUD_PROJECT) assert.equal(process.env.GCLOUD_PROJECT, project);
  app = initializeApp({ projectId: project }, 'bootstrap-fixture');
  db = getFirestore(app);
});
beforeEach(async () => {
  const cleared = await fetch('http://' + process.env.FIRESTORE_EMULATOR_HOST + '/emulator/v1/projects/' + project + '/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(cleared.ok, true);
  await Promise.all([
    db.doc('settings/receiptControl/current/config').set({ enabled: false, mode: 'ledger-v1' }),
    db.doc('clients/c').set(sourceClient),
    db.doc('payments/p1').set(receipt()),
    db.doc('settings/Configurations/elements/counters').set({ clientSequence: 4, transactionSequence: 10 }),
    db.doc('settings/Identifiers/clients/c').set({ clientId: 'c' }),
    db.doc('settings/Identifiers/transactions/00001').set({ clientId: 'c' }),
  ]);
});
after(async () => { await db?.terminate(); if (app) await deleteApp(app); });

test('bootstrap defaults to audit and writes no balance, counter or source changes', async () => {
  const counter = (await db.doc('settings/Configurations/elements/counters').get()).data();
  const source = (await db.doc('clients/c').get()).data();
  await bootstrap(options());
  assert.equal((await db.collection('loanBalances').get()).empty, true);
  assert.deepEqual((await db.doc('settings/Configurations/elements/counters').get()).data(), counter);
  assert.deepEqual((await db.doc('clients/c').get()).data(), source);
  assert.equal((await db.doc('settings/receiptControl/current/config').get()).data().enabled, false);
});

test('explicit apply seeds exact cents and treats absent, blank and null legacy cycles as initial', async () => {
  await db.doc('clients/c').update({ activeLoanId: null });
  await Promise.all([
    db.doc('payments/p1').set(receipt({ amount: 10 })),
    db.doc('payments/blank').set(receipt({ amount: 0.1, loanId: '' })),
    db.doc('payments/null').set(receipt({ amount: 0.2, loanId: null })),
  ]);
  await apply();
  const ledger = (await db.doc('loanBalances/c').get()).data();
  assert.equal(ledger.loanId, 'initial');
  assert.equal(ledger.paidCents, 1030);
  assert.equal(ledger.revision, 0);
  assert.equal(ledger.operation, 'open');
  assert.equal(ledger.receiptId, '');
  assert.ok(ledger.updatedAt.toDate());
  assert.equal((await db.doc('settings/receiptControl/current/config').get()).data().enabled, false);
});

test('a repeated apply preserves an already matching ledger revision and metadata', async () => {
  await apply();
  await db.doc('loanBalances/c').update({ revision: 7, operation: 'create', receiptId: 'p1' });
  const before = (await db.doc('loanBalances/c').get()).data();
  await apply();
  assert.deepEqual((await db.doc('loanBalances/c').get()).data(), before);
});

test('active and archived source data, counters and reservations remain unchanged', async () => {
  const archive = { client: { ...sourceClient, clientNumber: 'archived', transactionNumber: '00002' },
    status: 'trashed', trashId: 'archive-v1', deletedAt: FieldValue.serverTimestamp(), deletedBy: 'admin', deletedByName: 'Admin' };
  await Promise.all([
    db.doc('clientTrash/archived').set(archive),
    db.doc('settings/Identifiers/clients/archived').set({ clientId: 'archived' }),
    db.doc('settings/Identifiers/transactions/00002').set({ clientId: 'archived' }),
    db.doc('payments/archive-receipt').set(receipt({ clientId: 'archived', amount: 12.34 })),
  ]);
  const paths = ['clients/c', 'clientTrash/archived', 'settings/Configurations/elements/counters',
    'settings/Identifiers/clients/c', 'settings/Identifiers/clients/archived',
    'settings/Identifiers/transactions/00001', 'settings/Identifiers/transactions/00002'];
  const before = await Promise.all(paths.map(async path => (await db.doc(path).get()).data()));
  await apply();
  assert.equal((await db.doc('loanBalances/c').get()).data().paidCents, 2500);
  assert.equal((await db.doc('loanBalances/archived').get()).data().paidCents, 1234);
  assert.deepEqual(await Promise.all(paths.map(async path => (await db.doc(path).get()).data())), before);
});

for (const [name, patch, expression] of [
  ['overpaid', { amount: 100.01 }, /overpaid/],
  ['negative', { amount: -1 }, /Invalid money/],
  ['fractional cent', { amount: 0.001 }, /Invalid money/],
  ['nonfinite', { amount: Infinity }, /Invalid money/],
  ['invalid calendar date', { paymentDate: '2026-02-30' }, /Invalid or future payment date/],
  ['future payment', { paymentDate: '2999-01-01' }, /Invalid or future payment date/],
  ['nonstring cycle', { loanId: 7 }, /Invalid loan cycle/],
]) test('bootstrap refuses ' + name + ' receipts without writing any balances or counters', async () => {
  await db.doc('payments/p1').set(receipt(patch));
  const counter = (await db.doc('settings/Configurations/elements/counters').get()).data();
  await assert.rejects(apply(), expression);
  assert.equal((await db.collection('loanBalances').get()).empty, true);
  assert.deepEqual((await db.doc('settings/Configurations/elements/counters').get()).data(), counter);
});

test('a legacy partial purge cannot bootstrap a missing ledger from remaining receipts', async () => {
  await db.doc('clients/c').delete();
  await db.doc('clientTrash/c').set({ client: sourceClient, status: 'purging', trashId: 'v1', purgeOperationId: 'purge-v1' });
  await assert.rejects(apply(), /Legacy purge is incomplete/);
  assert.equal((await db.doc('loanBalances/c').get()).exists, false);
});

test('a partially purged loan preserves an existing validated ledger instead of recomputing it', async () => {
  await db.doc('clients/c').delete();
  await Promise.all([
    db.doc('clientTrash/c').set({ client: sourceClient, status: 'purging', trashId: 'v1', purgeOperationId: 'purge-v1' }),
    db.doc('loanBalances/c').set({ loanId: 'initial', paidCents: 7500, revision: 9, operation: 'create',
      receiptId: 'already-purged', updatedAt: FieldValue.serverTimestamp() }),
  ]);
  const before = (await db.doc('loanBalances/c').get()).data();
  await apply();
  assert.deepEqual((await db.doc('loanBalances/c').get()).data(), before);
});

test('an enabled gate blocks audit and apply', async () => {
  await db.doc('settings/receiptControl/current/config').update({ enabled: true });
  await assert.rejects(bootstrap(options()), /must explicitly/);
  await assert.rejects(apply(), /must explicitly/);
  assert.equal((await db.collection('loanBalances').get()).empty, true);
});

test('apply refuses missing or different project confirmation and unconfirmed legacy writers', async () => {
  await assert.rejects(bootstrap(options({ apply: true })), /confirmations/);
  await assert.rejects(apply({ 'confirm-project': 'wrong-project' }), /confirmations/);
  await assert.rejects(apply({ confirmedLegacyWritersDisabled: false }), /confirmations/);
  assert.equal((await db.collection('loanBalances').get()).empty, true);
});

test('missing reservations and a counter behind current/history IDs block migration without repair writes', async () => {
  await db.doc('settings/Identifiers/transactions/00001').delete();
  await assert.rejects(apply(), /Missing or conflicting identifier reservation/);
  assert.equal((await db.doc('settings/Identifiers/transactions/00001').get()).exists, false);
  await db.doc('settings/Identifiers/transactions/00001').set({ clientId: 'another-client' });
  await assert.rejects(apply(), /Missing or conflicting identifier reservation/);
  await db.doc('settings/Identifiers/transactions/00001').set({ clientId: 'c' });
  await db.doc('settings/Configurations/elements/counters').update({ transactionSequence: 0 });
  await assert.rejects(apply(), /counter is missing, behind/);
  assert.equal((await db.doc('settings/Configurations/elements/counters').get()).data().transactionSequence, 0);
  assert.equal((await db.collection('loanBalances').get()).empty, true);
});
