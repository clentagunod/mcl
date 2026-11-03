import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@web/config/firebase';
import { AuthContext, type AuthContextValue } from '@web/context/AuthContext';
import { userFromDoc } from '@web/services/converters';
import { describeError } from '@web/lib/errors';
import { watchReconnect } from './connectivity';
import { refreshSessionData } from './refreshSession';

export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => watchReconnect(refreshSessionData), []);
  const [state, setState] = useState<Pick<AuthContextValue, 'status' | 'user' | 'profile' | 'accessError'>>({
    status: 'loading', user: null, profile: null, accessError: null,
  });
  useEffect(() => {
    let stopProfile = () => {};
    let generation = 0;
    const stopAuth = onAuthStateChanged(auth, user => {
      stopProfile();
      const current = ++generation;
      setState(old => ({ ...old, status: user ? 'loading' : 'signedOut', user: null, profile: null }));
      if (!user) return;
      stopProfile = onSnapshot(doc(db, 'users', user.uid), { includeMetadataChanges: true }, snapshot => {
        if (current !== generation) return;
        // Require a server-confirmed role before opening data subscriptions.
        if (snapshot.metadata.fromCache) return;
        const raw = snapshot.data();
        const profile = userFromDoc(snapshot);
        if (!profile?.active || !['admin', 'collector'].includes(raw?.role)) {
          setState({ status: 'signedOut', user: null, profile: null, accessError: 'This account is inactive or has no authorized profile.' });
          void signOut(auth).catch(() => {});
          return;
        }
        setState({ status: 'signedIn', user, profile, accessError: null });
      }, error => {
        if (current !== generation) return;
        setState({ status: 'signedOut', user: null, profile: null, accessError: describeError(error) });
        void signOut(auth).catch(() => {});
      });
    });
    return () => { generation++; stopAuth(); stopProfile(); };
  }, []);
  return <AuthContext.Provider value={{
    ...state,
    signIn: async (email, password) => { await signInWithEmailAndPassword(auth, email.trim(), password); },
    signOut: () => signOut(auth),
  }}>{children}</AuthContext.Provider>;
}
