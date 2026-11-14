import { getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Used only by an explicit browser-test route override; production never imports this file.
if (location.hostname !== '127.0.0.1' || location.port !== '4180') throw new Error('Printing-session fixtures require the isolated local test server.');
const app = getApps().find(item => item.name === 'printing-session-test') ?? initializeApp({
  projectId: 'demo-mcl-printing', apiKey: 'demo-printing-key', appId: 'demo-printing-app',
}, 'printing-session-test');
export const auth = getAuth(app);
export const db = getFirestore(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
connectFirestoreEmulator(db, '127.0.0.1', 8188);
export const getProvisioningAuth = () => auth;
