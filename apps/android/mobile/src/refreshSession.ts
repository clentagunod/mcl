import { collection, doc, enableNetwork, getDocFromServer, getDocsFromServer, query, where } from 'firebase/firestore';
import { auth, db } from '@web/config/firebase';
import { isAdminRole, isUserRole } from '@web/lib/roles';

/** Update the existing listener cache without replacing routes, forms or receipt IDs. */
export async function refreshSessionData() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await enableNetwork(db);
  const snapshot = await getDocFromServer(doc(db, 'users', uid));
  const profile = snapshot.data();
  if (auth.currentUser?.uid !== uid || !profile || profile.active === false
    || !isUserRole(profile.role)) return;
  const reads: Promise<unknown>[] = [
    getDocsFromServer(collection(db, 'clients')),
    getDocsFromServer(collection(db, 'payments')),
    getDocsFromServer(collection(db, 'holidays')),
  ];
  if (isAdminRole(profile.role)) {
    reads.push(
      getDocsFromServer(query(collection(db, 'users'), where('role', '==', 'collector'))),
      getDocsFromServer(collection(db, 'settings', 'Configurations', 'elements')),
      getDocsFromServer(collection(db, 'settings', 'Printables', 'elements')),
    );
  } else {
    reads.push(getDocFromServer(doc(db, 'settings/Configurations/elements/paymentPolicy')));
  }
  // Each active listener receives its refreshed snapshots independently.
  await Promise.allSettled(reads);
}
