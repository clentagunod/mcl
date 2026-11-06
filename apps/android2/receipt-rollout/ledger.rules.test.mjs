import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
const { initializeTestEnvironment, assertFails, assertSucceeds } = requireWeb('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, runTransaction, writeBatch, serverTimestamp } = requireWeb('firebase/firestore');
const projectId = 'demo-mcl-receipts-v1';
let environment;
const clientId = 'c';
const client = {
  firstName: 'Juan', middleName: '', lastName: 'Borrower', address: 'Tagum',
  cellphone: '09171234567', clientNumber: 'c', transactionNumber: '00001',
  principal: 100, interest: 0, dailyAmount: 1, loanTermDays: 45,
  approvalDate: '2026-01-01', createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const initialLedger = {
  loanId: 'initial', paidCents: 0, revision: 0, operation: 'open',
  receiptId: '', updatedAt: new Date('2026-01-01T00:00:00Z'),
};
const as = uid => environment.authenticatedContext(uid).firestore();
const receipt = (amount, uid = 'collector', loanId = 'initial') => ({
  clientId, loanId, amount, paymentDate: '2026-01-02', notes: 'cash',
  collectorId: uid, collectorName: uid === 'admin' ? 'Admin' : 'Collector',
  createdAt: serverTimestamp(),
});
const nextLedger = (before, operation, receiptId, paidCents, loanId = before.loanId) => ({
  loanId, paidCents, revision: before.revision + 1, operation, receiptId,
  updatedAt: serverTimestamp(),
});

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run only through the Firestore emulator.');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment = await initializeTestEnvironment({
    projectId, firestore: { host, port: Number(port),
      rules: await readFile(new URL('./firestore.rules', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/admin'), { role: 'admin', fullName: 'Admin', active: true }),
      setDoc(doc(db, 'users/collector'), { role: 'collector', fullName: 'Collector', active: true }),
      setDoc(doc(db, 'users/other'), { role: 'collector', fullName: 'Other', active: true }),
      setDoc(doc(db, 'settings/receiptControl/current/config'), { enabled: true, mode: 'ledger-v1' }),
      setDoc(doc(db, 'settings/Configurations/elements/paymentPolicy'), { enforceDailyMinimum: false }),
      setDoc(doc(db, 'clients/c'), client),
      setDoc(doc(db, 'loanBalances/c'), initialLedger),
    ]);
  });
});
after(async () => { await environment?.cleanup(); });

