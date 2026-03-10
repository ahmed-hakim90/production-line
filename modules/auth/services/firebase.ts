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
import { getFunctions, httpsCallable, Functions } from 'firebase/functions';

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
let functionsClient: Functions;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
  storage = getStorage(app);
  functionsClient = getFunctions(app, 'us-central1');
} else {
  console.warn('⚠ Firebase not configured. Add VITE_FIREBASE_* variables to .env.local');
}

export { db, auth, storage, isConfigured };

const normalizeCallableError = (error: any): Error => {
  const code = String(error?.code || '').toLowerCase();
  const message = String(error?.message || '').trim();

  if (code.includes('unauthenticated')) {
    return new Error('يجب تسجيل الدخول أولًا ثم إعادة المحاولة.');
  }
  if (code.includes('permission-denied')) {
    return new Error('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
  }
  if (code.includes('failed-precondition')) {
    return new Error(message || 'لا يمكن تنفيذ العملية في الحالة الحالية.');
  }
  if (code.includes('not-found')) {
    return new Error('الخدمة غير متاحة حاليًا. تأكد من نشر Cloud Functions.');
  }
  if (code.includes('unavailable') || code.includes('deadline-exceeded')) {
    return new Error('تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت ثم أعد المحاولة.');
  }
  if (message) {
    return new Error(message);
  }
  return new Error('حدث خطأ غير متوقع أثناء التواصل مع الخادم.');
};

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

export const deleteUserHard = async (targetUid: string): Promise<void> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<{ targetUid: string }, { ok: boolean }>(
    functionsClient,
    'adminDeleteUserHard',
  );
  try {
    await callable({ targetUid });
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const updateUserCredentialsHard = async (input: {
  targetUid: string;
  email?: string;
  password?: string;
}): Promise<void> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { targetUid: string; email?: string; password?: string },
    { ok: boolean }
  >(functionsClient, 'adminUpdateUserCredentials');
  try {
    await callable(input);
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};

export const runAssetDepreciationCallable = async (input?: { period?: string }): Promise<{
  period: string;
  processedAssets: number;
  createdEntries: number;
  skippedEntries: number;
}> => {
  if (!isConfigured || !functionsClient) throw new Error('Firebase not configured');
  const callable = httpsCallable<
    { period?: string } | undefined,
    { period: string; processedAssets: number; createdEntries: number; skippedEntries: number }
  >(functionsClient, 'runAssetDepreciationJob');
  try {
    const result = await callable(input);
    return result.data;
  } catch (error: any) {
    throw normalizeCallableError(error);
  }
};
