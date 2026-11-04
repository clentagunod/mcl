import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { manageClientTrash } from '../lib/client-trash.js';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-mcl-policy');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8188');
let app, db;
const client = { firstName: 'Juan', lastName: 'Cruz', address: 'Tagum', principal: 100, interest: 0,
  loanTermDays: 45, approvalDate: '2026-11-01', clientNumber: 'mcl0001', transactionNumber: '00001',
  createdAt: Timestamp.fromMillis(1000), customImportedField: { preserved: true } };
before(() => { app = initializeApp({ projectId: 'demo-mcl-policy' }, 'trash-tests'); db = getFirestore(app); });
beforeEach(async () => {
  await fetch('http://127.0.0.1:8188/emulator/v1/projects/demo-mcl-policy/databases/(default)/documents', { method: 'DELETE' });
  await Promise.all([
    db.doc('users/admin').set({ role: 'admin', fullName: 'Administrator' }),
    db.doc('users/developer').set({ role: 'developer', fullName: 'Developer', active: true }),
    db.doc('users/inactive-developer').set({ role: 'developer', active: false }),
    db.doc('users/collector').set({ role: 'collector', active: true }),
    db.doc('users/inactive').set({ role: 'admin', active: false }),
    db.doc('clients/c').set(client),
    db.doc('payments/p').set({ clientId: 'c', amount: 20, loanId: 'initial' }),
  ]);
});
after(async () => { await db.terminate(); await deleteApp(app); });
const run = (operation, operationId, clients, uid = 'admin') => manageClientTrash(db, uid, { operation, operationId, clients });
const trash = (operationId = 'delete-c') => run('trash', operationId, [{ id: 'c' }]);
const archived = () => db.doc('clientTrash/c').get();
const entry = async () => ({ id: 'c', trashId: (await archived()).data().trashId });

test('recycling retains every source field, payment and renewal; restoring keeps the original ID and ledger', async () => {
  await db.doc('clients/c').update({ renewalCount: 1, activeLoanId: '00002' });
  await db.doc('clients/c/renewals/00002').set({ sequence: 1, previousLoan: client });
  const original = (await db.doc('clients/c').get()).data();
  await trash();
  assert.equal((await db.doc('clients/c').get()).exists, false);
  assert.deepEqual((await archived()).data().client, original);
  assert.equal((await archived()).data().deletedByName, 'Administrator');
  assert.ok((await archived()).data().deletedAt instanceof Timestamp);
  assert.equal((await db.doc('payments/p').get()).exists, true);
  assert.equal((await db.doc('clients/c/renewals/00002').get()).exists, true);
  const selected = await entry();
  await run('restore', 'restore-c', [selected]);
  const restored = (await db.doc('clients/c').get()).data();
  const { updatedAt, ...saved } = restored;
  assert.ok(updatedAt instanceof Timestamp);
  assert.deepEqual(saved, original);
  assert.equal((await archived()).exists, false);
  assert.equal((await db.doc('payments/p').get()).data().clientId, 'c');
  assert.equal((await db.doc('settings/Identifiers/clients/c').get()).data().clientId, 'c');
  assert.equal((await db.doc('settings/Identifiers/clients/mcl0001').get()).data().clientId, 'c');
  assert.equal((await db.doc('settings/Identifiers/transactions/00001').get()).data().clientId, 'c');
});

test('requires an active administrator and rejects malformed or oversized selections', async () => {
  for (const uid of ['', 'missing', 'collector', 'inactive', 'inactive-developer']) await assert.rejects(run('trash', 'denied', [{ id: 'c' }], uid));
  for (const clients of [[], [{ id: '../c' }], [{ id: 'c' }, { id: 'c' }], Array.from({ length: 76 }, (_, i) => ({ id: String(i) }))]) {
    await assert.rejects(run('trash', 'invalid', clients));
  }
  await assert.rejects(run('restore', 'invalid', [{ id: 'c' }]));
  assert.equal((await db.doc('clients/c').get()).exists, true);
  assert.equal((await archived()).exists, false);
});

test('developers can recycle, restore, and permanently delete clients', async () => {
  await run('trash', 'developer-trash', [{ id: 'c' }], 'developer');
  assert.equal((await archived()).data().deletedByName, 'Developer');
  await run('restore', 'developer-restore', [await entry()], 'developer');
  assert.equal((await db.doc('clients/c').get()).exists, true);
  await run('trash', 'developer-trash-again', [{ id: 'c' }], 'developer');
  await run('purge', 'developer-purge', [await entry()], 'developer');
  assert.equal((await archived()).exists, false);
  assert.equal((await db.doc('clients/c').get()).exists, false);
  assert.equal((await db.doc('payments/p').get()).exists, false);
});

