import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { renewalEligibility, hasGoodRenewalHistory, validateRenewalTerms } from '../../src/lib/renewal';
import { loanId } from '../../src/lib/loan-cycle';
import { formatSequence } from '../../src/lib/identifiers';
import { isISODate } from '../../src/lib/dates';
import type { Client, Payment, RenewalRecord } from '../../src/types';
import { computeSchedule } from '../../src/lib/loan';
import { isAdminRole } from '../../src/lib/roles';

/** No browser-supplied roles, balances, eligibility flags or audit names are trusted. */
export async function renewClientLoan(db: Firestore, uid: string, request: unknown, today: string) {
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in as an administrator.');
  if (!request || typeof request !== 'object') throw new HttpsError('invalid-argument', 'Missing renewal request.');
  const data = request as Record<string, unknown>;
  if (typeof data.clientId !== 'string' || !data.clientId || data.clientId.includes('/') || typeof data.expectedLoanId !== 'string' || typeof data.expectedTransactionNumber !== 'string') throw new HttpsError('invalid-argument', 'Invalid client or loan identifier.');
  if (typeof data.notes !== 'string' || data.notes.length > 1500) throw new HttpsError('invalid-argument', 'Notes must be at most 1,500 characters.');
  const clientRef = db.doc(`clients/${data.clientId}`);
  // A repeated browser request uses the old expectedLoanId and is rejected
  // rather than issuing another loan.
  return db.runTransaction(async (tx) => {
    const [actor, clientDoc] = await Promise.all([tx.get(db.doc(`users/${uid}`)), tx.get(clientRef)]);
    if (!isAdminRole(actor.data()?.role) || actor.data()?.active === false) throw new HttpsError('permission-denied', 'Only active administrators can renew loans.');
    if (!clientDoc.exists) throw new HttpsError('not-found', 'This client no longer exists.');
    const client = { ...clientDoc.data(), id: clientDoc.id } as Client;
    if (loanId(client) !== data.expectedLoanId || client.transactionNumber !== data.expectedTransactionNumber) throw new HttpsError('failed-precondition', 'The loan changed in another session. Close this form and try again.');
    if (!isISODate(client.approvalDate) || ![45, 50, 58].includes(client.loanTermDays) || !Number.isFinite(client.principal) || client.principal <= 0 || !Number.isFinite(client.interest) || client.interest < 0) throw new HttpsError('failed-precondition', 'Correct the existing loan details before renewing.');
    const [receipts, holidays, history, counters] = await Promise.all([
      tx.get(db.collection('payments').where('clientId', '==', client.id)),
      tx.get(db.collection('holidays')),
      tx.get(clientRef.collection('renewals')),
      tx.get(db.doc('settings/Configurations/elements/counters')),
    ]);
    const payments = receipts.docs.map((p) => ({ ...p.data(), id: p.id } as Payment));
    const holidayDates = new Set<string>(holidays.docs.map((d) => d.data().date || d.id));
    const assessment = renewalEligibility(client, payments, holidayDates, today);
    if (!assessment.eligible || !assessment.paidOn) throw new HttpsError('failed-precondition', assessment.reason);
    if (history.size !== (client.renewalCount || 0) || !hasGoodRenewalHistory(history.docs.map((d) => d.data() as RenewalRecord))) throw new HttpsError('failed-precondition', 'Renewal history must be complete and contain only loans settled on time.');
    let terms;
    try { terms = validateRenewalTerms(data.terms, today, assessment.paidOn); }
    catch (error) { throw new HttpsError('invalid-argument', (error as Error).message); }
    let sequence = Number(counters.data()?.transactionSequence || 0);
    let transactionNumber = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try { transactionNumber = formatSequence(++sequence, 5); }
      catch { throw new HttpsError('resource-exhausted', 'The five digit transaction number range is exhausted.'); }
      const reservation = await tx.get(db.doc(`settings/Identifiers/transactions/${transactionNumber}`));
      if (!reservation.exists) break;
      transactionNumber = '';
    }
    if (!transactionNumber) throw new HttpsError('resource-exhausted', 'Check the transaction allocation counter.');
    // The globally reserved transaction number is also the cycle identifier.
    // Reports can resolve any renewed receipt without an additional history query.
    const renewalRef = clientRef.collection('renewals').doc(transactionNumber);
    const renewalCount = (client.renewalCount || 0) + 1;
    // Store only the public client/loan fields, not Firestore metadata or arbitrary imports.
    const previousLoan: Client = {
      id: client.id, clientNumber: client.clientNumber || client.id, transactionNumber: client.transactionNumber!,
      activeLoanId: loanId(client), renewalCount: client.renewalCount || 0,
      originalTransactionNumber: client.originalTransactionNumber || client.transactionNumber!,
      firstName: client.firstName || '', lastName: client.lastName || '', middleName: client.middleName || '',
      address: client.address || '', cellphone: client.cellphone || '', principal: client.principal,
      interest: client.interest, loanTermDays: client.loanTermDays, approvalDate: client.approvalDate,
      dailyAmount: client.dailyAmount || Math.ceil((client.principal + client.interest) * 100 / client.loanTermDays) / 100,
    };
    const newLoan: Client = { ...previousLoan, ...terms, transactionNumber, activeLoanId: renewalRef.id, renewalCount };
    tx.create(renewalRef, {
      sequence: renewalCount, previousLoan, newLoan, totalPaid: assessment.totalPaid,
      paidOn: assessment.paidOn, dueDate: assessment.dueDate,
      newDueDate: computeSchedule(terms.approvalDate, terms.loanTermDays, holidayDates, today).dueDate,
      approvedBy: uid, approvedByName: actor.data()?.fullName || 'Administrator',
      notes: (data.notes as string).trim(), createdAt: FieldValue.serverTimestamp(),
    });
    tx.update(clientRef, { ...terms, transactionNumber, originalTransactionNumber: previousLoan.originalTransactionNumber, activeLoanId: renewalRef.id, renewalCount, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.doc('settings/Configurations/elements/counters'), { transactionSequence: sequence, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(db.doc(`settings/Identifiers/transactions/${transactionNumber}`), { clientId: client.id, loanId: renewalRef.id });
    return { renewalId: renewalRef.id, transactionNumber };
  });
}
