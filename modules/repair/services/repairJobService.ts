import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import {
  REPAIR_BRANCHES_COLLECTION,
  REPAIR_JOBS_COLLECTION,
  REPAIR_SERVICE_EVENTS_SUBCOLLECTION,
} from '../collections';
import { resolveAssignmentStatusPatch } from '../lib/repairAssignmentStatus';
import { isAssignableBranchTechnicianId } from '../lib/repairTechnicianAssignment';
import { appendRepairServiceEvent, appendRepairServiceEventTx } from './repairServiceEventService';
import { REPAIR_DOMAIN_EVENT_VERSION, resolveDomainEventForStatusChange } from '../utils/repairDomainEvents';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  buildRepairResolutionFields,
  mapLegacyRepairStatus,
  statusSetsAssignedAt,
  isTerminalFromSettings,
} from '../utils/repairWorkflowNormalize';
import type { RepairJob, RepairJobProduct, RepairJobStatus, RepairPartUsage, RepairStatusHistoryItem } from '../types';
import { repairReceiptService } from './repairReceiptService';
import { sparePartsService } from './sparePartsService';
import { repairSpareIssueService } from './repairSpareIssueService';
import { repairTreasuryService } from './repairTreasuryService';
import { repairSalesInvoiceService } from './repairSalesInvoiceService';
import { repairBranchService } from './repairBranchService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { resolveRepairSettings } from '../config/repairSettings';
import { stripRepairProductsToIntake, warrantyScopeFromProducts } from '../lib/repairJobIntake';
import { isFullManufacturerWarrantyJob } from '../lib/repairManufacturerWarranty';
import { resolveStatusRole } from '../lib/repairStatusAdvance';
import { repairCustomerOperationsService } from './repairCustomerOperationsService';
import { computeRepairJobCost, normalizePaymentStatus } from '../utils/repairBusinessLogic';
import { assertRepairStatusTransition } from '../utils/repairStatusTransitions';
import { deliverRepairJobAndCollectCallable } from '../../auth/services/firebase';

const nowIso = () => new Date().toISOString();
const isoUtcDay = (isoLike: string | undefined | null): string => String(isoLike || '').slice(0, 10);
/** Drop undefined at every nesting level — Firestore rejects undefined in arrays/objects. */
const withDefined = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => withDefined(item)) as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, withDefined(v)]),
    ) as T;
  }
  return value;
};
const makeItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeJob = (job: RepairJob): RepairJob => {
  const existingProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const normalizedProducts: RepairJobProduct[] = existingProducts.length > 0
    ? existingProducts.map((item, idx) => ({
        ...item,
        itemId: String(item?.itemId || `item-${idx + 1}`),
        quantity: Math.max(1, Math.round(Number(item?.quantity || 1))),
        accessoryIds: Array.isArray(item?.accessoryIds) ? item.accessoryIds.map(String) : undefined,
        serviceIds: Array.isArray(item?.serviceIds) ? item.serviceIds.map(String) : undefined,
        accessories: String(item?.accessories || (idx === 0 ? job.accessories || '' : '')),
      }))
    : [{
        itemId: 'item-1',
        productId: job.productId,
        productName: String(job.productName || job.deviceBrand || 'منتج'),
        quantity: 1,
        deviceType: job.deviceType,
        deviceBrand: job.deviceBrand,
        deviceModel: job.deviceModel,
        accessories: String(job.accessories || ''),
        diagnosis: job.problemDescription || '',
        estimatedCost: Number(job.estimatedCost || 0),
        finalCost: Number(job.finalCost || 0),
        inWarranty: false,
      }];
  const lead = normalizedProducts[0];
  const mappedStatus = mapLegacyRepairStatus(job.status);
  const statusHistory = Array.isArray(job.statusHistory)
    ? job.statusHistory.map((entry) => ({
        ...entry,
        status: mapLegacyRepairStatus(entry?.status),
      }))
    : job.statusHistory;
  const normalizedJob = {
    ...job,
    status: mappedStatus,
    statusHistory,
    jobProducts: normalizedProducts,
    productId: lead?.productId || job.productId,
    productName: lead?.productName || job.productName,
    deviceType: lead?.deviceType || job.deviceType,
    deviceBrand: lead?.deviceBrand || job.deviceBrand,
    deviceModel: lead?.deviceModel || job.deviceModel,
    deviceSerial: String(lead?.serialNo || job.deviceSerial || '').trim() || job.deviceSerial,
    problemDescription: job.problemDescription || lead?.diagnosis || '',
    estimatedCost: Number(job.estimatedCost || normalizedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)),
    finalCost: Number(job.finalCostOverride ?? job.finalCost ?? normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0)),
  };
  const cost = computeRepairJobCost(normalizedJob);
  return {
    ...normalizedJob,
    finalCost: cost.finalCost,
    paidAmount: normalizedJob.paidAmount,
    balanceDue: cost.balanceDue,
    paymentStatus: normalizePaymentStatus(normalizedJob.paymentStatus, cost.finalCost, normalizedJob.paidAmount),
  };
};

