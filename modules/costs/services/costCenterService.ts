import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { CostCenter } from '../../../types';

const COLLECTION = 'cost_centers';

export const costCenterService = {
  async getAll(): Promise<CostCenter[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenter));
    } catch (error) {
      console.error('costCenterService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<CostCenter | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as CostCenter;
    } catch (error) {
      console.error('costCenterService.getById error:', error);
      throw error;
    }
  },

  async create(data: Omit<CostCenter, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('costCenterService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<CostCenter>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('costCenterService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('costCenterService.delete error:', error);
      throw error;
    }
  },
};
