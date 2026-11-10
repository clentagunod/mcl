import type { Firestore, Transaction } from 'firebase-admin/firestore';

/** The caller locks/touches the shared counter in this transaction. */
export async function canResetIdentifiers(db: Firestore, tx: Transaction, excludingTrashId: string): Promise<boolean> {
  const policy = await tx.get(db.doc('settings/Configurations/elements/identifierPolicy'));
  if (policy.data()?.resetWhenEmpty !== true) return false;
  const [clients, trash] = await Promise.all([
    tx.get(db.collection('clients').limit(1)), tx.get(db.collection('clientTrash').limit(2)),
  ]);
  return clients.empty && trash.docs.every(document => document.id === excludingTrashId);
}