const sortRepairJobsNewest = (rows: RepairJob[]): RepairJob[] =>
  rows.slice().sort((a, b) =>
    String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
  );

/** Cap operational repair job lists — newest first via Firestore orderBy. */
export const REPAIR_JOB_LIST_LIMIT = 400;
/** Higher cap for analytics dashboards (still bounded for client memory). */
export const REPAIR_JOB_DASHBOARD_LIMIT = 2500;

function resolveRepairJobListLimit(requested?: number): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n <= 0) return REPAIR_JOB_LIST_LIMIT;
  return Math.min(Math.floor(n), REPAIR_JOB_DASHBOARD_LIMIT);
}

type NewRepairJobInput = Omit<
  RepairJob,
  'id' | 'tenantId' | 'receiptNo' | 'createdAt' | 'updatedAt' | 'statusHistory'
> & { receiptNo?: string; serviceEventActor?: { uid: string; name: string } };

export type RepairJobCreateResult = {
  id: string | null;
  usedFallbackReceipt: boolean;
};

export type RemoveRepairJobWithRollbackInput = {
  deletedBy: string;
  deletedByName?: string;
  cancelReason?: string;
};

export const repairJobService = {
  /** للواجهة بعد قراءة لقطة مباشرة — يطبّق توحيد الحالات القديمة */
  normalizeRead(job: RepairJob): RepairJob {
    return normalizeJob(job);
  },

  /** تسليم + تحصيل + قيد خزينة في معاملة خادم واحدة قابلة لإعادة المحاولة. */
  async deliverAndCollect(input: {
    jobId: string;
    warranty?: RepairJob['warranty'];
    actorName?: string;
  }): Promise<{ finalCost: number; collectedAmount: number; treasuryEntryCreated: boolean; deliveryAuthorizationNo?: string }> {
    if (!isConfigured) return { finalCost: 0, collectedAmount: 0, treasuryEntryCreated: false };
    const result = await deliverRepairJobAndCollectCallable({
      jobId: input.jobId,
      warranty: input.warranty,
    });
    // حجز القطع ليس جزءًا ماليًا؛ إطلاقه بعد نجاح المعاملة، وإعادة المحاولة آمنة.
    await sparePartsService.releaseAllActiveForJob(input.jobId, input.actorName || 'system');
    return {
      finalCost: Number(result.finalCost || 0),
      collectedAmount: Number(result.collectedAmount || 0),
      treasuryEntryCreated: Boolean(result.treasuryEntryCreated),
      deliveryAuthorizationNo: String(result.deliveryAuthorizationNo || '') || undefined,
    };
  },

  async listByBranch(branchId: string, options?: { limit?: number }): Promise<RepairJob[]> {
    if (!isConfigured || !branchId) return [];
    const lim = resolveRepairJobListLimit(options?.limit);
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
      limit(lim),
    );
    const snap = await getDocs(q);
    return sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)));
  },

  /** Scoped multi-branch load via chunked `branchId in` (not N sequential getDocs per id beyond chunking). */
  async listByBranches(branchIds: string[], options?: { limit?: number }): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const lim = resolveRepairJobListLimit(options?.limit);
    const { chunkIdsForInQuery } = await import('../lib/repairBranchAccess');
    const chunks = chunkIdsForInQuery(branchIds);
    if (chunks.length === 0) return [];
    if (chunks.length === 1 && chunks[0].length === 1) {
      return this.listByBranch(chunks[0][0], { limit: lim });
    }
    const results = await Promise.all(
      chunks.map(async (chunk) => {
        const q = tenantQuery(
          db,
          REPAIR_JOBS_COLLECTION,
          where('branchId', 'in', chunk),
          orderBy('createdAt', 'desc'),
          limit(lim),
        );
        const snap = await getDocs(q);
        return snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob));
      }),
    );
    const byId = new Map<string, RepairJob>();
    results.flat().forEach((job) => {
      if (job.id) byId.set(job.id, job);
    });
    return sortRepairJobsNewest(Array.from(byId.values())).slice(0, lim);
  },

  async listAllBranches(options?: { limit?: number }): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const lim = resolveRepairJobListLimit(options?.limit);
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      orderBy('createdAt', 'desc'),
      limit(lim),
    );
    const snap = await getDocs(q);
    return sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)));
  },

  subscribeByBranch(
    branchId: string,
    cb: (rows: RepairJob[]) => void,
    options?: { limit?: number },
  ): Unsubscribe {
    if (!isConfigured || !branchId) return () => {};
    const lim = resolveRepairJobListLimit(options?.limit);
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('branchId', '==', branchId),
      orderBy('createdAt', 'desc'),
      limit(lim),
    );
    return onSnapshot(
      q,
      (snap) => cb(sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)))),
      (error) => {
        console.error('repairJobService.subscribeByBranch listener error:', error);
      },
    );
  },

  subscribeByBranches(
    branchIds: string[],
    cb: (rows: RepairJob[]) => void,
    options?: { limit?: number },
  ): Unsubscribe {
    if (!isConfigured) return () => {};
    const lim = resolveRepairJobListLimit(options?.limit);
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
      cb(sortRepairJobsNewest(Array.from(unique.values())).slice(0, lim));
    };
    const unsubs = normalized.map((branchId) => {
      const q = tenantQuery(
        db,
        REPAIR_JOBS_COLLECTION,
        where('branchId', '==', branchId),
        orderBy('createdAt', 'desc'),
        limit(lim),
      );
      return onSnapshot(
        q,
        (snap) => {
          branchRows.set(branchId, sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob))));
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

  subscribeAll(cb: (rows: RepairJob[]) => void, options?: { limit?: number }): Unsubscribe {
    if (!isConfigured) return () => {};
    const lim = resolveRepairJobListLimit(options?.limit);
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      orderBy('createdAt', 'desc'),
      limit(lim),
    );
    return onSnapshot(
      q,
      (snap) => cb(sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)))),
      (error) => {
        console.error('repairJobService.subscribeAll listener error:', error);
      },
    );
  },

  /** تحديث لحظي لطلبات مسندة لفني (user id أو employee id) */
  subscribeByTechnician(technicianId: string, cb: (rows: RepairJob[]) => void): Unsubscribe {
    if (!isConfigured || !technicianId) {
      cb([]);
      return () => {};
    }
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('technicianId', '==', technicianId),
    );
    return onSnapshot(
      q,
      (snap) => cb(sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)))),
      (error) => {
        console.error('repairJobService.subscribeByTechnician listener error:', error);
      },
    );
  },

  /** عدة معرفات فني (مثلاً user id + employee id) — دمج في استعلام واحد عند الإمكان */
  subscribeByTechnicianIds(technicianIds: string[], cb: (rows: RepairJob[]) => void): Unsubscribe {
    if (!isConfigured) return () => {};
    const normalized = Array.from(
      new Set(technicianIds.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())),
    );
    if (normalized.length === 0) {
      cb([]);
      return () => {};
    }
    if (normalized.length === 1) {
      return repairJobService.subscribeByTechnician(normalized[0], cb);
    }
    if (normalized.length > 10) {
      console.warn('repairJobService.subscribeByTechnicianIds: more than 10 ids, truncating');
      normalized.splice(10);
    }
    const q = tenantQuery(
      db,
      REPAIR_JOBS_COLLECTION,
      where('technicianId', 'in', normalized),
    );
    return onSnapshot(
      q,
      (snap) => cb(sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)))),
      (error) => {
        console.error('repairJobService.subscribeByTechnicianIds listener error:', error);
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
    const { serviceEventActor, ...inputRest } = input;
    const settings = resolveRepairSettings(await systemSettingsService.get());
    const receiptResult = inputRest.receiptNo
      ? { receiptNo: inputRest.receiptNo, usedFallback: false }
      : await repairReceiptService.getNextReceipt();
    const at = nowIso();
    const tenantId = getCurrentTenantId();
    const initialCanon = mapLegacyRepairStatus(inputRest.status || settings.workflow.initialStatusId);
    const history: RepairStatusHistoryItem[] = [withDefined({
      status: initialCanon,
      at,
      technicianId: inputRest.technicianId,
    }) as RepairStatusHistoryItem];

    const incomingProducts = Array.isArray(inputRest.jobProducts) ? inputRest.jobProducts : [];
    // Intake create: never trust client serviceIds / line prices.
    const normalizedProducts: RepairJobProduct[] = stripRepairProductsToIntake(
      incomingProducts.length > 0
        ? incomingProducts
        : [{
            itemId: makeItemId(),
            productId: inputRest.productId,
            productName: String(inputRest.productName || inputRest.deviceBrand || 'منتج'),
            deviceType: inputRest.deviceType,
            deviceBrand: inputRest.deviceBrand,
            deviceModel: inputRest.deviceModel,
            accessories: String(inputRest.accessories || ''),
            diagnosis: inputRest.problemDescription || '',
            estimatedCost: 0,
            finalCost: 0,
            inWarranty: false,
          }],
    ).map((item, idx) => ({
      ...item,
      accessories: String(item?.accessories || (idx === 0 ? inputRest.accessories || '' : '')),
    }));
    const lead = normalizedProducts[0];
    const cost = computeRepairJobCost({
      ...inputRest,
      jobProducts: normalizedProducts,
      isServiceOnly: false,
      serviceOnlyCost: 0,
      estimatedCost: 0,
      finalCost: 0,
      finalCostOverride: undefined,
    } as RepairJob);
    const jobRef = doc(collection(db, REPAIR_JOBS_COLLECTION));
    const jobPayload = withDefined({
        ...withDefined(inputRest),
        jobProducts: normalizedProducts,
        productId: lead?.productId || inputRest.productId,
        productName: lead?.productName || inputRest.productName,
        deviceType: lead?.deviceType || inputRest.deviceType,
        deviceBrand: lead?.deviceBrand || inputRest.deviceBrand,
        deviceModel: lead?.deviceModel || inputRest.deviceModel,
        deviceSerial: String(inputRest.deviceSerial || lead?.serialNo || '').trim() || undefined,
        problemDescription: inputRest.problemDescription || lead?.diagnosis || '',
        estimatedCost: 0,
        finalCost: cost.finalCost,
        paidAmount: 0,
        balanceDue: cost.balanceDue,
        isServiceOnly: false,
        serviceOnlyCost: 0,
        finalCostOverride: undefined,
        paymentStatus: normalizePaymentStatus(inputRest.paymentStatus, cost.finalCost, 0),
        tenantId,
        receiptNo: receiptResult.receiptNo,
        createdAt: at,
        updatedAt: at,
        statusHistory: history,
        status: initialCanon,
        warranty: inputRest.warranty || settings.defaults.defaultWarranty,
        warrantyScope: warrantyScopeFromProducts(normalizedProducts),
        slaHours: typeof inputRest.slaHours === 'number' ? inputRest.slaHours : settings.defaults.defaultSlaHours,
        isClosed: false,
    });
    await repairCustomerOperationsService.createRepairJobWithCustody(
      jobRef.id,
      jobPayload as unknown as Record<string, unknown>,
    );
    return { id: jobRef.id, usedFallbackReceipt: receiptResult.usedFallback };
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
      if (lead?.serialNo !== undefined) {
        nextPatch.deviceSerial = String(lead.serialNo || '').trim();
      }
      if (nextPatch.problemDescription === undefined) {
        nextPatch.problemDescription = String(lead?.diagnosis || '');
      }
      const productsTotal = normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0);
      nextPatch.finalCost = Number(nextPatch.finalCostOverride ?? nextPatch.finalCost ?? productsTotal);
      nextPatch.warrantyScope = warrantyScopeFromProducts(normalizedProducts);
      if (normalizedProducts.some((item) => item.inWarranty)) {
        nextPatch.warranty = 'none';
      }
    }
    if (
      nextPatch.partsUsed !== undefined
      || nextPatch.laborCost !== undefined
      || nextPatch.serviceOnlyCost !== undefined
      || nextPatch.jobProducts !== undefined
      || nextPatch.finalCostOverride !== undefined
      || nextPatch.finalCost !== undefined
      || nextPatch.paidAmount !== undefined
      || nextPatch.paymentStatus !== undefined
    ) {
      const existing = await this.getById(id);
      const merged = { ...(existing || {}), ...nextPatch } as RepairJob;
      const cost = computeRepairJobCost(merged);
      const legacyPaidAmount = existing?.paidAmount !== undefined
        ? Number(existing.paidAmount || 0)
        : (
            Number(existing?.finalCost || 0) > 0 && existing?.paymentStatus === 'paid'
              ? Number(existing.finalCost || 0)
              : 0
          );
      const paidAmount = nextPatch.paidAmount !== undefined
        ? Math.max(0, Number(nextPatch.paidAmount || 0))
        : legacyPaidAmount;
      nextPatch.finalCost = cost.finalCost;
      nextPatch.paidAmount = Math.min(cost.finalCost, paidAmount);
      nextPatch.balanceDue = Math.max(0, cost.finalCost - Number(nextPatch.paidAmount || 0));
      nextPatch.paymentStatus = normalizePaymentStatus(
        nextPatch.paymentStatus ?? existing?.paymentStatus,
        cost.finalCost,
        nextPatch.paidAmount,
      );
    }
    await updateDoc(doc(db, REPAIR_JOBS_COLLECTION, id), withDefined({
      ...nextPatch,
      updatedAt: nowIso(),
    } as Record<string, unknown>));
  },

  async assignTechnician(
    id: string,
    technicianId: string,
    actor?: { uid: string; name: string },
  ): Promise<void> {
    if (!isConfigured) return;
    const existing = await this.getById(id);
    if (!existing) return;
    if (Boolean(existing.isClosed) || isDeliveredStatus(existing.status) || isCancelledStatus(existing.status)) {
      throw new Error('لا يمكن تغيير إسناد فني على طلب مقفل أو مُسلَّم أو ملغي.');
    }
    const at = nowIso();
    const original = String(technicianId ?? '').trim();
    let next = original;
    let linkedEmployeeId = '';
    // Prefer Auth uid when the caller passed an employee id with a linked user,
    // so «طلباتي» (queries by login uid) always finds the job.
    if (next) {
      try {
        const { employeeService } = await import('../../hr/employeeService');
        let employee = await employeeService.getById(next);
        if (!employee) employee = await employeeService.getByUserId(next);
        if (employee) {
          linkedEmployeeId = String(employee.id || '').trim();
          const linkedUserId = String(employee.userId || '').trim();
          if (linkedUserId) next = linkedUserId;
        }
      } catch {
        // Keep the provided id when employee lookup is unavailable.
      }
    }
    if (next) {
      const branchId = String(existing.branchId || '').trim();
      if (!branchId) throw new Error('الطلب غير مرتبط بفرع.');
      const branchSnap = await getDoc(doc(db, REPAIR_BRANCHES_COLLECTION, branchId));
      if (!branchSnap.exists()) throw new Error('فرع الطلب غير موجود.');
      const branchData = branchSnap.data() as { technicianIds?: unknown };
      const branchTechnicianIds = Array.isArray(branchData.technicianIds)
        ? (branchData.technicianIds as unknown[])
        : [];
      if (!isAssignableBranchTechnicianId({
        assigneeId: next,
        originalId: original,
        linkedEmployeeId,
        branchTechnicianIds: branchTechnicianIds as Array<string | null | undefined>,
      })) {
        const actorUid = String(actor?.uid || '').trim();
        if (actorUid && (next === actorUid || original === actorUid)) {
          throw new Error('إسناد لي متاح للفني المربوط بالفرع فقط، وليس لموظف الاستقبال.');
        }
        throw new Error('الفني المختار غير مربوط بهذا الفرع.');
      }
    }
    const prev = String(existing.technicianId || '').trim();
    if (prev === next) return;
    const actorUid = String(actor?.uid || 'unknown');
    const actorName = String(actor?.name || 'مستخدم');
    const beforeStatus = mapLegacyRepairStatus(existing.status || '');
    const nextStatus = resolveAssignmentStatusPatch({
      action: next ? 'assign' : 'unassign',
      currentStatus: existing.status,
      jobProducts: existing.jobProducts,
    });

    // Empty technicianId = desk unassign (tech unavailable / wrong branch / handoff).
    const patch: Partial<RepairJob> = {
      technicianId: next,
      assignedAt: next ? at : '',
    };
    if (!next && prev) {
      const priorReleases = Array.isArray(existing.technicianReleaseEvents)
        ? [...existing.technicianReleaseEvents]
        : [];
      priorReleases.push({
        technicianId: prev,
        at,
        actorUid,
      });
      patch.technicianReleaseEvents = priorReleases.slice(-50);
    }
    if (nextStatus && nextStatus !== beforeStatus) {
      const history = Array.isArray(existing.statusHistory) ? [...existing.statusHistory] : [];
      history.push({
        status: nextStatus,
        at,
        technicianId: next || prev || undefined,
        reason: next ? 'إسناد فني — بدء الفحص' : 'فك الإسناد — إعادة لوارد',
      });
      patch.status = nextStatus;
      patch.statusHistory = history;
    }

    await this.update(id, patch);
    await appendRepairServiceEvent(id, {
      tenantId: existing.tenantId,
      branchId: existing.branchId,
      at,
      actorUid,
      actorName,
      action: next ? 'technician_assigned' : 'technician_unassigned',
      domainEvent: next ? 'technician.assigned' : 'technician.unassigned',
      payload: { technicianId: next || null, previousTechnicianId: prev || null },
    });
    if (nextStatus && nextStatus !== beforeStatus) {
      await appendRepairServiceEvent(id, {
        tenantId: existing.tenantId,
        branchId: existing.branchId,
        at,
        actorUid,
        actorName,
        action: 'status_change',
        domainEvent: resolveDomainEventForStatusChange(beforeStatus, nextStatus),
        statusBefore: beforeStatus,
        statusAfter: nextStatus,
        note: next ? 'تقدم تلقائي بعد إسناد الفني' : 'إعادة لوارد بعد فك الإسناد بدون تشخيص',
      });
    }
  },

  async changeStatus(input: {
    jobId: string;
    status: RepairJobStatus;
    technicianId?: string;
    reason?: string;
    finalCost?: number;
    warranty?: RepairJob['warranty'];
    actorUid?: string;
    actorName?: string;
  }): Promise<void> {
    if (!isConfigured) return;
    const settings = resolveRepairSettings(await systemSettingsService.get());
    const existing = await this.getById(input.jobId);
    const beforeCanon = mapLegacyRepairStatus(existing?.status || '');
    const ref = doc(db, REPAIR_JOBS_COLLECTION, input.jobId);
    const nextCanon = mapLegacyRepairStatus(input.status);
    const actorUid = String(input.actorUid || 'unknown');
    const actorName = String(input.actorName || 'مستخدم');
    const skipCustomerApproval = isFullManufacturerWarrantyJob(existing || {});

    assertRepairStatusTransition({
      fromStatus: beforeCanon,
      toStatus: nextCanon,
      statuses: settings.workflow.statuses,
      allowSkipCustomerApproval: skipCustomerApproval,
    });

    if (isDeliveredStatus(nextCanon)) {
      throw new Error('التسليم يتم من شاشة التحصيل والتسليم بعد التحقق من إذن الدفع، وليس بتغيير الحالة مباشرة.');
    }

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('طلب الصيانة غير موجود.');
      const job = normalizeJob({ id: snap.id, ...snap.data() } as RepairJob);
      if (nextCanon === 'ready') {
        const hasSelectedService = (job.jobProducts || []).some((row) =>
          Array.isArray(row.serviceIds) && row.serviceIds.some((id) => String(id || '').trim()),
        );
        const hasUsedPart = (job.partsUsed || []).some((row) => Number(row.quantity || 0) > 0);
        if (!hasSelectedService && !hasUsedPart) {
          throw new Error('اختر خدمة صيانة أو سجّل قطعة غيار قبل تحويل الطلب إلى جاهز للتسليم.');
        }
      }
      const beforeCanon = mapLegacyRepairStatus(job.status);
      const at = nowIso();
      const history = Array.isArray(job.statusHistory) ? [...job.statusHistory] : [];
      const lastHistory = history[history.length - 1];
      const sameStatusSameUtcDay = Boolean(
        lastHistory
        && mapLegacyRepairStatus(String(lastHistory.status || '')) === nextCanon
        && isoUtcDay(lastHistory.at) === isoUtcDay(at),
      );
      if (!sameStatusSameUtcDay) {
        history.push(withDefined({
          status: nextCanon,
          at,
          technicianId: input.technicianId,
          reason: input.reason,
        }) as RepairStatusHistoryItem);
      }

      const setsAssigned = statusSetsAssignedAt(nextCanon, settings.workflow.assignmentTriggerStatusIds);
      const terminal = isTerminalFromSettings(nextCanon, settings.statusMap);
      const resolutionFields = buildRepairResolutionFields(job.assignedAt, at);

      const domainEvent = resolveDomainEventForStatusChange(beforeCanon, nextCanon);
      appendRepairServiceEventTx(tx, input.jobId, {
        tenantId: job.tenantId,
        branchId: job.branchId,
        at,
        actorUid,
        actorName,
        action: 'status_change',
        domainEvent,
        statusBefore: beforeCanon,
        statusAfter: nextCanon,
        ...(input.reason ? { note: input.reason } : {}),
      });

      const shouldBreachSla = Boolean(
        job.dueAt && Date.parse(at) > Date.parse(String(job.dueAt)) && !job.breachedAt,
      );
      if (shouldBreachSla) {
        appendRepairServiceEventTx(tx, input.jobId, {
          tenantId: job.tenantId,
          branchId: job.branchId,
          at,
          actorUid,
          actorName,
          action: 'sla_breached',
          domainEvent: 'sla.breached',
          payload: { dueAt: job.dueAt },
        });
      }

      const skipLive = isFullManufacturerWarrantyJob(job);
      const nextRole = resolveStatusRole(nextCanon, settings.workflow.statuses);
      const markApprovalNotRequired = skipLive
        && (nextRole === 'in_repair' || nextRole === 'awaiting_parts');

      // Firestore Transaction.update rejects undefined (e.g. resolutionMinutes without assignedAt).
      tx.update(ref, withDefined({
        status: nextCanon,
        statusHistory: history,
        updatedAt: at,
        technicianId: input.technicianId ?? job.technicianId ?? '',
        ...(markApprovalNotRequired ? { approvalStatus: 'not_required' } : {}),
        ...(setsAssigned && !job.assignedAt ? { assignedAt: at } : {}),
        ...(isDeliveredStatus(nextCanon)
          ? {
              deliveredAt: at,
              deliveryAuthorizationNo: job.deliveryAuthorizationNo || `DEL-${job.receiptNo || input.jobId}`,
              deliveryAuthorizationIssuedAt: job.deliveryAuthorizationIssuedAt || at,
              deliveryAuthorizationIssuedBy: job.deliveryAuthorizationIssuedBy || actorUid,
              deliveryAuthorizationIssuedByName: job.deliveryAuthorizationIssuedByName || actorName,
              isClosed: true,
              finalCost: Number(input.finalCost ?? job.finalCost ?? 0),
              paidAmount: job.paidAmount ?? 0,
              balanceDue: Math.max(0, Number(input.finalCost ?? job.finalCost ?? 0) - Number(job.paidAmount || 0)),
              paymentStatus: normalizePaymentStatus(
                job.paymentStatus,
                Number(input.finalCost ?? job.finalCost ?? 0),
                job.paidAmount ?? 0,
              ),
              warranty: input.warranty ?? job.warranty ?? 'none',
              resolvedAt: at,
              ...resolutionFields,
              closedReason: input.reason || job.closedReason || 'delivered',
            }
          : {}),
        ...(isUnrepairableStatus(nextCanon)
          ? {
              notes: input.reason || job.notes || '',
              closedReason: input.reason || job.closedReason || 'unrepairable',
              resolvedAt: at,
              isClosed: true,
              ...resolutionFields,
            }
          : {}),
        ...(isCancelledStatus(nextCanon)
          ? {
              notes: input.reason || job.notes || '',
              closedReason: input.reason || job.closedReason || 'cancelled',
              resolvedAt: at,
              isClosed: true,
              ...resolutionFields,
            }
          : {}),
        ...(terminal && !isDeliveredStatus(nextCanon) && !isUnrepairableStatus(nextCanon) && !isCancelledStatus(nextCanon)
          ? {
              resolvedAt: at,
              isClosed: true,
              ...resolutionFields,
              closedReason: input.reason || job.closedReason || 'terminal_status',
            }
          : {}),
        ...(job.dueAt && Date.parse(at) > Date.parse(String(job.dueAt)) && !job.breachedAt
          ? { breachedAt: at }
          : {}),
      }));
    });

    try {
      if (
        isDeliveredStatus(nextCanon)
        || isCancelledStatus(nextCanon)
        || isUnrepairableStatus(nextCanon)
      ) {
        await sparePartsService.releaseAllActiveForJob(input.jobId, actorName);
      } else if (
        beforeCanon === 'waiting_parts'
        && !['waiting_parts', 'repairing', 'testing', 'ready'].includes(nextCanon)
      ) {
        await sparePartsService.releaseAllActiveForJob(input.jobId, actorName);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذر تحرير حجوزات قطع الغيار.';
      throw new Error(`تم تحديث الحالة لكن فشل تحرير الحجوزات: ${message}`);
    }

    const customerId = String(existing?.customerId || '').trim();
    if (
      customerId
      && (isDeliveredStatus(nextCanon)
        || isCancelledStatus(nextCanon)
        || isUnrepairableStatus(nextCanon))
    ) {
      try {
        const { customerActivityService } = await import(
          '@/modules/customers/services/customerActivityService'
        );
        const action = isDeliveredStatus(nextCanon)
          ? 'repair.job_delivered'
          : isCancelledStatus(nextCanon)
            ? 'repair.job_cancelled'
            : 'repair.job_unrepairable';
        const title = isDeliveredStatus(nextCanon)
          ? 'تسليم طلب صيانة'
          : isCancelledStatus(nextCanon)
            ? 'إلغاء طلب صيانة'
            : 'طلب غير قابل للإصلاح';
        await customerActivityService.record({
          customerId,
          module: 'repair',
          action,
          title,
          summary: input.reason || existing?.customerName || '',
          referenceType: 'repair_job',
          referenceId: input.jobId,
          referenceLabel: existing?.receiptNo || input.jobId,
          actorUid,
          actorName,
        });
      } catch (err) {
        console.warn('repairJobService.changeStatus: customer activity', err);
      }
    }
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
    const settings = resolveRepairSettings(await systemSettingsService.get());
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
      customerId: source.customerId || '',
      deviceType: lead?.deviceType || source.deviceType,
      deviceBrand: lead?.deviceBrand || source.deviceBrand,
      deviceModel: lead?.deviceModel || source.deviceModel,
      deviceColor: source.deviceColor || '',
      devicePassword: source.devicePassword || '',
      problemDescription: '',
      accessories: source.accessories || '',
      status: settings.workflow.initialStatusId,
      warranty: settings.defaults.defaultWarranty,
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
    if (source.customerId && createResult.id) {
      try {
        const created = await this.getById(createResult.id);
        const { customerActivityService } = await import(
          '@/modules/customers/services/customerActivityService'
        );
        await customerActivityService.record({
          customerId: source.customerId,
          module: 'repair',
          action: 'repair.job_created',
          title: 'إعادة إصلاح مرتبطة',
          summary: `من الطلب #${source.receiptNo}`,
          referenceType: 'repair_job',
          referenceId: createResult.id,
          referenceLabel: created?.receiptNo || createResult.id,
          actorUid: input.createdById,
        });
      } catch (err) {
        console.warn('createLinkedReopenJob: customer activity', err);
      }
    }
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
    const consumedLines = input.partsUsed.filter((p) => Number(p.quantity || 0) > 0);
    for (const part of consumedLines) {
      const q = Number(part.quantity || 0);
      await sparePartsService.consumeActiveReservationForJob({
        jobId: input.jobId,
        partId: part.partId,
        quantity: q,
        updatedBy: input.createdBy,
      });
      await sparePartsService.deductPart(
        input.branchId,
        part.partId,
        part.partName,
        q,
        input.createdBy,
        input.jobId,
      );
    }

    await this.update(input.jobId, {
      partsUsed: input.partsUsed,
      notes: input.notes,
    });

    if (consumedLines.length === 0) return;
    const jobAfter = await this.getById(input.jobId);
    if (jobAfter?.tenantId) {
      const at = nowIso();
      await appendRepairServiceEvent(input.jobId, {
        tenantId: jobAfter.tenantId,
        branchId: jobAfter.branchId,
        at,
        actorUid: input.createdBy,
        actorName: input.createdBy,
        action: 'parts_consumed',
        domainEvent: 'part.consumed',
        payload: {
          parts: consumedLines.map((p) => ({
            partId: p.partId,
            partName: p.partName,
            quantity: p.quantity,
          })),
        },
      });
    }
  },

  async listByTechnicianIds(technicianIds: string[]): Promise<RepairJob[]> {
    if (!isConfigured) return [];
    const normalized = Array.from(
      new Set(technicianIds.filter((id) => typeof id === 'string' && id.trim().length > 0).map((id) => id.trim())),
    );
    if (normalized.length === 0) return [];
    if (normalized.length === 1) return this.listByTechnician(normalized[0]);
    const IN_CHUNK = 10;
    const idChunks: string[][] = [];
    for (let i = 0; i < normalized.length; i += IN_CHUNK) {
      idChunks.push(normalized.slice(i, i + IN_CHUNK));
    }
    const snaps = await Promise.all(
      idChunks.map((chunk) =>
        getDocs(tenantQuery(db, REPAIR_JOBS_COLLECTION, where('technicianId', 'in', chunk))),
      ),
    );
    const byId = new Map<string, RepairJob>();
    snaps.flatMap((snap) => snap.docs).forEach((d) => {
      const job = normalizeJob({ id: d.id, ...d.data() } as RepairJob);
      if (job.id) byId.set(job.id, job);
    });
    return Array.from(byId.values()).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  },

  async remove(id: string): Promise<void> {
    if (!isConfigured || !id) return;
    const row = await this.getById(id);
    if (!row) throw new Error('طلب الصيانة غير موجود.');
    const s = mapLegacyRepairStatus(String(row.status || '')).toLowerCase();
    if (s === 'delivered' || s === 'cancelled' || s === 'unrepairable' || Boolean(row.isClosed)) {
      throw new Error('لا يمكن حذف طلب صيانة مُسلَّم أو مُقفل أو ملغى.');
    }
    await deleteDoc(doc(db, REPAIR_JOBS_COLLECTION, id));
  },

  async removeWithRollback(id: string, input: RemoveRepairJobWithRollbackInput): Promise<void> {
    if (!isConfigured || !id) return;
    const row = await this.getById(id);
    if (!row) throw new Error('طلب الصيانة غير موجود.');

    const actorId = String(input.deletedBy || '').trim();
    const actorName = String(input.deletedByName || actorId || 'system').trim();
    const reason = String(input.cancelReason || '').trim();
    const reverseRef = `delete-reverse:${id}`;

    const incomeEntries = await repairTreasuryService.listEntriesByReference(id, 'INCOME');
    const totalIncome = incomeEntries.reduce((sum, entry) => sum + Math.abs(Number(entry.amount || 0)), 0);
    const isAlreadyReversed = await repairTreasuryService.hasEntryByReference(reverseRef, 'EXPENSE');
    if (totalIncome > 0 && !isAlreadyReversed) {
      await repairTreasuryService.ensureOpenSession(row.branchId);
      await repairTreasuryService.addEntry({
        branchId: row.branchId,
        entryType: 'EXPENSE',
        amount: totalIncome,
        note: [
          `عكس تحصيل طلب صيانة #${row.receiptNo || id} بسبب الحذف`,
          reason ? `السبب: ${reason}` : '',
        ].filter(Boolean).join(' - '),
        referenceId: reverseRef,
        createdBy: actorId,
        createdByName: actorName,
      });
    }

    const branch = (await repairBranchService.list()).find((item) => String(item.id || '') === String(row.branchId || ''));
    const branchWarehouseId = String(branch?.warehouseId || '').trim();
    const branchWarehouseName = branch?.name ? `مخزن ${branch.name}` : String(branch?.warehouseCode || '').trim();
    if (Array.isArray(row.partsUsed) && row.partsUsed.length > 0) {
      if (!branchWarehouseId) {
        throw new Error('لا يمكن عكس قطع الغيار لأن مخزن الفرع غير محدد.');
      }
      for (const part of row.partsUsed) {
        const qty = Math.abs(Number(part.quantity || 0));
        if (!(qty > 0)) continue;
        const issueId = String(part.issueId || '').trim();
        if (issueId) {
          const itemId = String(part.materialId || part.partId || '').trim();
          if (!itemId) continue;
          await repairSpareIssueService.returnLines(issueId, [{
            itemId,
            quantity: qty,
            note: [
              `عكس صرف قطع غيار لطلب #${row.receiptNo || id} بسبب الحذف`,
              reason ? `السبب: ${reason}` : '',
            ].filter(Boolean).join(' - '),
          }]);
          continue;
        }
        const partId = String(part.partId || '').trim();
        if (!partId) continue;
        await sparePartsService.adjustStock({
          branchId: row.branchId,
          warehouseId: branchWarehouseId,
          warehouseName: branchWarehouseName,
          partId,
          partName: String(part.partName || '').trim() || partId,
          quantity: qty,
          type: 'IN',
          createdBy: actorName,
          jobId: row.id,
          referenceId: reverseRef,
          notes: [
            `عكس صرف قطع غيار لطلب #${row.receiptNo || id} بسبب الحذف`,
            reason ? `السبب: ${reason}` : '',
          ].filter(Boolean).join(' - '),
        });
      }
    }

    const linkedInvoice = await repairSalesInvoiceService.findActiveByRepairJobId(id);
    if (linkedInvoice?.id) {
      await repairSalesInvoiceService.cancelInvoice({
        id: linkedInvoice.id,
        cancelledBy: actorId,
        cancelledByName: actorName,
        cancelReason: reason || `إلغاء تلقائي بسبب حذف طلب الصيانة #${row.receiptNo || id}`,
      });
    }

    await deleteDoc(doc(db, REPAIR_JOBS_COLLECTION, id));
  },

  async listByTechnician(technicianId: string, branchId?: string): Promise<RepairJob[]> {
    if (!isConfigured || !technicianId) return [];
    const constraints = [where('technicianId', '==', technicianId)] as Parameters<typeof query>[1][];
    if (branchId) constraints.push(where('branchId', '==', branchId));
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, ...constraints);
    const snap = await getDocs(q);
    return sortRepairJobsNewest(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob)));
  },
};
