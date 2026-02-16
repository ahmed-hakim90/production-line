/**
 * Line Status Service — CRUD + real-time for "line_status" collection
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import { LineStatus } from '../types';

const COLLECTION = 'line_status';

export const lineStatusService = {
  async getAll(): Promise<LineStatus[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as LineStatus)
      );
    } catch (error) {
      console.error('lineStatusService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<LineStatus | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as LineStatus;
    } catch (error) {
      console.error('lineStatusService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<LineStatus, 'id' | 'updatedAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        updatedAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('lineStatusService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<LineStatus>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), {
        ...fields,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error('lineStatusService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('lineStatusService.delete error:', error);
      throw error;
    }
  },

  /**
   * Real-time listener for all line statuses.
   * Returns an unsubscribe function.
   */
  subscribeAll(onData: (statuses: LineStatus[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(collection(db, COLLECTION), (snap) => {
      const statuses = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as LineStatus)
      );
      onData(statuses);
    });
  },
};
