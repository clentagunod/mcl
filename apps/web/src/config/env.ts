/**
 * Reads and validates the Firebase settings from Vite environment variables.
 * Keeping this separate from the Firebase initialisation lets the app show a
 * friendly setup screen instead of crashing when ".env" is missing.
 */

const REQUIRED_KEYS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

const env = import.meta.env;

function read(key: string): string {
  const value: unknown = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Names of required variables that are empty or missing. */
export const missingEnvKeys: string[] = REQUIRED_KEYS.filter((key) => read(key) === '');

export const firebaseConfig = {
  apiKey: read('VITE_FIREBASE_API_KEY'),
  authDomain: read('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: read('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: read('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: read('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: read('VITE_FIREBASE_APP_ID'),
};
