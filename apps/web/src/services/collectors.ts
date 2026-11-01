import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { collection, deleteDoc, doc, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, getProvisioningAuth } from '../config/firebase';
import type { CollectorInput, UserProfile } from '../types';
import { userFromDoc } from './converters';
import { subscribeToQuery, type Subscribe } from './subscribe';

const usersCollection = collection(db, 'users');

export const subscribeCollectors: Subscribe<UserProfile> = (onData, onError) =>
  subscribeToQuery(
    query(usersCollection, where('role', '==', 'collector')),
    (snapshot) => userFromDoc(snapshot) as UserProfile,
    onData,
    onError,
  );

/**
 * Creates the collector's login (Firebase Authentication) and their profile document.
 * The collector then signs in on the Android app with this email and password.
 */
export async function createCollector(input: CollectorInput): Promise<void> {
  const provisioningAuth = getProvisioningAuth();
  const credential = await createUserWithEmailAndPassword(provisioningAuth, input.email, input.password);

  try {
    await setDoc(doc(usersCollection, credential.user.uid), {
      role: 'collector',
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      active: true,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Do not leave a login behind that has no profile.
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  } finally {
    await signOut(provisioningAuth).catch(() => undefined);
  }
}

export async function updateCollector(
  uid: string,
  changes: Partial<Pick<UserProfile, 'fullName' | 'phone' | 'active'>>,
): Promise<void> {
  await updateDoc(doc(usersCollection, uid), changes);
}

/**
 * Removes the collector's profile, which immediately blocks them from the database
 * (the Firestore rules require a profile). The Firebase Authentication login itself can
 * only be removed from the Firebase Console; see README.
 */
export async function deleteCollector(uid: string): Promise<void> {
  await deleteDoc(doc(usersCollection, uid));
}

export async function sendCollectorPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}
