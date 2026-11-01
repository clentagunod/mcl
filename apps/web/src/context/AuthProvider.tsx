import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../config/firebase';
import { describeError } from '../lib/errors';
import { getUserProfile } from '../services/users';
import type { UserProfile } from '../types';
import { AuthContext, type AuthContextValue, type AuthStatus } from './AuthContext';

const ADMIN_ONLY_MESSAGE =
  'This account does not have administrator access. Collector accounts can only sign in on the Android app.';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  accessError: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    user: null,
    profile: null,
    accessError: null,
  });

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        // Keep any "not allowed" message so the login page can still show why we signed out.
        setState((previous) => ({ status: 'signedOut', user: null, profile: null, accessError: previous.accessError }));
        return;
      }

      // Signing in with email/password proves WHO someone is. The profile document says
      // WHAT they may do, and only admins may use this web app.
      let denial: string | null = null;
      try {
        const profile = await getUserProfile(user.uid);
        if (!active) return;
        if (profile && profile.role === 'admin' && profile.active) {
          setState({ status: 'signedIn', user, profile, accessError: null });
          return;
        }
        denial = ADMIN_ONLY_MESSAGE;
      } catch (error) {
        if (!active) return;
        denial = describeError(error);
      }

      setState((previous) => ({ ...previous, accessError: denial }));
      await firebaseSignOut(auth);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((previous) => ({ ...previous, accessError: null }));
    await signInWithEmailAndPassword(auth, email.trim(), password);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signOut }),
    [state, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
