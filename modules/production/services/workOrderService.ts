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
  deleteField,
  onSnapshot,
  Unsubscribe,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { WorkOrder } from '../../../types';

const COLLECTION = 'work_orders';
const MAX_PAGE_SIZE = 100;

export type WorkOrderCursor = QueryDocumentSnapshot | null;
export interface WorkOrderPagedParams {
  limit?: number;
  cursor?: WorkOrderCursor;
  status?: WorkOrder['status'];
  lineId?: string;
  productId?: string;
  supervisorId?: string;
}
export interface WorkOrderPageResult {
  items: WorkOrder[];
  nextCursor: WorkOrderCursor;
  hasMore: boolean;
}

export const workOrderService = {
  async listPaged(params: WorkOrderPagedParams = {}): Promise<WorkOrderPageResult> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params.limit || 25), MAX_PAGE_SIZE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params.status) constraints.unshift(where('status', '==', params.status));
    if (params.lineId) constraints.unshift(where('lineId', '==', params.lineId));
    if (params.productId) constraints.unshift(where('productId', '==', params.productId));
    if (params.supervisorId) constraints.unshift(where('supervisorId', '==', params.supervisorId));
    if (params.cursor) constraints.push(startAfter(params.cursor));
    const q = query(collection(db, COLLECTION), ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
  },

  async getAll(): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const rows: WorkOrder[] = [];
      let cursor: WorkOrderCursor = null;
      const maxPages = 10;
      let truncated = false;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await this.listPaged({ limit: MAX_PAGE_SIZE, cursor });
        rows.push(...res.items);
        if (!res.hasMore || !res.nextCursor) break;
        if (page === maxPages - 1 && res.hasMore) truncated = true;
        cursor = res.nextCursor;
      }
      if (truncated) {
        console.warn('workOrderService.getAll truncated at safety cap. Use listPaged in consuming screens.');
      }
      return rows;
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

  async clearQualityData(id: string): Promise<void> {
    if (!isConfigured) return;
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        qualitySummary: deleteField(),
        qualityStatus: deleteField(),
        qualityReportCode: deleteField(),
        qualityApprovedBy: deleteField(),
        qualityApprovedAt: deleteField(),
      });
    } catch (error) {
      console.error('workOrderService.clearQualityData error:', error);
      throw error;
    }
  },

  async updateCompletionFromScans(
    id: string,
    payload: Pick<
      WorkOrder,
      'actualWorkersCount' | 'actualProducedFromScans' | 'scanSummary' | 'scanSessionClosedAt' | 'completedAt' | 'status'
    >,
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
      const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(1));
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
