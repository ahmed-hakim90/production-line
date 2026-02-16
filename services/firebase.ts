/**
 * Firebase Core Initialization
 * Reads config from VITE_ environment variables.
 * Add your Firebase credentials to .env.local
 */
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import {
  getAuth,
  Auth,
  signInAnonymously,
  onAuthStateChanged,
  User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** true when at least the API key is present */
const isConfigured =
  !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} else {
  console.warn(
    '⚠ Firebase not configured. Add VITE_FIREBASE_* variables to .env.local'
  );
}

export { db, auth, isConfigured };

/**
 * Sign in anonymously — returns the UID or null on failure.
 */
export const authenticateAnonymously = async (): Promise<string | null> => {
  if (!isConfigured || !auth) return null;
  try {
    const result = await signInAnonymously(auth);
    return result.user.uid;
  } catch (error) {
    console.error('Anonymous authentication failed:', error);
    return null;
  }
};

/**
 * Listen for auth state changes.
 * Returns an unsubscribe function.
 */
export const onAuthChange = (
  callback: (user: User | null) => void
): (() => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};
