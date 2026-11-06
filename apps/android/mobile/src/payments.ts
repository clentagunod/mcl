import { collection, doc, getDocsFromServer, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@web/config/firebase';
import type { PaymentInput, Payment } from '@web/types';
import { dailyPayable } from '@web/lib/printables';
import { isISODate } from '@web/lib/dates';
import { clientFromDoc } from '@web/services/converters';
import { assertCycle, cycleId, PaymentValidationError } from './loanCycle';
import { receiptBackendEnabled, writeServerReceipt } from '@web/services/receipt-backend';
import { isMoney } from '@web/lib/money';
import { isAdminRole, isUserRole } from '@web/lib/roles';
export function parseAmount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new PaymentValidationError('Enter a positive amount with at most two decimal places.');
  const amount = Number(value);
  if (!isMoney(amount) || amount <= 0) throw new PaymentValidationError('Amount is outside the supported range.');
  return amount;
}
export async function saveReceipt(id: string, input: PaymentInput, previous?: Payment, operationId = id) {
  input = { ...input, loanId: cycleId(input.loanId) };
  parseAmount(String(input.amount));
  if (!isISODate(input.paymentDate) || (input.notes?.length ?? 0) > 1500) throw new PaymentValidationError('Check the collection date and notes.');
  if (receiptBackendEnabled) {
    await writeServerReceipt(previous ? 'correct' : 'create', id, operationId, input, previous);
    return;
  }
  const records = await getDocsFromServer(query(collection(db, 'payments'), where('clientId', '==', input.clientId)));
  await runTransaction(db, async tx => {
    const ref = doc(db, 'payments', id);
    const existing = await tx.get(ref);
    if (!previous && existing.exists()) {
      const old: Record<string, unknown> = { ...existing.data(), loanId: cycleId(existing.data().loanId) };
      if (Object.entries(input).every(([key, value]) => old[key] === value)) return;
      throw new Error('Receipt identifier already exists with different details. Ask an administrator to check it.');
    }
    const profile = await tx.get(doc(db, 'users', input.collectorId));
    const clientDoc = await tx.get(doc(db, 'clients', input.clientId));
    const policy = await tx.get(doc(db, 'settings/Configurations/elements/paymentPolicy'));
    const role = profile.data()?.role;
    if (!profile.exists() || profile.data()?.active === false || !isUserRole(role)) throw new PaymentValidationError('Account access has changed.');
    if (!clientDoc.exists()) throw new PaymentValidationError('Client no longer exists.');
    const client = clientFromDoc(clientDoc);
    assertCycle(input.loanId, client.activeLoanId);
    if (previous) assertCycle(previous.loanId, client.activeLoanId);
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || input.paymentDate < client.approvalDate || input.paymentDate > date) throw new PaymentValidationError('Choose a collection date from approval through today.');
    if (role === 'collector' && policy.data()?.enforceDailyMinimum && input.amount < dailyPayable(client)) throw new PaymentValidationError('Payment is below the required daily amount. Ask an administrator for a smaller settlement.');
    const paid = records.docs.filter(d => d.id !== (previous ? id : '') && d.data().clientId === input.clientId && cycleId(d.data().loanId) === input.loanId).reduce((sum, d) => sum + Math.round(Number(d.data().amount) * 100), 0);
    const outstanding = Math.round((client.principal + client.interest) * 100) - paid;
    if (role === 'collector' && policy.data()?.enforceDailyMinimum && outstanding < Math.round(dailyPayable(client) * 100)) throw new PaymentValidationError('Remaining balance is below the daily minimum. Ask an administrator for settlement.');
    if (Math.round(input.amount * 100) > outstanding) throw new PaymentValidationError('Amount exceeds the latest outstanding balance.');
    if (previous) {
      if (!isAdminRole(role)) throw new PaymentValidationError('Saved payment corrections require an administrator.');
      if (!existing.exists() || existing.data().amount !== previous.amount || existing.data().paymentDate !== previous.paymentDate || (existing.data().notes ?? existing.data().note ?? '') !== (previous.notes ?? '')) throw new PaymentValidationError('This receipt changed elsewhere. Close and reopen it.');
      // Corrections keep the original creation time and collector, including renewed loans.
      tx.update(ref, { amount: input.amount, paymentDate: input.paymentDate, notes: input.notes ?? '' });
    } else tx.set(ref, { ...input, createdAt: serverTimestamp() });
  });
}
