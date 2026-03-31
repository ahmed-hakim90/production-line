import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_JOBS_COLLECTION } from '../collections';
import type { RepairJob, RepairJobStatus, RepairPartUsage, RepairStatusHistoryItem } from '../types';
import { repairReceiptService } from './repairReceiptService';
import { sparePartsService } from './sparePartsService';

const nowIso = () => new Date().toISOString();

type NewRepairJobInput = Omit<
  RepairJob,
  'id' | 'tenantId' | 'receiptNo' | 'createdAt' | 'updatedAt' | 'statusHistory'
> & { receiptNo?: string };

export type RepairJobCreateResult = {
  id: string | null;
  usedFallbackReceipt: boolean;
};

export const repairJobService = {
  async listByBranch(branchId: string): Promise<RepairJob[]> {
    if (!isConfigured || !branchId) return [];
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob));
  },

  async listAllBranches(): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob));
  },

  subscribeByBranch(branchId: string, cb: (rows: RepairJob[]) => void): Unsubscribe {
    if (!isConfigured || !branchId) return () => {};
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob))),
      (error) => {
        console.error('repairJobService.subscribeByBranch listener error:', error);
      },
    );
  },

  subscribeByBranches(branchIds: string[], cb: (rows: RepairJob[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const normalized = Array.from(new Set(branchIds.filter((id) => typeof id === 'string' && id.trim().length > 0)));
    if (normalized.length === 0) {
      cb([]);
      return () => {};
    }
    const branchRows = new Map<string, RepairJob[]>();
    const emit = () => {
      const merged = Array.from(branchRows.values()).flat();
      const unique = new Map<string, RepairJob>();
      merged.forEach((row) => {
        if (!row.id) return;
        unique.set(row.id, row);
      });
      const sorted = Array.from(unique.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      cb(sorted);
    };
    const unsubs = normalized.map((branchId) => {
      const q = tenantQuery(
        db,
        REPAIR_JOBS_COLLECTION,
        where('branchId', '==', branchId),
        orderBy('createdAt', 'desc'),
      );
      return onSnapshot(
        q,
        (snap) => {
          branchRows.set(branchId, snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob)));
          emit();
        },
        (error) => {
          console.error('repairJobService.subscribeByBranches listener error:', error);
        },
      );
    });
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  },

  subscribeAll(cb: (rows: RepairJob[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob))),
      (error) => {
        console.error('repairJobService.subscribeAll listener error:', error);
      },
    );
  },

  async getById(id: string): Promise<RepairJob | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, REPAIR_JOBS_COLLECTION, id));
    return snap.exists() ? ({ id: snap.id, ...snap.data() } as RepairJob) : null;
  },

  async create(input: NewRepairJobInput): Promise<RepairJobCreateResult> {
    if (!isConfigured) return { id: null, usedFallbackReceipt: false };
    const receiptResult = input.receiptNo
      ? { receiptNo: input.receiptNo, usedFallback: false }
      : await repairReceiptService.getNextReceipt();
    const at = nowIso();
    const tenantId = getCurrentTenantId();
    const history: RepairStatusHistoryItem[] = [{ status: input.status, at, technicianId: input.technicianId }];

    const ref = await addDoc(collection(db, REPAIR_JOBS_COLLECTION), {
      ...input,
      tenantId,
      receiptNo: receiptResult.receiptNo,
      createdAt: at,
      updatedAt: at,
      statusHistory: history,
    });
    return { id: ref.id, usedFallbackReceipt: receiptResult.usedFallback };
  },

  async update(id: string, patch: Partial<RepairJob>): Promise<void> {
    if (!isConfigured) return;
    await updateDoc(doc(db, REPAIR_JOBS_COLLECTION, id), {
      ...patch,
      updatedAt: nowIso(),
    } as Record<string, unknown>);
  },

  async assignTechnician(id: string, technicianId: string): Promise<void> {
    if (!isConfigured) return;
    await this.update(id, { technicianId });
  },

  async changeStatus(input: {
    jobId: string;
    status: RepairJobStatus;
    technicianId?: string;
    reason?: string;
    finalCost?: number;
    warranty?: RepairJob['warranty'];
  }): Promise<void> {
    if (!isConfigured) return;
    const ref = doc(db, REPAIR_JOBS_COLLECTION, input.jobId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('طلب الصيانة غير موجود.');
      const job = { id: snap.id, ...snap.data() } as RepairJob;
      const at = nowIso();
      const history = Array.isArray(job.statusHistory) ? [...job.statusHistory] : [];
      history.push({ status: input.status, at, technicianId: input.technicianId, reason: input.reason });

      tx.update(ref, {
        status: input.status,
        statusHistory: history,
        updatedAt: at,
        technicianId: input.technicianId ?? job.technicianId ?? '',
        ...(input.status === 'delivered'
          ? {
              deliveredAt: at,
              finalCost: Number(input.finalCost ?? job.finalCost ?? 0),
              warranty: input.warranty ?? job.warranty ?? 'none',
            }
          : {}),
        ...(input.status === 'unrepairable' ? { notes: input.reason || job.notes || '' } : {}),
      });
    });
  },

  async applyPartsUsage(input: {
    jobId: string;
    branchId: string;
    partsUsed: RepairPartUsage[];
    createdBy: string;
    notes?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    for (const part of input.partsUsed) {
      await sparePartsService.deductPart(
        input.branchId,
        part.partId,
        part.partName,
        Number(part.quantity || 0),
        input.createdBy,
        input.jobId,
      );
    }

    await this.update(input.jobId, {
      partsUsed: input.partsUsed,
      notes: input.notes,
    });
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    await deleteDoc(doc(db, REPAIR_JOBS_COLLECTION, id));
  },

  async listByTechnician(technicianId: string, branchId?: string): Promise<RepairJob[]> {
    if (!isConfigured || !technicianId) return [];
    const constraints = [where('technicianId', '==', technicianId)] as Parameters<typeof query>[1][];
    if (branchId) constraints.push(where('branchId', '==', branchId));
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, ...constraints, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as RepairJob));
  },
};
