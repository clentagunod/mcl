import { createRequire } from 'node:module';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dependencyPackage = new URL('../functions/package.json', import.meta.url);
const stagedDependencyPackage = new URL('../../../../web/functions/package.json', import.meta.url);
const require = createRequire(existsSync(dependencyPackage) ? dependencyPackage : stagedDependencyPackage);
const { initializeApp, deleteApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { getSecurityRules } = require('firebase-admin/security-rules');

function argumentsOf(argv) {
  const options = { apply: false, confirmedLegacyWritersDisabled: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--confirm-legacy-writers-disabled') options.confirmedLegacyWritersDisabled = true;
    else if (['--project', '--confirm-project', '--rules'].includes(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
      options[flag.slice(2)] = value;
    } else throw new Error('Unknown option: ' + flag);
  }
  if (!options.project || !options.rules) throw new Error('Usage: node bootstrap-loan-balances.mjs --project PROJECT --rules STRICT_RULES_FILE [--apply --confirm-project PROJECT --confirm-legacy-writers-disabled]');
  if (options.apply && (options['confirm-project'] !== options.project || !options.confirmedLegacyWritersDisabled)) {
    throw new Error('Apply requires matching --confirm-project and --confirm-legacy-writers-disabled. Audit is the default.');
  }
  return options;
}

function cents(value, positive = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 999999999
    || Math.round(value * 100) / 100 !== value || (positive && value === 0)) throw new Error('Invalid money; reconcile the source document first.');
  return Math.round(value * 100);
}
function isoDate(value) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const parsed = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function cycle(data, field) {
  if (!(field in data) || data[field] === null || data[field] === '') return 'initial';
  const value = data[field];
  if (typeof value !== 'string' || !value || value.includes('/') || Buffer.byteLength(value) > 1500) {
    throw new Error('Invalid loan cycle; reconcile the source document first.');
  }
  return value;
}
function validateClient(data) {
  if (!data || ![45, 50, 58].includes(data.loanTermDays) || !isoDate(data.approvalDate)) throw new Error('Invalid current loan terms/date.');
  const total = cents(data.principal, true) + cents(data.interest);
  if ('dailyAmount' in data && data.dailyAmount !== 0) cents(data.dailyAmount, true);
  return { cycle: cycle(data, 'activeLoanId'), total, approval: data.approvalDate };
}
function validateExistingBalance(data, current) {
  if (!data || Object.keys(data).sort().join(',') !== 'loanId,operation,paidCents,receiptId,revision,updatedAt'
    || data.loanId !== current.cycle || !Number.isSafeInteger(data.paidCents) || data.paidCents < 0
    || data.paidCents > current.total || !Number.isSafeInteger(data.revision) || data.revision < 0
    || !['open', 'create', 'delete', 'adjust', 'renew'].includes(data.operation)
    || typeof data.receiptId !== 'string' || Buffer.byteLength(data.receiptId) > 1500 || data.receiptId.includes('/')
    || !(data.updatedAt instanceof Timestamp)) throw new Error('Existing protected balance is invalid; never overwrite it automatically.');
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const normalizedRules = source => source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
const digest = source => createHash('sha256').update(normalizedRules(source)).digest('hex');

async function verifyRules(app, expectedFile, emulator) {
  const expected = readFileSync(resolve(expectedFile), 'utf8');
  if (!expected.includes('loanBalances') || !expected.includes('receiptControl') || !expected.includes('ledger-v1')) {
    throw new Error('The supplied rules file does not contain the ledger-v1 protocol.');
  }
  if (emulator) {
    console.log('Demo emulator: the harness must load the supplied strict rules. Security Rules API verification is unavailable in the emulator.');
    return digest(expected);
  }
  const deployed = await getSecurityRules(app).getFirestoreRuleset();
  const files = Array.isArray(deployed.source) ? deployed.source : deployed.source?.files;
  if (!Array.isArray(files) || files.length !== 1 || digest(files[0].content) !== digest(expected)) {
    throw new Error('Deployed Firestore rules differ from the supplied strict rules. Freeze/deploy rules before bootstrapping.');
  }
  return digest(expected);
}

async function requireFrozen(transaction, db) {
  const control = await transaction.get(db.doc('settings/receiptControl/current/config'));
  if (!control.exists || control.data()?.mode !== 'ledger-v1' || control.data()?.enabled !== false) {
    throw new Error('Protected settings/receiptControl/current/config must explicitly be {enabled:false, mode:"ledger-v1"} throughout audit/apply.');
  }
}

async function verifyIdentifierReservations(transaction, db, clientRef, clientId, client) {
  const numbers = new Set();
  const remember = value => {
    if (typeof value !== 'string' || !/^[0-9]{5}$/.test(value)) throw new Error('Complete legacy transaction identifiers and reservations with a trusted migration before enabling ledger-v1.');
    numbers.add(value);
  };
  remember(client.transactionNumber);
  if (client.originalTransactionNumber != null && client.originalTransactionNumber !== '') remember(client.originalTransactionNumber);
  let cursor;
  for (;;) {
    const base = clientRef.collection('renewals').orderBy('__name__').limit(200);
    const page = await transaction.get(cursor ? base.startAfter(cursor) : base);
    for (const history of page.docs) {
      const record = history.data();
      remember(record.previousLoan?.transactionNumber);
      remember(record.newLoan?.transactionNumber);
      if (record.newLoan.transactionNumber !== history.id) throw new Error('Renewal transaction identifier does not match history document ' + history.id);
    }
    if (page.size < 200) break;
    cursor = page.docs[page.docs.length - 1];
  }
  const counter = await transaction.get(db.doc('settings/Configurations/elements/counters'));
  const sequence = counter.data()?.transactionSequence;
  let maximum = 0;
  for (const number of numbers) maximum = Math.max(maximum, Number(number));
  if (!Number.isSafeInteger(sequence) || sequence < maximum || sequence >= 99999) throw new Error('Transaction allocation counter is missing, behind existing history, invalid or exhausted. Reconcile identifiers/counters separately; this bootstrap never changes them.');
  if (typeof client.clientNumber !== 'string' || !client.clientNumber || client.clientNumber.includes('/')) throw new Error('Complete the legacy clientNumber and its reservation before enabling ledger-v1.');
  const paths = [...numbers].map(number => 'settings/Identifiers/transactions/' + number);
  paths.push('settings/Identifiers/clients/' + client.clientNumber);
  for (let offset = 0; offset < paths.length; offset += 100) {
    const reservations = await transaction.getAll(...paths.slice(offset, offset + 100).map(path => db.doc(path)));
    for (const reserved of reservations) if (!reserved.exists || reserved.data()?.clientId !== clientId) throw new Error('Missing or conflicting identifier reservation ' + reserved.ref.path + '. Seed/reconcile it with a trusted migration; no identifier documents will be overwritten.');
  }
}

async function inspectLoan(db, clientId, apply) {
  return db.runTransaction(async transaction => {
    await requireFrozen(transaction, db);
    const clientRef = db.doc('clients/' + clientId);
    const trashRef = db.doc('clientTrash/' + clientId);
    const balanceRef = db.doc('loanBalances/' + clientId);
    const [active, archived, balance] = await transaction.getAll(clientRef, trashRef, balanceRef);
    if (active.exists === archived.exists) throw new Error('Expected exactly one active client or Trash document.');
    const archive = archived.data();
    const data = active.exists ? active.data() : archive?.client;
    const current = validateClient(data);
    await verifyIdentifierReservations(transaction, db, clientRef, clientId, data);
    if (archived.exists && !['trashed', 'purging'].includes(archive?.status)) throw new Error('Invalid Trash state.');
    if (balance.exists) validateExistingBalance(balance.data(), current);
    if (archive?.status === 'purging' && !balance.exists) {
      throw new Error('Legacy purge is incomplete and may have removed receipts. Finish it before freeze or reconcile a trusted backup; do not bootstrap from partial history.');
    }
    let cursor;
    let paidCents = 0;
    let receiptCount = 0;
    const base = db.collection('payments').where('clientId', '==', clientId).orderBy('__name__').limit(200);
    for (;;) {
      const page = await transaction.get(cursor ? base.startAfter(cursor) : base);
      for (const receipt of page.docs) {
        const entry = receipt.data();
        const amount = cents(entry.amount, true);
        const receiptCycle = cycle(entry, 'loanId');
        if (!isoDate(entry.paymentDate) || entry.paymentDate > today()) throw new Error('Invalid or future payment date on receipt ' + receipt.id);
        if (receiptCycle === current.cycle) {
          if (entry.paymentDate < current.approval) throw new Error('Current-cycle receipt predates approval: ' + receipt.id);
          paidCents += amount;
          if (!Number.isSafeInteger(paidCents)) throw new Error('Payment total exceeds safe integer precision.');
        }
        receiptCount++;
      }
      if (page.size < 200) break;
      cursor = page.docs[page.docs.length - 1];
    }
    if (paidCents > current.total) throw new Error('Current cycle is overpaid. Reconcile receipts before bootstrap.');
    if (balance.exists) {
      const existingPaid = balance.data().paidCents;
      if (archive?.status === 'purging') {
        if (paidCents > existingPaid) throw new Error('Remaining purge receipts exceed retained balance.');
        return { status: 'retained-purging', receiptCount };
      }
      if (existingPaid !== paidCents) throw new Error('Existing protected balance disagrees with receipts. It will not be overwritten.');
      return { status: 'already-matching', receiptCount };
    }
    if (apply) transaction.create(balanceRef, {
      loanId: current.cycle, paidCents, revision: 0, operation: 'open', receiptId: '',
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { status: apply ? 'bootstrapped' : 'needs-bootstrap', receiptCount };
  });
}

export async function bootstrap(options) {
  if (!options?.project || !options.rules || (options.apply && (options['confirm-project'] !== options.project || !options.confirmedLegacyWritersDisabled))) {
    throw new Error('Explicit project/rules and matching apply confirmations are required.');
  }
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (emulator && !options.project.startsWith('demo-')) throw new Error('Emulator execution requires an explicitly named demo-* project.');
  const app = initializeApp(emulator ? { projectId: options.project } : {
    projectId: options.project, credential: applicationDefault(),
  }, 'loan-balance-bootstrap-' + Date.now());
  const db = getFirestore(app);
  try {
    const rulesSha256 = await verifyRules(app, options.rules, !!emulator);
    await db.runTransaction(transaction => requireFrozen(transaction, db));
    const ids = new Set();
    for (const collection of ['clients', 'clientTrash']) {
      let cursor;
      for (;;) {
        const base = db.collection(collection).orderBy('__name__').limit(200);
        const page = await (cursor ? base.startAfter(cursor) : base).get();
        page.docs.forEach(document => ids.add(document.id));
        if (page.size < 200) break;
        cursor = page.docs[page.docs.length - 1];
      }
    }
    const candidates = [...ids].sort();
    const failures = [];
    const audited = [];
    for (const id of candidates) {
      try { audited.push({ id, ...await inspectLoan(db, id, false) }); }
      catch (error) { failures.push(id + ': ' + error.message); }
    }
    if (failures.length) throw new Error('Audit failed; no balances were written.\n' + failures.join('\n'));
    console.log(JSON.stringify({ project: options.project, mode: options.apply ? 'apply' : 'audit', rulesSha256,
      loans: audited.length, needsBootstrap: audited.filter(result => result.status === 'needs-bootstrap').length,
      retainedPurging: audited.filter(result => result.status === 'retained-purging').length }));
    if (options.apply) {
      if (await verifyRules(app, options.rules, !!emulator) !== rulesSha256) throw new Error('Rules changed during audit. Keep the gate frozen and restart.');
      for (const result of audited) {
        const outcome = await inspectLoan(db, result.id, true);
        console.log(result.id + ': ' + outcome.status);
      }
      // Every row is re-audited against the still-frozen source after the resumable apply.
      for (const id of candidates) await inspectLoan(db, id, false);
      await db.runTransaction(transaction => requireFrozen(transaction, db));
      if (await verifyRules(app, options.rules, !!emulator) !== rulesSha256) throw new Error('Rules changed during apply. Keep the gate frozen and re-audit.');
      console.log('Bootstrap verified. The gate remains disabled; only an operator may enable ledger-v1 after rollout acceptance.');
    } else {
      console.log('Audit only. No documents were changed. Use --apply with explicit confirmations after reviewing the report.');
    }
  } finally {
    await db.terminate();
    await deleteApp(app);
  }
}

const canonicalPath = value => {
  const path = realpathSync(resolve(value));
  return process.platform === 'win32' ? path.toLowerCase() : path;
};
if (process.argv[1] && canonicalPath(process.argv[1]) === canonicalPath(fileURLToPath(import.meta.url))) {
  bootstrap(argumentsOf(process.argv.slice(2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
