import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { describeError } from '../lib/errors';
import { isAdminRole } from '../lib/roles';
import type { UserProfile } from '../types';
import type { AuthStatus } from '../context/AuthContext';
import { userFromDoc } from './converters';

export interface AdminSession {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  accessError: string | null;
}

/** A late response from a prior user/listener must never reopen the workspace. */
export function watchAdminSession(onState: (state: AdminSession) => void) {
  let generation = 0;
  let stopProfile = () => {};
  let denial: string | null = null;
  const stopAuth = onAuthStateChanged(auth, (user) => {
    stopProfile();
    stopProfile = () => {};
    const current = ++generation;
    onState({ status: user ? 'loading' : 'signedOut', user: null, profile: null, accessError: denial });
    if (!user) return;
    const isCurrent = () => current === generation && auth.currentUser?.uid === user.uid;
    const deny = (message: string) => {
      if (!isCurrent()) return;
      denial = message;
      onState({ status: 'signedOut', user: null, profile: null, accessError: message });
      void signOut(auth).catch(() => {});
    };
    stopProfile = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, (snapshot) => {
      if (!isCurrent() || snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
      const profile = userFromDoc(snapshot);
      if (!profile?.active || !isAdminRole(profile.role)) {
        deny('This account is inactive or does not have administrator access.');
        return;
      }
      denial = null;
      onState({ status: 'signedIn', user, profile, accessError: null });
    }, (error) => deny(describeError(error)));
  });
  return () => { generation++; stopAuth(); stopProfile(); };
}