async function trustedSet(path, data) {
  await environment.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), path), data));
}
async function createReceipt(db, id, amount, uid = 'collector', cycle = 'initial', extra = {}) {
  return runTransaction(db, async tx => {
    const paymentRef = doc(db, 'payments', id);
    const deletionRef = doc(db, 'receiptDeletions', id);
    const existing = await tx.get(paymentRef);
    const deletion = await tx.get(deletionRef);
    if (existing.exists() || deletion.exists()) {
      const old = existing.exists() ? existing.data() : deletion.data().payment;
      assert.equal(old.clientId, clientId);
      assert.equal(old.loanId || 'initial', cycle);
      assert.equal(old.amount, amount);
      assert.equal(old.collectorId, uid);
      return; // Exact same-ID retry is read-only, including a deleted receipt.
    }
    const balanceRef = doc(db, 'loanBalances/c');
    const balance = (await tx.get(balanceRef)).data();
    await tx.get(doc(db, 'clients/c'));
    tx.set(paymentRef, { ...receipt(amount, uid, cycle), ...extra });
    tx.update(balanceRef, nextLedger(balance, 'create', id, balance.paidCents + Math.round(amount * 100)));
  });
}
async function removeReceipt(db, id) {
  return runTransaction(db, async tx => {
    const paymentRef = doc(db, 'payments', id);
    const deletionRef = doc(db, 'receiptDeletions', id);
    const current = await tx.get(paymentRef);
    const deleted = await tx.get(deletionRef);
    if (!current.exists()) {
      assert.ok(deleted.exists());
      return;
    }
    const balanceRef = doc(db, 'loanBalances/c');
    const balance = (await tx.get(balanceRef)).data();
    await tx.get(doc(db, 'clients/c'));
    tx.set(deletionRef, { clientId, payment: current.data(), deletedBy: 'admin', deletedAt: serverTimestamp() });
    tx.delete(paymentRef);
    tx.update(balanceRef, nextLedger(balance, 'delete', id, balance.paidCents - Math.round(current.data().amount * 100)));
  });
}
async function adjust(db, principal) {
  return runTransaction(db, async tx => {
    const current = await tx.get(doc(db, 'clients/c'));
    const balance = await tx.get(doc(db, 'loanBalances/c'));
    tx.update(current.ref, { principal, updatedAt: serverTimestamp() });
    tx.update(balance.ref, nextLedger(balance.data(), 'adjust', '', balance.data().paidCents));
  });
}
function loanSnapshot(data, next = false) {
  return {
    id: clientId, clientNumber: 'c', transactionNumber: next ? '00002' : data.transactionNumber,
    activeLoanId: next ? '00002' : (data.activeLoanId || 'initial'),
    renewalCount: next ? 1 : (data.renewalCount || 0),
    originalTransactionNumber: data.originalTransactionNumber || data.transactionNumber,
    firstName: data.firstName, middleName: data.middleName, lastName: data.lastName,
    address: data.address, cellphone: data.cellphone, principal: data.principal,
    interest: data.interest, dailyAmount: data.dailyAmount, loanTermDays: data.loanTermDays,
    approvalDate: next ? '2026-02-21' : data.approvalDate,
  };
}
async function renew(db) {
  return runTransaction(db, async tx => {
    const currentRef = doc(db, 'clients/c');
    const balanceRef = doc(db, 'loanBalances/c');
    const current = (await tx.get(currentRef)).data();
    const balance = (await tx.get(balanceRef)).data();
    const before = loanSnapshot(current);
    const after = loanSnapshot(current, true);
    tx.set(doc(db, 'clients/c/renewals/00002'), {
      sequence: 1, previousLoan: before, newLoan: after,
      totalPaid: 100, paidOn: '2026-01-02', dueDate: '2026-02-23', newDueDate: '2026-04-15',
      approvedBy: 'admin', approvedByName: 'Admin', notes: '', createdAt: serverTimestamp(),
    });
    tx.update(currentRef, {
      principal: after.principal, interest: after.interest, dailyAmount: after.dailyAmount,
      loanTermDays: after.loanTermDays, approvalDate: after.approvalDate,
      transactionNumber: after.transactionNumber, activeLoanId: after.activeLoanId,
      renewalCount: after.renewalCount, originalTransactionNumber: after.originalTransactionNumber,
      updatedAt: serverTimestamp(),
    });
    tx.update(balanceRef, nextLedger(balance, 'renew', '', 0, '00002'));
  });
}
async function trash(db, id = 'trash-1') {
  const current = await getDoc(doc(db, 'clients/c'));
  const batch = writeBatch(db);
  batch.set(doc(db, 'clientTrash/c'), { client: current.data(), trashId: id,
    deletedBy: 'admin', deletedByName: 'Admin', deletedAt: serverTimestamp(), status: 'trashed' });
  batch.delete(current.ref);
  return batch.commit();
}

// Mirrors paymentClient's read-only transaction before Android reserves an ID.
async function nativePreflight(db, uid = 'collector') {
  return runTransaction(db, async tx => {
    const actor = (await tx.get(doc(db, 'users', uid))).data();
    assert.equal(actor.active, true);
    const control = (await tx.get(doc(db, 'settings/receiptControl/current/config'))).data();
    assert.ok(control && control.mode === 'ledger-v1' && control.enabled === true, 'payment setup');
    const current = (await tx.get(doc(db, 'clients/c'))).data();
    const balance = (await tx.get(doc(db, 'loanBalances/c'))).data();
    assert.ok(balance, 'missing balance');
    assert.equal(balance.loanId, current.activeLoanId || 'initial');
    assert.ok(Number.isInteger(balance.paidCents) && balance.paidCents >= 0);
    return Math.round(current.principal * 100) + Math.round(current.interest * 100) - balance.paidCents;
  });
}

test('native reservation preflight reads the shared protected balance for each business role', async () => {
  await createReceipt(as('collector'), 'before-preflight', 25);
  for (const uid of ['admin', 'collector']) {
    assert.equal(await nativePreflight(as(uid), uid), 7500);
  }
});

