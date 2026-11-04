import { doc, getDocsFromServer, type DocumentData, type Query, type Transaction } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { isAdminRole } from '../lib/roles';

/** Recheck the profile in every transaction, including automatic retries. */
export async function requireAdmin(transaction: Transaction) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Sign in before making changes.');
  const profile = await transaction.get(doc(db, 'users', uid));
  const data = profile.data();
  if (!data || !isAdminRole(data.role) || data.active === false) {
    throw new Error('An active administrator account is required.');
  }
  return { uid, fullName: typeof data.fullName === 'string' ? data.fullName : '' };
}

/**
 * The browser SDK cannot run queries as transaction reads. Query the server, then
 * track each returned document so edits/deletions cause the transaction to retry.
 * New matching documents are not locked; callers must not treat this as a query lock.
 */
export async function readQueryDocuments(transaction: Transaction, query: Query<DocumentData>) {
  const snapshot = await getDocsFromServer(query);
  return Promise.all(snapshot.docs.map(async document => {
    const current = await transaction.get(document.ref);
    if (!current.exists()) throw new Error('Records changed. Refresh and try again.');
    return current;
  }));
}
