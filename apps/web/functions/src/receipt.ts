import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { isMoney } from '../../src/lib/money';
import { isISODate } from '../../src/lib/dates';
import { dailyPayable } from '../../src/lib/printables';

const fail = (message: string): never => { throw new HttpsError('failed-precondition', message); };
function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1500 && !value.includes('/') && value !== '.' && value !== '..';
}
function details(value: Record<string, unknown>) {
  return { clientId: value.clientId, loanId: value.loanId || 'initial', amount: value.amount,
    paymentDate: value.paymentDate, notes: value.notes ?? value.note ?? '' };
}

/** Reads the existing ledger inside a server transaction; no aggregate migration is required.
 * Updating the shared client document serializes different receipt IDs and renewal calls.
 * The deployment gate must disable legacy direct writes before claiming global enforcement.
 */
export async function mutateReceipt(db: Firestore, uid: string, request: unknown, today: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in before recording a payment.');
  if (!request || typeof request !== 'object') throw new HttpsError('invalid-argument', 'Missing receipt request.');
  const command = request as Record<string, unknown>;
  const operation = command.operation;
  if (!['create', 'correct', 'delete'].includes(operation as string) || !identifier(command.id)
    || !identifier(command.operationId)) throw new HttpsError('invalid-argument', 'Invalid receipt operation.');
  if ((operation === 'create') !== (command.operationId === command.id)) {
    throw new HttpsError('invalid-argument', 'Creates must reuse the receipt ID; corrections require a separate operation ID.');
  }
  const input = command.input && typeof command.input === 'object' ? details(command.input as Record<string, unknown>) : null;
  const expected = command.expected && typeof command.expected === 'object' ? details(command.expected as Record<string, unknown>) : null;
  if (operation !== 'delete' && (!input || !identifier(input.clientId) || !identifier(input.loanId)
    || !isMoney(input.amount) || input.amount <= 0 || !isISODate(input.paymentDate)
    || typeof input.notes !== 'string' || input.notes.length > 1500)) {
    throw new HttpsError('invalid-argument', 'Check the payment amount, date, loan and notes.');
  }
  if (operation !== 'create' && !expected) throw new HttpsError('invalid-argument', 'Reopen the receipt before correcting it.');
  const requestKey = JSON.stringify({ operation, id: command.id, input, expected });
  const receiptRef = db.doc(`payments/${command.id}`);
  const auditRef = db.doc(`receiptAudit/${command.operationId}`);
  return db.runTransaction(async tx => {
    const actorDoc = await tx.get(db.doc(`users/${uid}`));
    const actor = actorDoc.data();
    if (!actor || actor.active === false || !['admin', 'collector'].includes(actor.role)
      || (operation !== 'create' && actor.role !== 'admin')) {
      throw new HttpsError('permission-denied', 'Your account cannot perform this receipt operation.');
    }
    const audit = await tx.get(auditRef);
    if (audit.exists) {
      if (audit.data()?.actorId !== uid || audit.data()?.requestKey !== requestKey) fail('This operation identifier has already been used for different details.');
      return { confirmed: true };
    }
    const receipt = await tx.get(receiptRef);
    const old = receipt.data();
    if (operation === 'create' && old) {
      // Recognize previously committed legacy attempts during the staged rollout.
      if (old.collectorId === uid && JSON.stringify(details(old)) === JSON.stringify(input)) {
        tx.create(auditRef, { operation: 'legacy-create', receiptId: command.id, clientId: old.clientId,
          requestKey, actorId: uid, actorName: old.collectorName || '', before: null, after: old,
          createdAt: FieldValue.serverTimestamp() });
        return { confirmed: true };
      }
      fail('This receipt identifier already exists with different details.');
    }
    if (operation !== 'create' && !old) fail('This receipt no longer exists. Reopen the history.');
    if (operation !== 'create' && JSON.stringify(details(old!)) !== JSON.stringify(expected)) fail('This receipt changed elsewhere. Close and reopen it.');
    const originalAuditRef = db.doc(`receiptAudit/${command.id}`);
    const originalAudit = operation === 'create' ? audit : await tx.get(originalAuditRef);
    const clientId = old?.clientId ?? input?.clientId;
    if (!identifier(clientId)) fail('The receipt has an invalid client reference.');
    const clientRef = db.doc(`clients/${clientId}`);
    // Every financial mutation locks this document, including the first receipt.
    const clientDoc = await tx.get(clientRef);
    const client = clientDoc.data();
    if (!client) fail('This client no longer exists.');
    const cycle = client!.activeLoanId || 'initial';
    if ((old && (old.loanId || 'initial') !== cycle) || (input && (input.clientId !== clientId || input.loanId !== cycle))) {
      fail('This loan was renewed. Closed loan receipts cannot be changed.');
    }
    if (operation !== 'delete') {
      if (!isMoney(client!.principal) || client!.principal <= 0 || !isMoney(client!.interest)
        || !isISODate(client!.approvalDate) || ![45, 50, 58].includes(client!.loanTermDays)) fail('Correct the client loan details first.');
      if ((input!.paymentDate as string) < client!.approvalDate || (input!.paymentDate as string) > today) fail('Choose a collection date from approval through today.');
      const [receipts, policy] = await Promise.all([
        tx.get(db.collection('payments').where('clientId', '==', clientId)),
        tx.get(db.doc('settings/Configurations/elements/paymentPolicy')),
      ]);
      let paid = 0;
      for (const entry of receipts.docs) {
        const data = entry.data();
        if (entry.id === command.id || (data.loanId || 'initial') !== cycle) continue;
        if (!isMoney(data.amount) || data.amount <= 0) fail('Correct invalid existing payment amounts before recording another receipt.');
        paid += Math.round(data.amount * 100);
      }
      const outstanding = Math.round((client!.principal + client!.interest) * 100) - paid;
      if (Math.round((input!.amount as number) * 100) > outstanding) fail('Amount exceeds the latest outstanding balance.');
      if (actor.role === 'collector' && policy.data()?.enforceDailyMinimum === true) {
        const minimum = dailyPayable({ principal: client!.principal, interest: client!.interest, loanTermDays: client!.loanTermDays, dailyAmount: client!.dailyAmount });
        if ((input!.amount as number) < minimum || outstanding < Math.round(minimum * 100)) fail('Payment is below the daily minimum. Ask an administrator for settlement.');
      }
    }
    const next = operation === 'delete' ? null : operation === 'create'
      ? { ...input!, collectorId: uid, collectorName: typeof actor.fullName === 'string' ? actor.fullName : '', createdAt: FieldValue.serverTimestamp() }
      : { ...old!, amount: input!.amount, paymentDate: input!.paymentDate, notes: input!.notes,
        updatedAt: FieldValue.serverTimestamp(), updatedBy: uid };
    // Reserve legacy IDs before their first correction/deletion too. An old queued
    // create must not resurrect a receipt after it has been removed by an admin.
    if (operation !== 'create' && !originalAudit.exists) tx.create(originalAuditRef, {
      operation: 'legacy-create', receiptId: command.id, clientId,
      requestKey: JSON.stringify({ operation: 'create', id: command.id, input: details(old!), expected: null }),
      actorId: old!.collectorId || 'unknown', actorName: old!.collectorName || '',
      before: null, after: old, createdAt: FieldValue.serverTimestamp(),
    });
    // An immutable event survives deletion and makes a repeated delete idempotent.
    tx.create(auditRef, { operation, receiptId: command.id, clientId, requestKey, actorId: uid,
      actorName: typeof actor.fullName === 'string' ? actor.fullName : '', before: old ?? null,
      after: next, createdAt: FieldValue.serverTimestamp() });
    if (next) tx.set(receiptRef, next); else tx.delete(receiptRef);
    tx.update(clientRef, { receiptRevision: FieldValue.increment(1) });
    return { confirmed: true };
  });
}