test('native reservation preflight fails before creating a receipt when setup is incomplete', async () => {
  await environment.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'loanBalances/c')));
  await assert.rejects(nativePreflight(as('collector')), /missing balance/);
  assert.equal((await getDocs(collection(as('admin'), 'payments'))).size, 0);
  await trustedSet('loanBalances/c', initialLedger);
  for (const control of [
    {enabled: false, mode: 'ledger-v1'},
    {enabled: 'true', mode: 'ledger-v1'},
    {enabled: true, mode: 'other'},
  ]) {
    await trustedSet('settings/receiptControl/current/config', control);
    await assert.rejects(nativePreflight(as('collector')), /payment setup/);
    await assertFails(createReceipt(as('collector'), 'not-enabled', 1));
  }
  await environment.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'settings/receiptControl/current/config')));
  await assert.rejects(nativePreflight(as('collector')), /payment setup/);
});

test('different receipt IDs cannot both spend the same remaining balance', async () => {
  const results = await Promise.allSettled([
    createReceipt(as('collector'), 'first', 75),
    createReceipt(as('collector'), 'second', 75),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const balance = (await getDoc(doc(as('admin'), 'loanBalances/c'))).data();
  assert.equal(balance.paidCents, 7500);
  assert.equal(balance.revision, 1);
});
test('same-ID concurrent retry commits one receipt and one delta', async () => {
  const outcomes = await Promise.allSettled([
    createReceipt(as('collector'), 'same', 75),
    createReceipt(as('collector'), 'same', 75),
  ]);
  // A conflicting commit can be denied before the SDK retries it. Preserve the
  // reserved ID and reconcile after both requests finish, as the recovery UI does.
  assert.ok(outcomes.some(result => result.status === 'fulfilled'));
  await assertSucceeds(createReceipt(as('collector'), 'same', 75));
  assert.equal((await getDoc(doc(as('admin'), 'loanBalances/c'))).data().paidCents, 7500);
  assert.equal((await getDoc(doc(as('admin'), 'loanBalances/c'))).data().revision, 1);
});
test('exact settlement succeeds and any extra cent is denied', async () => {
  await assertSucceeds(createReceipt(as('collector'), 'settled', 100));
  await assertFails(createReceipt(as('collector'), 'extra', 0.01));
  assert.equal((await getDoc(doc(as('admin'), 'loanBalances/c'))).data().paidCents, 10000);
});
test('raw payment writes cannot bypass the balance ledger', async () => {
  await assertFails(setDoc(doc(as('collector'), 'payments/direct'), receipt(75)));
  await assertFails(setDoc(doc(as('admin'), 'payments/direct-admin'), receipt(75, 'admin')));
});
test('two receipts cannot share one ledger delta in a batch', async () => {
  const db = as('collector');
  const batch = writeBatch(db);
  batch.set(doc(db, 'payments/one'), receipt(75));
  batch.set(doc(db, 'payments/two'), receipt(75));
  batch.update(doc(db, 'loanBalances/c'), nextLedger(initialLedger, 'create', 'two', 7500));
  await assertFails(batch.commit());
});
test('forged ledger-only updates and invalid shapes are denied', async () => {
  const db = as('admin');
  for (const change of [
    nextLedger(initialLedger, 'create', 'missing', 5000),
    nextLedger(initialLedger, 'delete', 'missing', 0),
    nextLedger(initialLedger, 'adjust', '', 0),
    { ...nextLedger(initialLedger, 'create', 'missing', 5000), extra: true },
    { ...nextLedger(initialLedger, 'create', 'missing', 5000), paidCents: 0.5 },
  ]) await assertFails(updateDoc(doc(db, 'loanBalances/c'), change));
});
test('deletion updates balance atomically, retries once, and prevents resurrection', async () => {
  await createReceipt(as('collector'), 'remove-me', 75);
  const outcomes = await Promise.allSettled([removeReceipt(as('admin'), 'remove-me'), removeReceipt(as('admin'), 'remove-me')]);
  assert.ok(outcomes.some(result => result.status === 'fulfilled'));
  await assertSucceeds(removeReceipt(as('admin'), 'remove-me'));
  await createReceipt(as('collector'), 'remove-me', 75);
  const balance = (await getDoc(doc(as('admin'), 'loanBalances/c'))).data();
  assert.equal(balance.paidCents, 0);
  assert.equal(balance.revision, 2);
  assert.equal((await getDoc(doc(as('admin'), 'payments/remove-me'))).exists(), false);
  await assertFails(setDoc(doc(as('collector'), 'payments/remove-me'), receipt(75)));
  await assertFails(updateDoc(doc(as('admin'), 'receiptDeletions/remove-me'), { deletedBy: 'other' }));
  await assertFails(deleteDoc(doc(as('admin'), 'receiptDeletions/remove-me')));
});
test('collectors can reconcile their own deletion markers but cannot list or read another actor', async () => {
  await assertSucceeds(getDoc(doc(as('collector'), 'receiptDeletions/not-created')));
  await createReceipt(as('collector'), 'mine', 25);
  await removeReceipt(as('admin'), 'mine');
  await assertSucceeds(getDoc(doc(as('collector'), 'receiptDeletions/mine')));
  await assertFails(getDoc(doc(as('other'), 'receiptDeletions/mine')));
  await assertFails(getDocs(collection(as('collector'), 'receiptDeletions')));
  await assertSucceeds(getDocs(collection(as('admin'), 'receiptDeletions')));
});
test('receipt deletion cannot omit its matching ledger decrement', async () => {
  await createReceipt(as('collector'), 'original', 50);
  const db = as('admin');
  const payment = (await getDoc(doc(db, 'payments/original'))).data();
  const batch = writeBatch(db);
  batch.set(doc(db, 'receiptDeletions/original'), { clientId, payment, deletedBy: 'admin', deletedAt: serverTimestamp() });
  batch.delete(doc(db, 'payments/original'));
  await assertFails(batch.commit());
});
test('receipts cannot be modified in place even with a matching forged delta', async () => {
  await createReceipt(as('collector'), 'immutable', 50);
  await assertFails(updateDoc(doc(as('admin'), 'payments/immutable'), { amount: 25 }));
});
test('inactive profiles and guests cannot record or forge balances', async () => {
  await trustedSet('users/collector', { role: 'collector', fullName: 'Collector', active: false });
  await assertFails(createReceipt(as('collector'), 'revoked', 1));
  const db = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, 'loanBalances/c')));
  await assertFails(setDoc(doc(db, 'payments/guest'), receipt(1)));
});

