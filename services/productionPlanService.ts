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
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import { ProductionPlan } from '../types';

const COLLECTION = 'production_plans';

export const productionPlanService = {
  async getAll(): Promise<ProductionPlan[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionPlan)
      );
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
        collection(db, COLLECTION),
        where('lineId', '==', lineId),
        where('status', 'in', ['planned', 'in_progress'])
      );
      const snap = await getDocs(q);
      return snap.docs.map(
        (d) => ({ id: d.id, ...d.data() } as ProductionPlan)
      );
    } catch (error) {
      console.error('productionPlanService.getActiveByLine error:', error);
      throw error;
    }
  },

  async create(
    data: Omit<ProductionPlan, 'id' | 'createdAt'>
  ): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
      });
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
};
