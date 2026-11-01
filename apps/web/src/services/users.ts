import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { UserProfile } from '../types';
import { userFromDoc } from './converters';

/** Loads the role/profile document for a signed-in Firebase user. Null when none exists. */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  return snapshot.exists() ? userFromDoc(snapshot) : null;
}