test('shared reads allow active business roles and deny missing, unsupported or inactive profiles', async () => {
  await trustedSet('users/developer', { role: 'developer', fullName: 'Developer', active: true });
  await trustedSet('users/inactive-admin', { role: 'admin', active: false });
  await trustedSet('users/inactive-developer', { role: 'developer', active: false });
  await trustedSet('users/unsupported', { role: 'owner', active: true });
  const paths = ['clients/c', 'loanBalances/c', 'settings/receiptControl/current/config', 'settings/Configurations/elements/paymentPolicy'];
  for (const uid of ['admin', 'collector', 'developer']) {
    for (const path of paths) await assertSucceeds(getDoc(doc(as(uid), path)));
  }
  for (const uid of ['missing', 'unsupported', 'inactive-admin', 'inactive-developer']) {
    for (const path of paths) await assertFails(getDoc(doc(as(uid), path)));
    await assertFails(createReceipt(as(uid), 'denied-' + uid, 1, uid));
  }
  await assertSucceeds(createReceipt(as('developer'), 'developer-receipt', 1, 'developer', 'initial', { collectorName: 'Developer' }));
});

test('shared receipts retain amount, date, attribution and note validation', async () => {
  let id = 0;
  for (const amount of [0, -1, 0.001, NaN, Infinity, 1000000000]) {
    await assertFails(createReceipt(as('collector'), 'amount-' + (++id), amount));
  }
  for (const extra of [
    { paymentDate: '2025-12-31' }, { paymentDate: '2026-02-30' },
    { paymentDate: '2099-01-01' }, { paymentDate: 'abcdefghij' },
    { collectorId: 'other' }, { collectorName: 'Other' },
    { createdAt: new Date(0) }, { notes: 'x'.repeat(1501) }, { extra: true },
  ]) await assertFails(createReceipt(as('collector'), 'fields-' + (++id), 1, 'collector', 'initial', extra));
  await assertSucceeds(createReceipt(as('collector'), 'centavo', 0.29));
});

