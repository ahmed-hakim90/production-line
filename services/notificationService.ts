import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { AppNotification } from '../types';

const COLLECTION = 'notifications';

function sortByCreatedAtDesc(a: AppNotification, b: AppNotification): number {
  const getTime = (v: any) => {
    if (!v) return 0;
    if (v.toDate) return v.toDate().getTime();
    if (v.seconds) return v.seconds * 1000;
    return new Date(v).getTime();
  };
  return getTime(b.createdAt) - getTime(a.createdAt);
}

export const notificationService = {
  async getAll(): Promise<AppNotification[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      results.sort(sortByCreatedAtDesc);
      return results;
    } catch (error) {
      console.error('notificationService.getAll error:', error);
      return [];
    }
  },

  async getByRecipient(recipientId: string): Promise<AppNotification[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('recipientId', '==', recipientId),
      );
      const snap = await getDocs(q);
      const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
      results.sort(sortByCreatedAtDesc);
      return results;
    } catch (error) {
      console.error('notificationService.getByRecipient error:', error);
      return [];
    }
  },

  async create(data: Omit<AppNotification, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('notificationService.create error:', error);
      throw error;
    }
  },

  async markAsRead(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, id), { isRead: true });
    } catch (error) {
      console.error('notificationService.markAsRead error:', error);
    }
  },

  async markAllAsRead(recipientId: string): Promise<void> {
    if (!isConfigured) return;
    try {
      const q = query(
        collection(db, COLLECTION),
        where('recipientId', '==', recipientId),
        where('isRead', '==', false),
      );
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { isRead: true }));
      await batch.commit();
    } catch (error) {
      console.error('notificationService.markAllAsRead error:', error);
    }
  },

  subscribeToRecipient(recipientId: string, callback: (notifications: AppNotification[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = query(
      collection(db, COLLECTION),
      where('recipientId', '==', recipientId),
    );
    return onSnapshot(
      q,
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        results.sort(sortByCreatedAtDesc);
        callback(results);
      },
      (error) => {
        console.error('notificationService.subscribeToRecipient error:', error);
        callback([]);
      },
    );
  },

  subscribeAll(callback: (notifications: AppNotification[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(
      collection(db, COLLECTION),
      (snap) => {
        const results = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppNotification));
        results.sort(sortByCreatedAtDesc);
        callback(results);
      },
      (error) => {
        console.error('notificationService.subscribeAll error:', error);
        callback([]);
      },
    );
  },
};
