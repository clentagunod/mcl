import { collection, doc, getDocsFromServer, limit, query, type Transaction } from 'firebase/firestore';
import { db } from '../config/firebase';

/** Caller reads the shared counter BEFORE this check and writes it in the same
 * transaction. Creation, renewal and Trash transitions also write that document,
 * so a concurrent lifecycle operation invalidates an empty-workspace result.
 */
export async function canResetIdentifiers(transaction: Transaction, excludingTrashId?: string): Promise<boolean> {
  const policy = await transaction.get(doc(db, 'settings/Configurations/elements/identifierPolicy'));
  if (policy.data()?.resetWhenEmpty !== true) return false;
  const [clients, trash] = await Promise.all([
    getDocsFromServer(query(collection(db, 'clients'), limit(1))),
    getDocsFromServer(query(collection(db, 'clientTrash'), limit(excludingTrashId ? 2 : 1))),
  ]);
  return clients.empty && trash.docs.every(document => document.id === excludingTrashId);
}
