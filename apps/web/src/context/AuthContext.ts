import type { User } from 'firebase/auth';
import { createContext, useContext } from 'react';
import type { UserProfile } from '../types';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  profile: UserProfile | null;
  /** Set when someone signed in successfully but is not allowed to use the web app. */
  accessError: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
