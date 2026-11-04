import { getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './env';

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

const PROVISIONING_APP_NAME = 'collector-provisioning';

/**
 * A separate Firebase app instance used only to create collector and admin accounts.
 *
 * Why: `createUserWithEmailAndPassword` signs the new user in. Doing that on the main
 * app would log the admin out. A second app has its own independent login session,
 * so the admin stays signed in on the main app.
 */
export function getProvisioningAuth() {
  const existing = getApps().find((candidate) => candidate.name === PROVISIONING_APP_NAME);
  return getAuth(existing ?? initializeApp(firebaseConfig, PROVISIONING_APP_NAME));
}
