import { FirebaseError } from 'firebase/app';

const MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
  'auth/email-already-in-use': 'An account with that email already exists.',
  'auth/weak-password': 'That password is too weak. Use a longer one.',
  'auth/operation-not-allowed':
    'Sign-in is currently unavailable. Please contact your administrator.',
  'permission-denied':
    'You do not have permission to complete this action. Please contact your administrator.',
  unavailable: 'Cannot reach the server right now. Check your internet connection.',
};

/** Turns any thrown value into a message that is safe and useful to show to the admin. */
export function describeError(error: unknown): string {
  if (error instanceof FirebaseError) {
    if (['functions/failed-precondition', 'functions/invalid-argument', 'functions/permission-denied', 'functions/resource-exhausted', 'functions/not-found'].includes(error.code)) return userMessage(error.message);
    if (error.code.startsWith('functions/')) return 'The server could not confirm this action. Check your connection and retry. If this continues, contact an administrator.';
    return MESSAGES[error.code] ?? `Something went wrong (${error.code}).`;
  }
  if (error instanceof Error) return userMessage(error.message);
  return 'Something went wrong. Please try again.';
}

/** Keep infrastructure diagnostics out of user-facing notifications. */
function userMessage(message: string): string {
  return /firebase|firestore/i.test(message)
    ? 'This action could not be completed. Please try again or contact your administrator.'
    : message;
}
