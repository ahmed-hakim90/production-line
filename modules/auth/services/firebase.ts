import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import {
  getAuth,
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User,
  UserCredential,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== 'undefined';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
} else {
  console.warn('⚠ Firebase not configured. Add VITE_FIREBASE_* variables to .env.local');
}

export { db, auth, storage, isConfigured };

export const signInWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(auth, email, password);
};

export const createUserWithEmail = async (
  email: string,
  password: string,
  userData?: { displayName: string; roleId: string; createdBy: string },
): Promise<{ uid: string }> => {
  if (!isConfigured) throw new Error('Firebase not configured');

  const appName = `userCreation_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, appName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;

    if (userData) {
      const {
        getFirestore: getFs,
        doc: fsDoc,
        setDoc: fsSetDoc,
        serverTimestamp: fsTs,
      } = await import('firebase/firestore');
      const secondaryDb = getFs(secondaryApp);
      await fsSetDoc(fsDoc(secondaryDb, 'users', uid), {
        email,
        displayName: userData.displayName,
        roleId: userData.roleId,
        isActive: true,
        createdBy: userData.createdBy,
        createdAt: fsTs(),
      });
    }

    await firebaseSignOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return { uid };
  } catch (err) {
    await firebaseSignOut(secondaryAuth).catch(() => {});
    await deleteApp(secondaryApp).catch(() => {});
    throw err;
  }
};

export const registerWithEmail = async (
  email: string,
  password: string,
): Promise<UserCredential> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  return createUserWithEmailAndPassword(auth, email, password);
};

export const signOut = async (): Promise<void> => {
  if (!isConfigured || !auth) return;
  await firebaseSignOut(auth);
};

export const resetPassword = async (email: string): Promise<void> => {
  if (!isConfigured || !auth) throw new Error('Firebase not configured');
  await sendPasswordResetEmail(auth, email);
};

export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
};
