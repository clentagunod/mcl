import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { renewClientLoan } from './renew-client';
import { mutateReceipt } from './receipt';

initializeApp();
export const renewClient = onCall({ region: 'asia-southeast1', maxInstances: 10 }, async (request) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return renewClientLoan(getFirestore(), request.auth?.uid || '', request.data, today);
});

export const writeReceipt = onCall({ region: 'asia-southeast1', maxInstances: 10 }, async (request) => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return mutateReceipt(getFirestore(), request.auth?.uid || '', request.data, today);
});
