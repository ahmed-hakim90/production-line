import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { UserPresence } from '../types';

const COLLECTION = 'user_presence';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const IDLE_WINDOW_MS = 10 * 60 * 1000;

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function derivePresenceState(lastHeartbeatAt: any): 'online' | 'idle' | 'offline' {
  const diff = Date.now() - toMillis(lastHeartbeatAt);
  if (diff <= ONLINE_WINDOW_MS) return 'online';
  if (diff <= IDLE_WINDOW_MS) return 'idle';
  return 'offline';
}

export const presenceService = {
  async heartbeat(payload: {
    userId: string;
    employeeId?: string;
    userEmail?: string;
    displayName?: string;
    roleId?: string;
    currentRoute?: string;
    currentModule?: string;
  }): Promise<void> {
    if (!isConfigured || !payload.userId) return;
    const ref = doc(db, COLLECTION, payload.userId);
    await setDoc(ref, {
      userId: payload.userId,
      employeeId: payload.employeeId || '',
      userEmail: payload.userEmail || '',
      displayName: payload.displayName || '',
      roleId: payload.roleId || '',
      currentRoute: payload.currentRoute || '',
      currentModule: payload.currentModule || '',
      lastHeartbeatAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  },

  async setLastAction(userId: string, lastAction: string): Promise<void> {
    if (!isConfigured || !userId || !lastAction) return;
    const ref = doc(db, COLLECTION, userId);
    await setDoc(ref, {
      userId,
      lastAction,
      lastActionAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true }).catch(() => {});
  },

  async markOffline(userId: string): Promise<void> {
    if (!isConfigured || !userId) return;
    const ref = doc(db, COLLECTION, userId);
    await updateDoc(ref, {
      state: 'offline',
      updatedAt: serverTimestamp(),
    }).catch(() => {});
  },

  subscribeAll(callback: (rows: UserPresence[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(collection(db, COLLECTION), (snap) => {
      const rows = snap.docs.map((d) => {
        const data = d.data() as UserPresence;
        const state = derivePresenceState((data as any).lastHeartbeatAt);
        return { id: d.id, ...data, state } as UserPresence;
      });
      rows.sort((a, b) => toMillis((b as any).lastHeartbeatAt) - toMillis((a as any).lastHeartbeatAt));
      callback(rows);
    }, () => callback([]));
  },

  subscribeOnline(callback: (rows: UserPresence[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const threshold = new Date(Date.now() - IDLE_WINDOW_MS);
    const q = query(collection(db, COLLECTION), where('updatedAt', '>=', threshold));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => {
          const data = d.data() as UserPresence;
          const state = derivePresenceState((data as any).lastHeartbeatAt);
          return { id: d.id, ...data, state } as UserPresence;
        })
        .filter((row) => row.state !== 'offline')
        .sort((a, b) => toMillis((b as any).lastHeartbeatAt) - toMillis((a as any).lastHeartbeatAt));
      callback(rows);
    }, () => callback([]));
  },
};
