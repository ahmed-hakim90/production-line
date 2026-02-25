import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { CostCenterValue } from '../../../types';

const COLLECTION = 'cost_center_values';

export const costCenterValueService = {
  async getAll(): Promise<CostCenterValue[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenterValue));
    } catch (error) {
      console.error('costCenterValueService.getAll error:', error);
      throw error;
    }
  },

  async getByCostCenter(costCenterId: string): Promise<CostCenterValue[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('costCenterId', '==', costCenterId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenterValue));
    } catch (error) {
      console.error('costCenterValueService.getByCostCenter error:', error);
      throw error;
    }
  },

  async create(data: Omit<CostCenterValue, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), data);
      return ref.id;
    } catch (error) {
      console.error('costCenterValueService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<CostCenterValue>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('costCenterValueService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('costCenterValueService.delete error:', error);
      throw error;
    }
  },
};
