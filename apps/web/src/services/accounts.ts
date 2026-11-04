import { createUserWithEmailAndPassword, deleteUser, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, getProvisioningAuth } from '../config/firebase';
import type { AccountInput, ManagedUserProfile, UserProfile } from '../types';
import { isManagedRole } from '../lib/roles';
import { userFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const usersCollection = collection(db, 'users');

/** Keep the collector-only feed separate for payment forms and reports. */
export const subscribeAccounts: Subscribe<ManagedUserProfile> = (onData, onError) =>
  subscribeToQuery(
    query(usersCollection, where('role', 'in', ['collector', 'admin'])),
    (snapshot) => {
      const profile = userFromDoc(snapshot);
      if (!profile || !isManagedRole(profile.role)) throw new Error('Invalid managed account profile.');
      return { ...profile, role: profile.role };
    },
    onData,
    onError,
  );

function requireSignedInUser(): string {
  if (!auth.currentUser) throw new Error('Sign in before managing accounts.');
  return auth.currentUser.uid;
}

/** Provision a login without replacing the current administrator's session. */
export async function createAccount(input: AccountInput): Promise<void> {
  requireSignedInUser();
  if (!isManagedRole(input.role)) throw new Error('Choose a valid account role.');

  const provisioningAuth = getProvisioningAuth();
  try {
    const credential = await createUserWithEmailAndPassword(provisioningAuth, input.email, input.password);
    try {
      await setDoc(doc(usersCollection, credential.user.uid), {
        role: input.role,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        active: true,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      // Roll back the login if its profile could not be saved.
      await deleteUser(credential.user).catch(() => undefined);
      throw error;
    }
  } finally {
    await signOut(provisioningAuth).catch(() => undefined);
  }
}

export async function updateAccount(
  uid: string,
  changes: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'active'>>,
): Promise<void> {
  const currentUid = requireSignedInUser();
  if (uid === currentUid && changes.active === false) throw new Error('You cannot deactivate your own account.');
  await updateDoc(doc(usersCollection, uid), changes);
}

/** Revoke data access by removing the profile; the Auth login remains in Firebase. */
export async function deleteAccount(uid: string): Promise<void> {
  const currentUid = requireSignedInUser();
  if (uid === currentUid) throw new Error('You cannot delete your own account.');
  await deleteDoc(doc(usersCollection, uid));
}

export async function sendAccountPasswordReset(email: string): Promise<void> {
  requireSignedInUser();
  await sendPasswordResetEmail(auth, email);
}
