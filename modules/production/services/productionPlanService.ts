import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { ProductionPlan } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { assertProductionProductId } from '../utils/assertProductionProductId';

const COLLECTION = 'production_plans';

export const productionPlanService = {
  async getAll(): Promise<ProductionPlan[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(tenantQuery(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionPlan));
    } catch (error) {
      console.error('productionPlanService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<ProductionPlan | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as ProductionPlan;
    } catch (error) {
      console.error('productionPlanService.getById error:', error);
      throw error;
    }
  },

  async getActiveByLine(lineId: string): Promise<ProductionPlan[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        tenantQuery(db, COLLECTION),
        where('lineId', '==', lineId),
        where('status', 'in', ['planned', 'in_progress', 'paused']),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionPlan));
    } catch (error) {
      console.error('productionPlanService.getActiveByLine error:', error);
      throw error;
    }
  },

  async getActiveByProduct(productId: string): Promise<ProductionPlan[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        tenantQuery(db, COLLECTION),
        where('productId', '==', productId),
        where('status', 'in', ['planned', 'in_progress', 'paused']),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProductionPlan));
    } catch (error) {
      console.error('productionPlanService.getActiveByProduct error:', error);
      throw error;
    }
  },

  async create(data: Omit<ProductionPlan, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      await assertProductionProductId(String(data.productId || ''));
      const { lineId, supervisorId, ...rest } = data;
      const payload: Record<string, unknown> = {
        ...rest,
        createdAt: serverTimestamp(),
        tenantId: getCurrentTenantId(),
      };
      const trimmedLineId = String(lineId || '').trim();
      if (trimmedLineId) payload.lineId = trimmedLineId;
      const trimmedSupervisorId = String(supervisorId || '').trim();
      if (trimmedSupervisorId) payload.supervisorId = trimmedSupervisorId;
      const ref = await addDoc(collection(db, COLLECTION), payload);
      return ref.id;
    } catch (error) {
      console.error('productionPlanService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<ProductionPlan>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      if (fields.productId !== undefined) {
        await assertProductionProductId(String(fields.productId || ''));
      }
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('productionPlanService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('productionPlanService.delete error:', error);
      throw error;
    }
  },

  async incrementProduced(id: string, quantityDelta: number, costDelta: number): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        producedQuantity: increment(quantityDelta),
        actualCost: increment(costDelta),
      });
    } catch (error) {
      console.error('productionPlanService.incrementProduced error:', error);
      throw error;
    }
  },

  async getActiveByLineAndProduct(lineId: string, productId: string): Promise<ProductionPlan[]> {
    if (!isConfigured) return [];
    try {
      // Product-scoped active plans; lineId kept for callers but no longer filters.
      void lineId;
      return this.getActiveByProduct(productId);
    } catch (error) {
      console.error('productionPlanService.getActiveByLineAndProduct error:', error);
      throw error;
    }
  },
};