test('the maximum bulk group reserves imported identifiers and restores each distinct client atomically', async () => {
  const selected = Array.from({ length: 75 }, (_, i) => ({ id: `legacy-${i}` }));
  const batch = db.batch();
  selected.forEach(({ id }, i) => batch.set(db.doc(`clients/${id}`), {
    ...client, clientNumber: `public-${i}`, transactionNumber: String(i + 10000), firstName: `Client ${i}`,
  }));
  await batch.commit();
  await run('trash', 'bulk-75', selected);
  const archives = await db.collection('clientTrash').get();
  assert.equal(archives.size, 75);
  assert.equal(new Set(archives.docs.map(document => document.data().trashId)).size, 75);
  assert.equal((await db.collection('clients').get()).size, 1); // Unselected client c.
  assert.equal((await db.doc('settings/Identifiers/clients/legacy-74').get()).data().clientId, 'legacy-74');
  assert.equal((await db.doc('settings/Identifiers/clients/public-74').get()).data().clientId, 'legacy-74');
  assert.equal((await db.doc('settings/Identifiers/transactions/10074').get()).data().clientId, 'legacy-74');
  await run('restore', 'restore-75', archives.docs.map(document => ({ id: document.id, trashId: document.data().trashId })));
  assert.equal((await db.collection('clientTrash').get()).size, 0);
  assert.equal((await db.collection('clients').get()).size, 76);
  assert.equal((await db.doc('clients/legacy-74').get()).data().firstName, 'Client 74');
});

test('validates the whole bulk move before writing and does not overwrite a restore collision', async () => {
  await assert.rejects(run('trash', 'bulk', [{ id: 'c' }, { id: 'missing' }]), /no longer exists/);
  assert.equal((await db.doc('clients/c').get()).exists, true);
  assert.equal((await archived()).exists, false);
  await trash(); const selected = await entry();
  await db.doc('clients/c').set({ collision: true });
  await assert.rejects(run('restore', 'collision', [selected]), /already exists/);
  assert.deepEqual((await db.doc('clients/c').get()).data(), { collision: true });
  assert.equal((await archived()).exists, true);
});

test('lost acknowledgements are idempotent even after later restore and re-delete operations', async () => {
  await Promise.all([trash(), trash()]); const first = await entry();
  await run('restore', 'restore-first', [first]);
  await trash(); // Retry the original completed delete, not a new user action.
  assert.equal((await db.doc('clients/c').get()).exists, true);
  await trash('second-delete'); const second = await entry();
  await run('restore', 'restore-first', [first]); // Old restore must not restore the new archive.
  assert.equal((await db.doc('clients/c').get()).exists, false);
  await assert.rejects(run('restore', 'stale-restore', [first]), /changed/);
  await assert.rejects(run('purge', 'stale-purge', [first]), /changed/);
  await run('restore', 'restore-second', [second]);
});

test('permanent deletion handles more than 500 records and retains other clients, audit events and reservations', async () => {
  for (let start = 0; start < 520; start += 200) {
    const batch = db.batch();
    for (let i = start; i < Math.min(start + 200, 520); i++) batch.set(db.doc(`payments/p${i}`), { clientId: 'c', amount: 1, loanId: i % 2 ? 'initial' : '00002' });
    await batch.commit();
  }
  await Promise.all([
    db.doc('clients/c/renewals/00002').set({ sequence: 1 }),
    db.doc('payments/other').set({ clientId: 'other', amount: 50 }),
    db.doc('receiptAudit/p').set({ clientId: 'c', operation: 'create' }),
  ]);
  await trash(); const selected = await entry();
  await run('purge', 'purge-c', [selected]);
  await run('purge', 'purge-c', [selected]);
  assert.equal((await archived()).exists, false);
  assert.equal((await db.collection('payments').where('clientId', '==', 'c').get()).size, 0);
  assert.equal((await db.collection('clients/c/renewals').get()).size, 0);
  assert.equal((await db.doc('payments/other').get()).exists, true);
  assert.equal((await db.doc('receiptAudit/p').get()).exists, true);
  assert.equal((await db.doc('settings/Identifiers/transactions/00001').get()).exists, true);
});

test('an interrupted purge prevents restore and resumes safely on retry', async () => {
  await trash(); const selected = await entry();
  await db.doc('clientTrash/c').update({ status: 'purging', purgeOperationId: 'resume-c' });
  await db.doc('clientTrashOperations/resume-c').set({ operation: 'purge', actorId: 'admin', status: 'pending',
    requestKey: JSON.stringify({ operation: 'purge', entries: [selected] }) });
  await assert.rejects(run('restore', 'cannot-restore', [selected]), /no longer be restored/);
  await run('purge', 'resume-c', [selected]);
  assert.equal((await archived()).exists, false);
  assert.equal((await db.doc('payments/p').get()).exists, false);
});

test('a restore racing with purge either restores the full ledger or deletes everything', async () => {
  await trash(); const selected = await entry();
  const results = await Promise.allSettled([run('restore', 'racing-restore', [selected]), run('purge', 'racing-purge', [selected])]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const active = (await db.doc('clients/c').get()).exists;
  assert.equal((await db.doc('payments/p').get()).exists, active);
  assert.equal((await archived()).exists, false);
});
