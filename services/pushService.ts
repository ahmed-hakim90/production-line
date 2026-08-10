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
import { FIREBASE_MESSAGING_SW_SCOPE } from '../utils/clientCachePurge';

const DEVICE_COLLECTION = 'user_devices';
const USER_COLLECTION = 'users';
const TOKEN_SUBCOLLECTION = 'fcmTokens';
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/** Uncompressed P-256 public key length expected by Web Push / FCM. */
const VAPID_PUBLIC_KEY_BYTES = 65;

let messagingRef: Messaging | null = null;
let warnedInvalidVapid = false;
let warnedRegistrationFailure = false;
let registerInFlight: Promise<string | null> | null = null;
let lastRegisterKey: string | null = null;

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const pad = '='.repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(`${normalized}${pad}`);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Firebase Web Push public keys are uncompressed EC P-256 points (65 bytes, 0x04 prefix).
 * A truncated / wrong key still looks like base64url and causes FCM 401 on register.
 */
function resolveVapidKey(key?: string): string | undefined {
  if (!key) return undefined;
  const trimmed = key.trim();
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(trimmed)) return undefined;
  const bytes = decodeBase64Url(trimmed);
  if (!bytes || bytes.length !== VAPID_PUBLIC_KEY_BYTES || bytes[0] !== 0x04) {
    return undefined;
  }
  return trimmed;
}

const resolvedVapidKey = resolveVapidKey(VAPID_KEY);

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

function buildGetTokenOptions(registration: ServiceWorkerRegistration) {
  const options: { serviceWorkerRegistration: ServiceWorkerRegistration; vapidKey?: string } = {
    serviceWorkerRegistration: registration,
  };
  // Only pass a project-registered Web Push key. Invalid keys make FCM return 401.
  // Omitting vapidKey uses Firebase's default project key (registration still works).
  if (resolvedVapidKey) {
    options.vapidKey = resolvedVapidKey;
  } else if (VAPID_KEY && !warnedInvalidVapid) {
    warnedInvalidVapid = true;
    console.warn(
      'Push using Firebase default VAPID: VITE_FIREBASE_VAPID_KEY is missing or invalid. ' +
        'Generate a Web Push certificate in Firebase Console → Project settings → Cloud Messaging, then set VITE_FIREBASE_VAPID_KEY.',
    );
  }
  return options;
}

async function ensureMessaging(): Promise<Messaging | null> {
  if (!isConfigured) return null;
  if (!(await isSupported())) return null;
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
    const registerKey = `${userId}:${employeeId || ''}`;
    if (registerInFlight && lastRegisterKey === registerKey) {
      return registerInFlight;
    }
    lastRegisterKey = registerKey;
    registerInFlight = (async () => {
      try {
        const messaging = await ensureMessaging();
        if (!messaging) return null;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return null;

        // Narrow scope so FCM SW never becomes the page controller for `/`
        // (origin-wide control + leftover caches from other local apps breaks lazy routes).
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: FIREBASE_MESSAGING_SW_SCOPE,
        });
        await navigator.serviceWorker.ready;

        const token = await getToken(messaging, buildGetTokenOptions(registration));
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
          if (!warnedInvalidVapid) {
            warnedInvalidVapid = true;
            console.warn('Push notifications disabled: invalid VAPID key configuration.');
          }
          return null;
        }
        if (!warnedRegistrationFailure) {
          warnedRegistrationFailure = true;
          console.warn('Push registration skipped:', error);
        }
        return null;
      } finally {
        registerInFlight = null;
      }
    })();
    return registerInFlight;
  },

  async disableCurrentToken(userId: string): Promise<void> {
    try {
      const messaging = await ensureMessaging();
      if (!messaging || !userId) return;
      const registration = await navigator.serviceWorker.getRegistration(FIREBASE_MESSAGING_SW_SCOPE);
      const token = registration
        ? await getToken(messaging, buildGetTokenOptions(registration))
        : await getToken(messaging, resolvedVapidKey ? { vapidKey: resolvedVapidKey } : {});
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
