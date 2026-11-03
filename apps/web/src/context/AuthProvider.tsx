import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth } from '../config/firebase';
import { watchAdminSession, type AdminSession } from '../services/admin-session';
import { AuthContext, type AuthContextValue } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdminSession>({
    status: 'loading',
    user: null,
    profile: null,
    accessError: null,
  });

  useEffect(() => watchAdminSession(setState), []);

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
