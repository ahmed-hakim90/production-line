import {
  collection,
  doc,
  getDocs,
  getDoc,
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
  writeBatch,
  QueryDocumentSnapshot,
  documentId,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type { WorkOrder } from '../../../types';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { buildSearchPrefixes } from '@/lib/firestoreSearch';

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
    const constraints: any[] = [orderBy('createdAt', 'desc'), orderBy(documentId()), limit(pageSize + 1)];
    if (params.status) constraints.unshift(where('status', '==', params.status));
    if (params.lineId) constraints.unshift(where('lineId', '==', params.lineId));
    if (params.productId) constraints.unshift(where('productId', '==', params.productId));
    if (params.supervisorId) constraints.unshift(where('supervisorId', '==', params.supervisorId));
    if (params.cursor) constraints.push(startAfter(params.cursor));
    const q = tenantQuery(db, COLLECTION, ...constraints);
    const snap = await getDocs(q);
    const hasMore = snap.docs.length > pageSize;
    const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
    const items = docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    const nextCursor = docs.length > 0 ? docs[docs.length - 1] : null;
    return { items, nextCursor, hasMore };
  },

  async getAll(): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const rows: WorkOrder[] = [];
      let cursor: WorkOrderCursor = null;
      const maxPages = 10;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await this.listPaged({ limit: MAX_PAGE_SIZE, cursor });
        rows.push(...res.items);
        if (!res.hasMore || !res.nextCursor) break;
        cursor = res.nextCursor;
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
      const hourlySlots = await this.getHourlySlots(id);
      return { id: snap.id, ...snap.data(), hourlySlots } as WorkOrder;
    } catch (error) {
      console.error('workOrderService.getById error:', error);
      throw error;
    }
  },

  async getByLine(lineId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      const q = tenantQuery(db, COLLECTION, where('lineId', '==', lineId));
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
      const q = tenantQuery(
        db,
        COLLECTION,
        where('lineId', '==', lineId),
        where('status', 'in', ['pending', 'in_progress', 'paused']),
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
      const q = tenantQuery(db, COLLECTION, where('planId', '==', planId));
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
      const q = tenantQuery(db, COLLECTION, where('supervisorId', '==', supervisorId));
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
      const q = tenantQuery(
        db,
        COLLECTION,
        where('lineId', '==', lineId),
        where('productId', '==', productId),
        where('status', 'in', ['pending', 'in_progress', 'paused']),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
    } catch (error) {
      console.error('workOrderService.getActiveByLineAndProduct error:', error);
      throw error;
    }
  },

  /** Open work orders for a product on any line (product may move between lines). */
  async getActiveByProduct(productId: string): Promise<WorkOrder[]> {
    if (!isConfigured) return [];
    try {
      // Prefer product-only query (indexed) then filter open statuses client-side —
      // avoids requiring a tenantId+productId+status composite index.
      const q = tenantQuery(db, COLLECTION, where('productId', '==', productId));
      const snap = await getDocs(q);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as WorkOrder))
        .filter((wo) => wo.status === 'pending' || wo.status === 'in_progress' || wo.status === 'paused');
    } catch (error) {
      console.error('workOrderService.getActiveByProduct error:', error);
      throw error;
    }
  },

  async create(data: Omit<WorkOrder, 'id' | 'createdAt'>): Promise<string | null> {
    if (!isConfigured) return null;
    try {
      const { hourlySlots = [], ...workOrderData } = data;
      const ref = doc(collection(db, COLLECTION));
      const batch = writeBatch(db);
      batch.set(ref, {
        ...workOrderData,
        tenantId: getCurrentTenantId(),
        hourlyScheduleVersion: hourlySlots.length ? 1 : null,
        hourlyScheduleUpdatedAt: hourlySlots.length ? serverTimestamp() : null,
        searchPrefixes: buildSearchPrefixes([
          data.workOrderNumber,
          (data as WorkOrder & { productCode?: string }).productCode,
          (data as WorkOrder & { productName?: string }).productName,
          (data as WorkOrder & { lineName?: string }).lineName,
          (data as WorkOrder & { supervisorName?: string }).supervisorName,
        ]),
        createdAt: serverTimestamp(),
      });
      hourlySlots.forEach((slot) => {
        batch.set(doc(db, COLLECTION, ref.id, 'hourly_slots', slot.id), {
          ...slot,
          tenantId: getCurrentTenantId(),
          workOrderId: ref.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      });
      await batch.commit();
      return ref.id;
    } catch (error) {
      console.error('workOrderService.create error:', error);
      throw error;
    }
  },

  async update(id: string, data: Partial<WorkOrder>): Promise<void> {
    if (!isConfigured) return;
    try {
      const { id: _id, createdAt: _ts, hourlySlots, ...fields } = data as any;
      const searchableChanged = ['workOrderNumber', 'productCode', 'productName', 'lineName', 'supervisorName']
        .some((field) => field in fields);
      if (searchableChanged) {
        const current = await getDoc(doc(db, COLLECTION, id));
        const merged = { ...(current.data() || {}), ...fields };
        fields.searchPrefixes = buildSearchPrefixes([
          merged.workOrderNumber,
          merged.productCode,
          merged.productName,
          merged.lineName,
          merged.supervisorName,
        ]);
      }
      await updateDoc(doc(db, COLLECTION, id), fields);
      if (Array.isArray(hourlySlots)) await this.replacePlannedHourlySlots(id, hourlySlots);
    } catch (error) {
      console.error('workOrderService.update error:', error);
      throw error;
    }
  },

  async getHourlySlots(workOrderId: string): Promise<WorkOrder['hourlySlots']> {
    if (!isConfigured || !workOrderId) return [];
    const snap = await getDocs(collection(db, COLLECTION, workOrderId, 'hourly_slots'));
    return snap.docs
      .map((row) => ({ id: row.id, ...row.data() } as NonNullable<WorkOrder['hourlySlots']>[number]))
      .sort((a, b) => `${a.date}_${a.startTime}`.localeCompare(`${b.date}_${b.startTime}`));
  },

  async replacePlannedHourlySlots(workOrderId: string, slots: NonNullable<WorkOrder['hourlySlots']>): Promise<void> {
    if (!isConfigured || !workOrderId) return;
    const slotCollection = collection(db, COLLECTION, workOrderId, 'hourly_slots');
    const current = await getDocs(slotCollection);
    if (current.docs.some((row) => row.data().status !== 'planned')) return;
    const batch = writeBatch(db);
    current.docs.forEach((row) => batch.delete(row.ref));
    slots.forEach((slot) => batch.set(doc(slotCollection, slot.id), {
      ...slot,
      tenantId: getCurrentTenantId(),
      workOrderId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }));
    batch.update(doc(db, COLLECTION, workOrderId), {
      hourlyScheduleVersion: 1,
      hourlyScheduleUpdatedAt: serverTimestamp(),
    });
    await batch.commit();
  },

  /** Status change with history stamp — prefer usecase `updateWorkOrderStatus`. */
  async updateStatus(id: string, status: WorkOrder['status']): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status,
      updatedAt: serverTimestamp(),
      [`statusHistory.${status}`]: serverTimestamp(),
    });
  },

  /** Reopen a completed work order for correction — prefer usecase `reopenCompletedWorkOrder`. */
  async reopenFromCompleted(id: string): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'in_progress',
      updatedAt: serverTimestamp(),
      completedAt: deleteField(),
      scanSessionClosedAt: deleteField(),
      reopenedFromCompletedAt: serverTimestamp(),
      'statusHistory.in_progress': serverTimestamp(),
    });
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
      const q = tenantQuery(db, COLLECTION, orderBy('createdAt', 'desc'), limit(1));
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
    return onSnapshot(tenantQuery(db, COLLECTION), (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder)));
    });
  },
};
