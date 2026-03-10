import { initializeApp, getApps } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
} from 'firebase/messaging';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';

const DEVICE_COLLECTION = 'user_devices';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let messagingRef: Messaging | null = null;

function buildFirebaseConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

async function ensureMessaging(): Promise<Messaging | null> {
  if (!isConfigured) return null;
  if (!(await isSupported())) return null;
  if (!VAPID_KEY) return null;
  if (messagingRef) return messagingRef;

  const config = buildFirebaseConfig();
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
  messagingRef = getMessaging(app);
  return messagingRef;
}

export const pushService = {
  async registerDevice(userId: string, employeeId?: string): Promise<string | null> {
    if (!userId) return null;
    const messaging = await ensureMessaging();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    const ref = doc(db, DEVICE_COLLECTION, token);
    await setDoc(ref, {
      token,
      userId,
      employeeId: employeeId || '',
      platform: 'web',
      userAgent: navigator.userAgent || '',
      enabled: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return token;
  },

  async disableCurrentToken(userId: string): Promise<void> {
    const messaging = await ensureMessaging();
    if (!messaging || !userId) return;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return;
    await deleteToken(messaging).catch(() => {});
    await setDoc(doc(db, DEVICE_COLLECTION, token), {
      enabled: false,
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  },

  async subscribeForeground(onReceive: (title: string, body: string) => void): Promise<() => void> {
    const messaging = await ensureMessaging();
    if (!messaging) return () => {};
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title || 'إشعار جديد';
      const body = payload.notification?.body || '';
      onReceive(title, body);
    });
  },

  async listEmployeeTokens(employeeId: string): Promise<string[]> {
    if (!employeeId) return [];
    const q = query(
      collection(db, DEVICE_COLLECTION),
      where('employeeId', '==', employeeId),
      where('enabled', '==', true),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => String((d.data() as any).token || '')).filter(Boolean);
  },
};
