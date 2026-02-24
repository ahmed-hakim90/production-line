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
  orderBy,
  limit,
  serverTimestamp,
  increment,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from './firebase';
import type { WorkOrder } from '../types';

const COLLECTION = 'work_orders';

export const workOrderService = {
  async getAll(): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const snap = await getDocs(collection(db, COLLECTION));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getAll error:', error);
      throw error;
    }
  },

  async getById(id: string): Promise<WorkOrder | null> {
    if (!isConfigured) return null;
    try {
      const snap = await getDoc(doc(db, COLLECTION, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as WorkOrder;
    } catch (error) {
      console.error('workOrderService.getById error:', error);
      throw error;
    }
  },

  async getByLine(lineId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('lineId', '==', lineId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getByLine error:', error);
      throw error;
    }
  },

  async getActiveByLine(lineId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('lineId', '==', lineId),
        where('status', 'in', ['pending', 'in_progress']),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getActiveByLine error:', error);
      throw error;
    }
  },

  async getByPlan(planId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('planId', '==', planId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getByPlan error:', error);
      throw error;
    }
  },

  async getBySupervisor(supervisorId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = query(collection(db, COLLECTION), where('supervisorId', '==', supervisorId));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getBySupervisor error:', error);
      throw error;
    }
  },

  async getActiveByLineAndProduct(lineId: string, productId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = query(
        collection(db, COLLECTION),
        where('lineId', '==', lineId),
        where('productId', '==', productId),
        where('status', 'in', ['pending', 'in_progress']),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getActiveByLineAndProduct error:', error);
      throw error;
    }
  },

  async create(data: Omit<WorkOrder, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const ref = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: serverTimestamp(),
      });
      return ref.id;
    } catch (error) {
      console.error('workOrderService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<WorkOrder>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, ...fields } = data as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('workOrderService.update error:', error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await deleteDoc(doc(db, COLLECTION, id));
    } catch (error) {
      console.error('workOrderService.delete error:', error);
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
      console.error('workOrderService.incrementProduced error:', error);
      throw error;
    }
  },

  async updateCompletionFromScans(
    id: string,
    payload: Pick<WorkOrder, 'actualWorkersCount' | 'actualProducedFromScans' | 'scanSummary' | 'scanSessionClosedAt' | 'completedAt' | 'status'>
  ): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _createdAt, ...fields } = payload as any;
      await updateDoc(doc(db, COLLECTION, id), fields);
    } catch (error) {
      console.error('workOrderService.updateCompletionFromScans error:', error);
      throw error;
    }
  },

  async generateNextNumber(): Promise<string> {
    if (!isConfigured) return 'WO-0001';
    try {
      const year = new Date().getFullYear();
      const q = query(
        collection(db, COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      const snap = await getDocs(q);
      if (snap.empty) return `WO-${year}-0001`;
      const last = snap.docs[0].data() as WorkOrder;
      const lastNum = last.workOrderNumber;
      const parts = lastNum.split('-');
      const seq = parseInt(parts[parts.length - 1], 10) || 0;
      return `WO-${year}-${String(seq + 1).padStart(4, '0')}`;
    } catch {
      return `WO-${new Date().getFullYear()}-0001`;
    }
  },

  subscribeAll(callback: (orders: WorkOrder[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    return onSnapshot(collection(db, COLLECTION), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
    });
  },
};
