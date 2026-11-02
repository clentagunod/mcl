import { collection, doc, getDocsFromServer, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '@web/config/firebase';
import type { PaymentInput, Payment } from '@web/types';
import { dailyPayable } from '@web/lib/printables';
import { isISODate } from '@web/lib/dates';
import { clientFromDoc } from '@web/services/converters';
export function parseAmount(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Enter a positive amount with at most two decimal places.');
  const amount = Number(value);
  if (amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) throw new Error('Amount is outside the supported range.');
  return amount;
}
export async function saveReceipt(id: string, input: PaymentInput, previous?: Payment) {
  parseAmount(String(input.amount));
  if (!isISODate(input.paymentDate) || (input.notes?.length ?? 0) > 1500) throw new Error('Check the collection date and notes.');
  const records = await getDocsFromServer(query(collection(db, 'payments'), where('clientId', '==', input.clientId)));
  await runTransaction(db, async tx => {
    const ref = doc(db, 'payments', id);
    const existing = await tx.get(ref);
    if (!previous && existing.exists()) {
      const old = existing.data();
      if (Object.entries(input).every(([key, value]) => old[key] === value)) return;
      throw new Error('Receipt identifier already exists with different details. Ask an administrator to check it.');
    }
    const profile = await tx.get(doc(db, 'users', input.collectorId));
    const clientDoc = await tx.get(doc(db, 'clients', input.clientId));
    const policy = await tx.get(doc(db, 'settings/Configurations/elements/paymentPolicy'));
    const role = profile.data()?.role;
    if (!profile.exists() || profile.data()?.active === false || !['admin', 'collector'].includes(role)) throw new Error('Account access has changed.');
    if (!clientDoc.exists()) throw new Error('Client no longer exists.');
    const client = clientFromDoc(clientDoc);
    const today = new Date();
    const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) || input.paymentDate < client.approvalDate || input.paymentDate > date) throw new Error('Choose a collection date from approval through today.');
    if (role === 'collector' && policy.data()?.enforceDailyMinimum && input.amount < dailyPayable(client)) throw new Error('Payment is below the required daily amount. Ask an administrator for a smaller settlement.');
    const paid = records.docs.filter(d => d.id !== (previous ? id : '')).reduce((sum, d) => sum + Math.round(Number(d.data().amount) * 100), 0);
    const outstanding = Math.round((client.principal + client.interest) * 100) - paid;
    if (Math.round(input.amount * 100) > outstanding) throw new Error('Amount exceeds the latest outstanding balance.');
    if (previous) {
      if (role !== 'admin' && existing.data()?.collectorId !== input.collectorId) throw new Error('You can only edit your own payments.');
      if (!existing.exists() || existing.data().amount !== previous.amount || existing.data().paymentDate !== previous.paymentDate || (existing.data().notes ?? existing.data().note ?? '') !== (previous.notes ?? '')) throw new Error('This receipt changed elsewhere. Close and reopen it.');
      tx.update(ref, { amount: input.amount, paymentDate: input.paymentDate, notes: input.notes ?? '' });
    } else tx.set(ref, { ...input, createdAt: serverTimestamp() });
  });
}
