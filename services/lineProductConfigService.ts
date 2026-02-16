/**
 * Line–Product Config Service — CRUD for "line_product_config" collection
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
import { LineProductConfig } from '../types';

const COLLECTION = 'line_product_config';

export const lineProductConfigService = {
  async getAll(): Promise<LineProductConfig[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as LineProductConfig)
      );
    } catch (error) {
      console.error('lineProductConfigService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<LineProductConfig | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as LineProductConfig;
    } catch (error) {
      console.error('lineProductConfigService.getById error:', error);
      throw error;
    }
  },

  async create(
    data: Omit<LineProductConfig, 'id'>
  ): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), data);
      return ref.id;
    } catch (error) {
      console.error('lineProductConfigService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<LineProductConfig>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('lineProductConfigService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('lineProductConfigService.delete error:', error);
      throw error;
    }
  },
};
