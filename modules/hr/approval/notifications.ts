import {
  addDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, isConfigured } from '@/services/firebase';
import { hrNotificationsRef } from '../collections';
import type { HRNotification } from '../types';

export const hrNotificationService = {
  async create(n: Omit<HRNotification, 'id' | 'read' | 'createdAt'>): Promise<void> {
    if (!isConfigured) return;
    await addDoc(hrNotificationsRef(), { ...n, read: false, createdAt: serverTimestamp() });
  },

  subscribeUnread(userId: string, cb: (items: HRNotification[]) => void): () => void {
    if (!isConfigured || !userId) return () => {};
    const q = query(
      hrNotificationsRef(),
      where('recipientUserId', '==', userId),
      where('read', '==', false),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HRNotification)));
    });
  },

  async markRead(id: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, 'hr_notifications', id), { read: true });
  },

  async markAllRead(userId: string): Promise<void> {
    if (!isConfigured || !userId) return;
    const q = query(hrNotificationsRef(), where('recipientUserId', '==', userId), where('read', '==', false));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
    await batch.commit();
  },
};
