/**
 * Production Line Service — CRUD for "production_lines" collection
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
import { FirestoreProductionLine } from '../types';

const COLLECTION = 'production_lines';

export const lineService = {
  async getAll(): Promise<FirestoreProductionLine[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as FirestoreProductionLine)
      );
    } catch (error) {
      console.error('lineService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<FirestoreProductionLine | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as FirestoreProductionLine;
    } catch (error) {
      console.error('lineService.getById error:', error);
      throw error;
    }
  },

  async create(
    data: Omit<FirestoreProductionLine, 'id'>
  ): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), data);
      return ref.id;
    } catch (error) {
      console.error('lineService.create error:', error);
      throw error;
    }
  },

  async update(
    id: string,
    data: Partial<FirestoreProductionLine>
  ): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('lineService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('lineService.delete error:', error);
      throw error;
    }
  },
};