test('daily minimum applies to collectors while admins can record smaller settlements', async () => {
  await trustedSet('settings/Configurations/elements/paymentPolicy', { enforceDailyMinimum: true });
  await assertFails(createReceipt(as('collector'), 'too-small', 0.5));
  await assertSucceeds(createReceipt(as('collector'), 'minimum', 1));
  await assertSucceeds(createReceipt(as('admin'), 'admin-partial', 0.5, 'admin'));
  await assertFails(updateDoc(doc(as('collector'), 'settings/Configurations/elements/paymentPolicy'), { enforceDailyMinimum: false }));
});
test('current cycle is enforced while acknowledged old-cycle retries remain read-only', async () => {
  await createReceipt(as('collector'), 'old', 100);
  await renew(as('admin'));
  await assertSucceeds(createReceipt(as('collector'), 'old', 100));
  await assertFails(createReceipt(as('collector'), 'stale-cycle', 1));
  assert.equal((await getDoc(doc(as('admin'), 'loanBalances/c'))).data().paidCents, 0);
});
for (const legacyCycle of ['', null]) {
  test('legacy ' + (legacyCycle === '' ? 'blank' : 'null') + ' cycles support delete-and-create correction', async () => {
    await trustedSet('clients/c', { ...client, activeLoanId: legacyCycle });
    await trustedSet('loanBalances/c', { ...initialLedger, paidCents: 5000 });
    await trustedSet('payments/legacy', {
      ...receipt(50), loanId: legacyCycle, createdAt: new Date('2026-01-02T00:00:00Z'),
    });
    await assertSucceeds(removeReceipt(as('admin'), 'legacy'));
    await assertSucceeds(createReceipt(as('collector'), 'replacement', 50));
    assert.equal((await getDoc(doc(as('admin'), 'loanBalances/c'))).data().paidCents, 5000);
    assert.equal((await getDoc(doc(as('admin'), 'payments/legacy'))).exists(), false);
  });
}
test('invalid cycle types are not silently converted to initial', async () => {
  await trustedSet('clients/c', { ...client, activeLoanId: 123 });
  await assertFails(createReceipt(as('collector'), 'bad-cycle', 1));
});
test('financial edits require a coupled revision and cannot reduce total below paid', async () => {
  await createReceipt(as('collector'), 'paid', 75);
  await assertFails(updateDoc(doc(as('admin'), 'clients/c'), { principal: 200 }));
  await assertFails(adjust(as('admin'), 70));
  await assertSucceeds(adjust(as('admin'), 200));
  await assertSucceeds(updateDoc(doc(as('admin'), 'clients/c'), { address: 'New address' }));
  for (const change of [{ dailyAmount: 2 }, { approvalDate: '2026-01-02' }, { transactionNumber: '00003' }]) {
    await assertFails(updateDoc(doc(as('admin'), 'clients/c'), change));
  }
});
test('adjustment and receipt races preserve the authoritative bound', async () => {
  const results = await Promise.allSettled([adjust(as('admin'), 70), createReceipt(as('collector'), 'racing', 75)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const db = as('admin');
  const current = (await getDoc(doc(db, 'clients/c'))).data();
  const balance = (await getDoc(doc(db, 'loanBalances/c'))).data();
  assert.ok(balance.paidCents <= Math.round(current.principal * 100));
});
test('renewal cannot skip settlement or omit the ledger reset', async () => {
  await assertFails(renew(as('admin')));
  await createReceipt(as('collector'), 'full', 100);
  await assertSucceeds(renew(as('admin')));
  const db = as('admin');
  const balance = (await getDoc(doc(db, 'loanBalances/c'))).data();
  assert.equal(balance.loanId, '00002');
  assert.equal(balance.paidCents, 0);
});
test('receipt and renewal races cannot place an old receipt in the new balance', async () => {
  await createReceipt(as('collector'), 'almost', 99);
  const results = await Promise.allSettled([renew(as('admin')), createReceipt(as('collector'), 'last', 1)]);
  assert.equal(results[1].status, 'fulfilled');
  const db = as('admin');
  const balance = (await getDoc(doc(db, 'loanBalances/c'))).data();
  const current = (await getDoc(doc(db, 'clients/c'))).data();
  assert.equal(balance.loanId, current.activeLoanId || 'initial');
  assert.equal(balance.paidCents, balance.loanId === 'initial' ? 10000 : 0);
  assert.equal((await getDoc(doc(db, 'payments/last'))).data().loanId, 'initial');
});
test('new clients open zero balances atomically; existing clients cannot self-bootstrap', async () => {
  const db = as('admin');
  await assertFails(setDoc(doc(db, 'clients/new'), { ...client, clientNumber: 'new' }));
  const batch = writeBatch(db);
  batch.set(doc(db, 'clients/new'), { ...client, clientNumber: 'new' });
  batch.set(doc(db, 'loanBalances/new'), { ...initialLedger, updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  await trustedSet('clients/legacy', { ...client, clientNumber: 'legacy' });
  await assertFails(setDoc(doc(db, 'loanBalances/legacy'), { ...initialLedger, updatedAt: serverTimestamp() }));
});
test('native explicit initial-cycle defaults can open a new ledger but renewed defaults cannot', async () => {
  const db = as('admin');
  const batch = writeBatch(db);
  batch.set(doc(db, 'clients/native'), { ...client, clientNumber: 'native', activeLoanId: 'initial', renewalCount: 0 });
  batch.set(doc(db, 'loanBalances/native'), { ...initialLedger, updatedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  for (const change of [{ activeLoanId: '00002' }, { renewalCount: 1 }, { originalTransactionNumber: '00001' }]) {
    const invalid = writeBatch(db);
    invalid.set(doc(db, 'clients/invalid'), { ...client, clientNumber: 'invalid', activeLoanId: 'initial', renewalCount: 0, ...change });
    invalid.set(doc(db, 'loanBalances/invalid'), { ...initialLedger, updatedAt: serverTimestamp() });
    await assertFails(invalid.commit());
  }
});
test('settings wildcard cannot grant application writes to the relocated control', async () => {
  const db = as('admin');
  const control = doc(db, 'settings/receiptControl/current/config');
  await assertSucceeds(getDoc(control));
  await assertFails(updateDoc(control, { enabled: false }));
  await assertFails(deleteDoc(control));
  await assertFails(setDoc(doc(db, 'settings/receiptControl'), { enabled: true }));
  await assertFails(setDoc(doc(db, 'settings/receiptControl/current/other'), { enabled: true }));
  await assertSucceeds(setDoc(doc(db, 'settings/Configurations/elements/general'), { companyName: 'MCL' }));
  // The previous location no longer enables the protocol.
  await environment.withSecurityRulesDisabled(async context => {
    const trusted = context.firestore();
    await deleteDoc(doc(trusted, 'settings/receiptControl/current/config'));
    await setDoc(doc(trusted, 'receiptControl/current'), { enabled: true, mode: 'ledger-v1' });
  });
  await assertFails(createReceipt(as('collector'), 'old-control-only', 1));
});

test('freeze is trusted, fail closed, and leaves contact edits available', async () => {
  await assertFails(setDoc(doc(as('admin'), 'settings/receiptControl/current/config'), { enabled: true, mode: 'ledger-v1' }));
  await trustedSet('settings/receiptControl/current/config', { enabled: false, mode: 'ledger-v1' });
  await assertFails(createReceipt(as('collector'), 'frozen', 1));
  await assertFails(adjust(as('admin'), 200));
  await assertFails(trash(as('admin')));
  await assertSucceeds(updateDoc(doc(as('admin'), 'clients/c'), { address: 'Contact correction' }));
  await environment.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), 'settings/receiptControl/current/config')));
  await assertFails(createReceipt(as('collector'), 'missing-control', 1));
});
test('trash, restore and purge retain the ledger and prohibit public-ID reuse', async () => {
  await createReceipt(as('collector'), 'keep-balance', 50);
  const db = as('admin');
  const before = (await getDoc(doc(db, 'loanBalances/c'))).data();
  await trash(db);
  assert.deepEqual((await getDoc(doc(db, 'loanBalances/c'))).data(), before);
  await assertFails(createReceipt(as('collector'), 'while-archived', 1));
  const archived = (await getDoc(doc(db, 'clientTrash/c'))).data();
  const restore = writeBatch(db);
  restore.set(doc(db, 'clients/c'), { ...archived.client, updatedAt: serverTimestamp() });
  restore.delete(doc(db, 'clientTrash/c'));
  await assertSucceeds(restore.commit());
  assert.deepEqual((await getDoc(doc(db, 'loanBalances/c'))).data(), before);
  await trash(db, 'trash-2');
  await updateDoc(doc(db, 'clientTrash/c'), { status: 'purging', purgeOperationId: 'purge-2' });
  await assertSucceeds(deleteDoc(doc(db, 'payments/keep-balance')));
  await assertSucceeds(deleteDoc(doc(db, 'clientTrash/c')));
  assert.deepEqual((await getDoc(doc(db, 'loanBalances/c'))).data(), before);
  await assertFails(deleteDoc(doc(db, 'loanBalances/c')));
  const reuse = writeBatch(db);
  reuse.set(doc(db, 'clients/c'), client);
  reuse.set(doc(db, 'loanBalances/c'), { ...initialLedger, updatedAt: serverTimestamp() });
  await assertFails(reuse.commit());
});
