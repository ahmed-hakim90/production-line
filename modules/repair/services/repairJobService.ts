import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  getDoc,
  writeBatch,
  runTransaction,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { REPAIR_JOBS_COL } from '../collections';
import type { RepairJob, RepairJobStatus, RepairPartUsed, RepairStatusHistoryEntry } from '../types';
import { sparePartsService } from './sparePartsService';

const toIso = () => new Date().toISOString();

export const repairJobService = {
  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(
    data: Omit<RepairJob, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>,
    createdBy: string,
    createdByName: string,
  ): Promise<string> {
    if (!isConfigured) throw new Error('Firebase not configured');
    const now = toIso();
    const statusHistory: RepairStatusHistoryEntry[] = [
      { status: data.status, changedBy: createdBy, changedByName: createdByName, changedAt: now },
    ];
    const ref = await addDoc(collection(db, REPAIR_JOBS_COL), {
      ...data,
      partsUsed: data.partsUsed ?? [],
      statusHistory,
      createdAt: now,
      updatedAt: now,
      createdBy,
    });
    return ref.id;
  },

  // ─── Read ────────────────────────────────────────────────────────────────────

  async getById(id: string): Promise<RepairJob | null> {
    if (!isConfigured) return null;
    const snap = await getDoc(doc(db, REPAIR_JOBS_COL, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as RepairJob) : null;
  },

  async getByBranch(branchIds: string[]): Promise<RepairJob[]> {
    if (!isConfigured || branchIds.length === 0) return [];
    const q = query(
      collection(db, REPAIR_JOBS_COL),
      where('branchId', 'in', branchIds.slice(0, 10)),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob));
  },

  async getAll(): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const q = query(collection(db, REPAIR_JOBS_COL), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob));
  },

  // ─── Realtime subscriptions ─────────────────────────────────────────────────

  subscribe(
    branchIds: string[],
    callback: (jobs: RepairJob[]) => void,
  ): () => void {
    if (!isConfigured || branchIds.length === 0) return () => {};
    const q = query(
      collection(db, REPAIR_JOBS_COL),
      where('branchId', 'in', branchIds.slice(0, 10)),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob)));
    });
  },

  subscribeAll(callback: (jobs: RepairJob[]) => void): () => void {
    if (!isConfigured) return () => {};
    const q = query(collection(db, REPAIR_JOBS_COL), orderBy('createdAt', 'desc'));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob)));
    });
  },

  // ─── Update Status ──────────────────────────────────────────────────────────

  async updateStatus(params: {
    jobId: string;
    status: RepairJobStatus;
    changedBy: string;
    changedByName: string;
    notes?: string;
    finalCost?: number;
    warranty?: RepairJob['warranty'];
    paymentType?: RepairJob['paymentType'];
    unrepairableReason?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const now = toIso();
    const historyEntry: RepairStatusHistoryEntry = {
      status: params.status,
      changedBy: params.changedBy,
      changedByName: params.changedByName,
      changedAt: now,
      notes: params.notes,
    };

    const jobRef = doc(db, REPAIR_JOBS_COL, params.jobId);
    const snap = await getDoc(jobRef);
    if (!snap.exists()) throw new Error('Job not found');

    const existing = snap.data() as RepairJob;
    const updatedHistory = [...(existing.statusHistory ?? []), historyEntry];

    const update: Partial<RepairJob> = {
      status: params.status,
      statusHistory: updatedHistory,
      updatedAt: now,
    };

    if (params.status === 'delivered') {
      update.deliveredAt = now;
      if (params.finalCost !== undefined) update.finalCost = params.finalCost;
      if (params.warranty) update.warranty = params.warranty;
      if (params.paymentType) update.paymentType = params.paymentType;
    }

    if (params.status === 'unrepairable' && params.unrepairableReason) {
      update.unrepairableReason = params.unrepairableReason;
    }

    await updateDoc(jobRef, update as any);
  },

  // ─── Update Parts Used ──────────────────────────────────────────────────────

  async updatePartsUsed(params: {
    jobId: string;
    branchId: string;
    previousParts: RepairPartUsed[];
    newParts: RepairPartUsed[];
    updatedBy: string;
  }): Promise<void> {
    if (!isConfigured) return;

    // Calculate delta: what's added vs what's removed
    const previousMap = new Map(params.previousParts.map((p) => [p.partId, p.quantity]));
    const newMap = new Map(params.newParts.map((p) => [p.partId, p.quantity]));

    // Parts to deduct additionally (increased quantity or new parts)
    const toDeduct: RepairPartUsed[] = [];
    // Parts to add back (decreased quantity or removed parts)
    const toReturn: RepairPartUsed[] = [];

    for (const part of params.newParts) {
      const prev = previousMap.get(part.partId) ?? 0;
      const diff = part.quantity - prev;
      if (diff > 0) {
        toDeduct.push({ ...part, quantity: diff });
      } else if (diff < 0) {
        toReturn.push({ ...part, quantity: -diff });
      }
    }

    for (const part of params.previousParts) {
      if (!newMap.has(part.partId)) {
        toReturn.push(part);
      }
    }

    // Apply stock adjustments
    if (toDeduct.length > 0) {
      await sparePartsService.deductParts({
        branchId: params.branchId,
        parts: toDeduct,
        jobId: params.jobId,
        createdBy: params.updatedBy,
      });
    }

    for (const part of toReturn) {
      await sparePartsService.adjustStock({
        branchId: params.branchId,
        partId: part.partId,
        partName: part.partName,
        type: 'IN',
        quantity: part.quantity,
        jobId: params.jobId,
        notes: 'إعادة قطعة من طلب صيانة',
        createdBy: params.updatedBy,
      });
    }

    await updateDoc(doc(db, REPAIR_JOBS_COL, params.jobId), {
      partsUsed: params.newParts,
      updatedAt: toIso(),
    });
  },

  // ─── Update general fields ──────────────────────────────────────────────────

  async update(id: string, data: Partial<RepairJob>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, REPAIR_JOBS_COL, id), { ...data, updatedAt: toIso() });
  },

  // ─── Search (client-side filter helper) ─────────────────────────────────────

  filter(jobs: RepairJob[], query: string): RepairJob[] {
    if (!query.trim()) return jobs;
    const q = query.toLowerCase();
    return jobs.filter(
      (j) =>
        j.customerName.toLowerCase().includes(q) ||
        j.customerPhone.includes(q) ||
        j.receiptNo.toLowerCase().includes(q) ||
        j.deviceBrand.toLowerCase().includes(q) ||
        j.deviceModel.toLowerCase().includes(q),
    );
  },
};
