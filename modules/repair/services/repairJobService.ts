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
import type { RepairJob, RepairJobProduct, RepairJobStatus, RepairPartUsage, RepairStatusHistoryItem } from '../types';
import { repairReceiptService } from './repairReceiptService';
import { sparePartsService } from './sparePartsService';

const nowIso = () => new Date().toISOString();
const withDefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
const makeItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeJob = (job: RepairJob): RepairJob => {
  const existingProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const normalizedProducts: RepairJobProduct[] = existingProducts.length > 0
    ? existingProducts.map((item, idx) => ({
        ...item,
        itemId: String(item?.itemId || `item-${idx + 1}`),
      }))
    : [{
        itemId: 'item-1',
        productId: job.productId,
        productName: String(job.productName || job.deviceBrand || 'منتج'),
        deviceType: job.deviceType,
        deviceBrand: job.deviceBrand,
        deviceModel: job.deviceModel,
        diagnosis: job.problemDescription || '',
        estimatedCost: Number(job.estimatedCost || 0),
        finalCost: Number(job.finalCost || 0),
        inWarranty: (job.warranty || 'none') !== 'none',
      }];
  const lead = normalizedProducts[0];
  return {
    ...job,
    jobProducts: normalizedProducts,
    productId: lead?.productId || job.productId,
    productName: lead?.productName || job.productName,
    deviceType: lead?.deviceType || job.deviceType,
    deviceBrand: lead?.deviceBrand || job.deviceBrand,
    deviceModel: lead?.deviceModel || job.deviceModel,
    problemDescription: job.problemDescription || lead?.diagnosis || '',
    estimatedCost: Number(job.estimatedCost || normalizedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)),
    finalCost: Number(job.finalCostOverride ?? job.finalCost ?? normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0)),
  };
};

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
    return snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob));
  },

  async listAllBranches(): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob));
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
      (snap) => cb(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob))),
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
          branchRows.set(branchId, snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)));
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
      (snap) => cb(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob))),
      (error) => {
        console.error('repairJobService.subscribeAll listener error:', error);
      },
    );
  },

  async getById(id: string): Promise<RepairJob | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, REPAIR_JOBS_COLLECTION, id));
    return snap.exists() ? normalizeJob({ id: snap.id, ...snap.data() } as RepairJob) : null;
  },

  async create(input: NewRepairJobInput): Promise<RepairJobCreateResult> {
    if (!isConfigured) return { id: null, usedFallbackReceipt: false };
    const receiptResult = input.receiptNo
      ? { receiptNo: input.receiptNo, usedFallback: false }
      : await repairReceiptService.getNextReceipt();
    const at = nowIso();
    const tenantId = getCurrentTenantId();
    const history: RepairStatusHistoryItem[] = [withDefined({
      status: input.status,
      at,
      technicianId: input.technicianId,
    }) as RepairStatusHistoryItem];

    const incomingProducts = Array.isArray(input.jobProducts) ? input.jobProducts : [];
    const normalizedProducts: RepairJobProduct[] = incomingProducts.length > 0
      ? incomingProducts.map((item, idx) => ({
          ...item,
          itemId: String(item?.itemId || `item-${idx + 1}`),
        }))
      : [{
          itemId: makeItemId(),
          productId: input.productId,
          productName: String(input.productName || input.deviceBrand || 'منتج'),
          deviceType: input.deviceType,
          deviceBrand: input.deviceBrand,
          deviceModel: input.deviceModel,
          diagnosis: input.problemDescription || '',
          estimatedCost: Number(input.estimatedCost || 0),
          finalCost: Number(input.finalCost || 0),
          inWarranty: (input.warranty || 'none') !== 'none',
        }];
    const lead = normalizedProducts[0];
    const ref = await addDoc(collection(db, REPAIR_JOBS_COLLECTION), withDefined({
      ...withDefined(input),
      jobProducts: normalizedProducts,
      productId: lead?.productId || input.productId,
      productName: lead?.productName || input.productName,
      deviceType: lead?.deviceType || input.deviceType,
      deviceBrand: lead?.deviceBrand || input.deviceBrand,
      deviceModel: lead?.deviceModel || input.deviceModel,
      problemDescription: input.problemDescription || lead?.diagnosis || '',
      estimatedCost: Number(input.estimatedCost || normalizedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)),
      finalCost: Number(input.finalCostOverride ?? input.finalCost ?? normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0)),
      tenantId,
      receiptNo: receiptResult.receiptNo,
      createdAt: at,
      updatedAt: at,
      statusHistory: history,
      isClosed: false,
    }));
    return { id: ref.id, usedFallbackReceipt: receiptResult.usedFallback };
  },

  async update(id: string, patch: Partial<RepairJob>): Promise<void> {
    if (!isConfigured) return;
    const nextPatch: Partial<RepairJob> = { ...patch };
    if (Array.isArray(nextPatch.jobProducts) && nextPatch.jobProducts.length > 0) {
      const normalizedProducts = nextPatch.jobProducts.map((item, idx) => ({
        ...item,
        itemId: String(item?.itemId || `item-${idx + 1}`),
      }));
      const lead = normalizedProducts[0];
      nextPatch.jobProducts = normalizedProducts;
      nextPatch.productId = lead?.productId || nextPatch.productId;
      nextPatch.productName = lead?.productName || nextPatch.productName;
      nextPatch.deviceType = lead?.deviceType || nextPatch.deviceType;
      nextPatch.deviceBrand = lead?.deviceBrand || nextPatch.deviceBrand;
      nextPatch.deviceModel = lead?.deviceModel || nextPatch.deviceModel;
      if (!nextPatch.problemDescription) {
        nextPatch.problemDescription = String(lead?.diagnosis || '');
      }
      const productsTotal = normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0);
      nextPatch.finalCost = Number(nextPatch.finalCostOverride ?? nextPatch.finalCost ?? productsTotal);
    }
    await updateDoc(doc(db, REPAIR_JOBS_COLLECTION, id), withDefined({
      ...nextPatch,
      updatedAt: nowIso(),
    } as Record<string, unknown>));
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
      history.push(withDefined({
        status: input.status,
        at,
        technicianId: input.technicianId,
        reason: input.reason,
      }) as RepairStatusHistoryItem);

      tx.update(ref, {
        status: input.status,
        statusHistory: history,
        updatedAt: at,
        technicianId: input.technicianId ?? job.technicianId ?? '',
        ...(input.status === 'delivered'
          ? {
              deliveredAt: at,
              isClosed: true,
              finalCost: Number(input.finalCost ?? job.finalCost ?? 0),
              warranty: input.warranty ?? job.warranty ?? 'none',
            }
          : {}),
        ...(input.status === 'unrepairable' ? { notes: input.reason || job.notes || '' } : {}),
      });
    });
  },

  async createLinkedReopenJob(input: {
    sourceJobId: string;
    selectedProductItemIds?: string[];
    createdById?: string;
    reverseOldTreasuryEntry?: boolean;
  }): Promise<RepairJobCreateResult> {
    const source = await this.getById(input.sourceJobId);
    if (!source) throw new Error('طلب الصيانة الأصلي غير موجود.');
    const selectedIds = new Set((input.selectedProductItemIds || []).filter(Boolean));
    const sourceProducts = Array.isArray(source.jobProducts) ? source.jobProducts : [];
    const carriedProducts = (selectedIds.size > 0
      ? sourceProducts.filter((item) => selectedIds.has(String(item.itemId || '')))
      : sourceProducts
    ).map((item, idx) => ({
      ...item,
      itemId: `item-${idx + 1}-${Date.now()}`,
      diagnosis: '',
      finalCost: 0,
      estimatedCost: Number(item.estimatedCost || 0),
      inWarranty: Boolean(item.inWarranty),
    }));
    const lead = carriedProducts[0];
    const createResult = await this.create({
      branchId: source.branchId,
      productId: lead?.productId || source.productId,
      productName: lead?.productName || source.productName,
      technicianId: '',
      customerName: source.customerName,
      customerPhone: source.customerPhone,
      customerAddress: source.customerAddress || '',
      deviceType: lead?.deviceType || source.deviceType,
      deviceBrand: lead?.deviceBrand || source.deviceBrand,
      deviceModel: lead?.deviceModel || source.deviceModel,
      deviceColor: source.deviceColor || '',
      devicePassword: source.devicePassword || '',
      problemDescription: '',
      accessories: source.accessories || '',
      status: 'received',
      warranty: 'none',
      notes: `إعادة إصلاح مرتبطة بالطلب #${source.receiptNo}`,
      partsUsed: [],
      estimatedCost: carriedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0),
      finalCost: 0,
      isServiceOnly: Boolean(source.isServiceOnly),
      serviceOnlyCost: 0,
      jobProducts: carriedProducts,
      parentJobId: source.id,
      reopenedFromJobId: source.id,
      isClosed: false,
    });
    await this.update(input.sourceJobId, {
      isClosed: true,
      notes: [source.notes, `تم إنشاء إعادة إصلاح جديدة مرتبطة.`].filter(Boolean).join('\n'),
    });
    return createResult;
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
    return snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob));
  },
};
