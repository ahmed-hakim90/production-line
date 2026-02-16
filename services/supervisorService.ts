/**
 * Supervisor Service — CRUD for "supervisors" collection
 */
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import { FirestoreSupervisor } from '../types';

const COLLECTION = 'supervisors';

export const supervisorService = {
  async getAll(): Promise<FirestoreSupervisor[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as FirestoreSupervisor)
      );
    } catch (error) {
      console.error('supervisorService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreSupervisor | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreSupervisor;
    } catch (error) {
      console.error('supervisorService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<FirestoreSupervisor, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), data);
      return ref.id;
    } catch (error) {
      console.error('supervisorService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<FirestoreSupervisor>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('supervisorService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('supervisorService.delete error:', error);
      throw error;
    }
  },
};
