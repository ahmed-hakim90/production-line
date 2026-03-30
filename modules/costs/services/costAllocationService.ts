import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  where,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { CostAllocation } from '../../../types';

const COLLECTION = 'cost_allocations';

export const costAllocationService = {
  async getAll(): Promise<CostAllocation[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostAllocation));
    } catch (error) {
      console.error('costAllocationService.getAll error:', error);
      throw error;
    }
  },

  async getByCostCenter(costCenterId: string): Promise<CostAllocation[]> {
    if (!isConfigured) return [];
    try {
      const q = tenantQuery(db, COLLECTION, where('costCenterId', '==', costCenterId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostAllocation));
    } catch (error) {
      console.error('costAllocationService.getByCostCenter error:', error);
      throw error;
    }
  },

  async create(data: Omit<CostAllocation, 'id'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const totalPct = data.allocations.reduce((s, a) => s + a.percentage, 0);
      if (totalPct > 100) throw new Error('Total allocation exceeds 100%');
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        tenantId: getCurrentTenantId(),
      });
      return ref.id;
    } catch (error) {
      console.error('costAllocationService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<CostAllocation>): Promise<void> {
    if (!isConfigured) return;
    try {
      if (data.allocations) {
        const totalPct = data.allocations.reduce((s, a) => s + a.percentage, 0);
        if (totalPct > 100) throw new Error('Total allocation exceeds 100%');
      }
      const { id: _id, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('costAllocationService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('costAllocationService.delete error:', error);
      throw error;
    }
  },
};
