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
const USER_COLLECTION = 'users';
const TOKEN_SUBCOLLECTION = 'fcmTokens';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

let messagingRef: Messaging | null = null;
let warnedInvalidVapid = false;

function isLikelyValidVapidKey(key?: string): boolean {
  if (!key) return false;
  // Firebase Web Push public key is base64url-like (no spaces/quotes).
  return /^[A-Za-z0-9_-]{40,}$/.test(key.trim());
}

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
  if (!isLikelyValidVapidKey(VAPID_KEY)) {
    if (!warnedInvalidVapid) {
      warnedInvalidVapid = true;
      console.warn('Push notifications disabled: VITE_FIREBASE_VAPID_KEY is missing or invalid.');
    }
    return null;
  }
  if (messagingRef) return messagingRef;

  const config = buildFirebaseConfig();
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(config);
  messagingRef = getMessaging(app);
  return messagingRef;
}

function buildTokenDocId(token: string): string {
  return token.slice(-24).replace(/[^A-Za-z0-9_-]/g, '');
}

async function persistTokenOnUser(userId: string, token: string): Promise<void> {
  const tokenDocId = buildTokenDocId(token) || token.slice(-10);
  await setDoc(
    doc(db, `${USER_COLLECTION}/${userId}/${TOKEN_SUBCOLLECTION}/${tokenDocId}`),
    {
      token,
      userId,
      device: String(navigator.userAgent || '').slice(0, 120),
      createdAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      enabled: true,
    },
    { merge: true },
  );
}

export interface ForegroundPushPayload {
  title: string;
  body: string;
  data: Record<string, string>;
}

export const pushService = {
  async registerDevice(userId: string, employeeId?: string): Promise<string | null> {
    if (!userId) return null;
    try {
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
      await persistTokenOnUser(userId, token);
      return token;
    } catch (error) {
      const name = String((error as { name?: string })?.name || '');
      const message = String((error as { message?: string })?.message || '');
      if (name === 'InvalidAccessError' || message.includes('applicationServerKey')) {
        console.warn('Push notifications disabled: invalid VAPID key configuration.');
        return null;
      }
      console.warn('Push registration skipped:', error);
      return null;
    }
  },

  async disableCurrentToken(userId: string): Promise<void> {
    try {
      const messaging = await ensureMessaging();
      if (!messaging || !userId) return;
      const token = await getToken(messaging, { vapidKey: VAPID_KEY });
      if (!token) return;
      await deleteToken(messaging).catch(() => {});
      await setDoc(doc(db, DEVICE_COLLECTION, token), {
        enabled: false,
        updatedAt: serverTimestamp(),
      }, { merge: true }).catch(() => {});
      const tokenDocId = buildTokenDocId(token) || token.slice(-10);
      await setDoc(
        doc(db, `${USER_COLLECTION}/${userId}/${TOKEN_SUBCOLLECTION}/${tokenDocId}`),
        {
          enabled: false,
          lastSeen: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {});
    } catch {
      // No-op: device token cleanup should never block app flow.
    }
  },

  async subscribeForeground(onReceive: (payload: ForegroundPushPayload) => void): Promise<() => void> {
    const messaging = await ensureMessaging();
    if (!messaging) return () => {};
    return onMessage(messaging, (payload) => {
      const title = payload.notification?.title || 'إشعار جديد';
      const body = payload.notification?.body || '';
      onReceive({
        title,
        body,
        data: (payload.data || {}) as Record<string, string>,
      });
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

export const registerFCMToken = pushService.registerDevice.bind(pushService);
export const initFCMListener = pushService.subscribeForeground.bind(pushService);
