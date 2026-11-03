import { collection, orderBy, query, Timestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '../config/firebase';
import { subscribeToQuery } from './subscribe';
import type { Client, RenewalRecord, RenewalTerms } from '../types';
import { loanId } from '../lib/loan-cycle';

export function subscribeRenewals(clientId: string, onData: (data: RenewalRecord[]) => void, onError: (error: Error) => void) {
  return subscribeToQuery(query(collection(db, 'clients', clientId, 'renewals'), orderBy('sequence', 'desc')), (doc) => {
    const data = doc.data();
    return { ...data, id: doc.id, createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : null } as RenewalRecord;
  }, onData, onError);
}

export async function renewClient(client: Client, terms: RenewalTerms, notes: string): Promise<void> {
  const call = httpsCallable(getFunctions(auth.app, 'asia-southeast1'), 'renewClient');
  await call({ clientId: client.id, expectedLoanId: loanId(client), expectedTransactionNumber: client.transactionNumber || '', terms, notes });
}
