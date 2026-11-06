import { collection, doc, orderBy, query, runTransaction, serverTimestamp, Timestamp, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { subscribeToQuery } from './subscribe';
import type { Client, RenewalRecord, RenewalTerms } from '../types';
import { loanId } from '../lib/loan-cycle';
import { clientFromDoc, paymentFromDoc } from './converters';
import { readQueryDocuments, requireAdmin } from './firestore-admin';
import { hasGoodRenewalHistory, renewalEligibility, validateRenewalTerms } from '../lib/renewal';
import { formatSequence } from '../lib/identifiers';
import { computeSchedule } from '../lib/loan';
import { dailyPayable } from '../lib/printables';
import { advanceLoanBalance, loanTotalCents, moneyCents, readLoanBalance } from './loan-balances';

export function subscribeRenewals(clientId: string, onData: (data: RenewalRecord[]) => void, onError: (error: Error) => void) {
  return subscribeToQuery(query(collection(db, 'clients', clientId, 'renewals'), orderBy('sequence', 'desc')), (doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null } as RenewalRecord;
  }, onData, onError);
}

export async function renewClient(client: Client, terms: RenewalTerms, notes: string): Promise<void> {
  if (notes.length > 1500) throw new Error('Notes must be at most 1,500 characters.');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await runTransaction(db, async transaction => {
    const actor = await requireAdmin(transaction);
    const clientRef = doc(db, 'clients', client.id);
    const source = await transaction.get(clientRef);
    if (!source.exists()) throw new Error('This client no longer exists.');
    const current = clientFromDoc(source);
    if (loanId(current) !== loanId(client) || current.transactionNumber !== client.transactionNumber || current.revision !== client.revision) {
      throw new Error('The loan changed in another session. Close this form and try again.');
    }
    // Track the shared balance BEFORE external query reads. Any receipt delta invalidates
    // this transaction and repeats the complete eligibility assessment on retry.
    const balance = await readLoanBalance(transaction, client.id, source.data());
    if (balance.value.paidCents !== loanTotalCents(source.data())) throw new Error('The current loan must be fully paid before renewal.');
    const [receipts, holidays, history] = await Promise.all([
      readQueryDocuments(transaction, query(collection(db, 'payments'), where('clientId', '==', client.id))),
      readQueryDocuments(transaction, collection(db, 'holidays')),
      readQueryDocuments(transaction, collection(clientRef, 'renewals')),
    ]);
    const holidayDates = new Set(holidays.map(document => String(document.data()?.date || document.id)));
    const assessment = renewalEligibility(current, receipts.map(document => paymentFromDoc(document)), holidayDates, today);
    if (!assessment.eligible || !assessment.paidOn) throw new Error(assessment.reason);
    const paidFromReceipts = receipts.reduce((sum, receipt) => {
      const data = receipt.data();
      return (data.loanId || 'initial') === balance.value.loanId ? sum + moneyCents(data.amount, true) : sum;
    }, 0);
    if (!Number.isSafeInteger(paidFromReceipts) || paidFromReceipts !== balance.value.paidCents) throw new Error('Receipt history disagrees with the protected balance. Reconcile before renewal.');
    if (history.length !== (current.renewalCount || 0) || !hasGoodRenewalHistory(history.map(document => document.data() as RenewalRecord))) {
      throw new Error('Renewal history must be complete and contain only loans settled on time.');
    }
    const validatedTerms = validateRenewalTerms(terms, today, assessment.paidOn);
    const counterRef = doc(db, 'settings', 'Configurations', 'elements', 'counters');
    const counters = await transaction.get(counterRef);
    let sequence = Number(counters.data()?.transactionSequence || 0);
    let transactionNumber = '';
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const candidate = formatSequence(++sequence, 5);
      const reservation = await transaction.get(doc(db, 'settings', 'Identifiers', 'transactions', candidate));
      const record = await transaction.get(doc(clientRef, 'renewals', candidate));
      if (!reservation.exists() && !record.exists()) { transactionNumber = candidate; break; }
    }
    if (!transactionNumber) throw new Error('Check the transaction allocation counter.');
    const previousLoan: Client = {
      id: current.id, clientNumber: current.clientNumber || current.id, transactionNumber: current.transactionNumber || '',
      activeLoanId: loanId(current), renewalCount: current.renewalCount || 0,
      originalTransactionNumber: current.originalTransactionNumber || current.transactionNumber || '',
      firstName: current.firstName, middleName: current.middleName, lastName: current.lastName,
      address: current.address, cellphone: current.cellphone, principal: current.principal, interest: current.interest,
      loanTermDays: current.loanTermDays, approvalDate: current.approvalDate, dailyAmount: dailyPayable(current),
    };
    const renewalCount = (current.renewalCount || 0) + 1;
    const newLoan: Client = { ...previousLoan, ...validatedTerms, transactionNumber, activeLoanId: transactionNumber, renewalCount };
    transaction.set(doc(clientRef, 'renewals', transactionNumber), {
      sequence: renewalCount, previousLoan, newLoan, totalPaid: balance.value.paidCents / 100,
      paidOn: assessment.paidOn, dueDate: assessment.dueDate,
      newDueDate: computeSchedule(validatedTerms.approvalDate, validatedTerms.loanTermDays, holidayDates, today).dueDate,
      approvedBy: actor.uid, approvedByName: actor.fullName, notes: notes.trim(), createdAt: serverTimestamp(),
    });
    transaction.set(balance.ref, advanceLoanBalance(balance.value, 'renew', '', 0, transactionNumber));
    transaction.update(clientRef, { ...validatedTerms, transactionNumber, activeLoanId: transactionNumber, renewalCount,
      originalTransactionNumber: previousLoan.originalTransactionNumber, updatedAt: serverTimestamp() });
    transaction.set(counterRef, { transactionSequence: sequence, updatedAt: serverTimestamp() }, { merge: true });
    transaction.set(doc(db, 'settings', 'Identifiers', 'transactions', transactionNumber), { clientId: client.id, loanId: transactionNumber });
  });
}
