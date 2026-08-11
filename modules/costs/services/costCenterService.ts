import {
  doc,
  getDocs,
  getDoc,
} from 'firebase/firestore';
import { db, isConfigured, mutateAccountingCallable } from '../../auth/services/firebase';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { CostCenter } from '../../../types';

const COLLECTION = 'cost_centers';

export const costCenterService = {
  async getAll(): Promise<CostCenter[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
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
      const result = await mutateAccountingCallable({
        operation: 'upsert_production_cost_center',
        ...data,
      });
      return String(result.id || '') || null;
    } catch (error) {
      console.error('costCenterService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<CostCenter>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      await mutateAccountingCallable({
        operation: 'upsert_production_cost_center',
        id,
        ...fields,
      });
    } catch (error) {
      console.error('costCenterService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await mutateAccountingCallable({
        operation: 'deactivate_production_cost_center',
        id,
      });
    } catch (error) {
      console.error('costCenterService.delete error:', error);
      throw error;
    }
  },
};
