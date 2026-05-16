import {
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
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import { REPAIR_JOBS_COLLECTION, REPAIR_SERVICE_EVENTS_SUBCOLLECTION } from '../collections';
import { appendRepairServiceEvent, appendRepairServiceEventTx } from './repairServiceEventService';
import { REPAIR_DOMAIN_EVENT_VERSION, resolveDomainEventForStatusChange } from '../utils/repairDomainEvents';
import {
  isCancelledStatus,
  isDeliveredStatus,
  isUnrepairableStatus,
  mapLegacyRepairStatus,
  statusSetsAssignedAt,
  isTerminalFromSettings,
} from '../utils/repairWorkflowNormalize';
import { generateApprovalToken, sha256Hex } from '../utils/repairApprovalToken';
import type { RepairJob, RepairJobProduct, RepairJobStatus, RepairPartUsage, RepairStatusHistoryItem } from '../types';
import { repairReceiptService } from './repairReceiptService';
import { sparePartsService } from './sparePartsService';
import { repairTreasuryService } from './repairTreasuryService';
import { repairSalesInvoiceService } from './repairSalesInvoiceService';
import { repairBranchService } from './repairBranchService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import { resolveRepairSettings } from '../config/repairSettings';
import { computeRepairJobCost, normalizePaymentStatus } from '../utils/repairBusinessLogic';

const nowIso = () => new Date().toISOString();
const isoUtcDay = (isoLike: string | undefined | null): string => String(isoLike || '').slice(0, 10);
const withDefined = <T extends Record<string, unknown>>(obj: T): T =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as T;
const makeItemId = () => `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeJob = (job: RepairJob): RepairJob => {
  const existingProducts = Array.isArray(job.jobProducts) ? job.jobProducts : [];
  const normalizedProducts: RepairJobProduct[] = existingProducts.length > 0
    ? existingProducts.map((item, idx) => ({
        ...item,
        itemId: String(item?.itemId || `item-${idx + 1}`),
        accessories: String(item?.accessories || (idx === 0 ? job.accessories || '' : '')),
      }))
    : [{
        itemId: 'item-1',
        productId: job.productId,
        productName: String(job.productName || job.deviceBrand || 'منتج'),
        deviceType: job.deviceType,
        deviceBrand: job.deviceBrand,
        deviceModel: job.deviceModel,
        accessories: String(job.accessories || ''),
        diagnosis: job.problemDescription || '',
        estimatedCost: Number(job.estimatedCost || 0),
        finalCost: Number(job.finalCost || 0),
        inWarranty: (job.warranty || 'none') !== 'none',
      }];
  const lead = normalizedProducts[0];
  const mappedStatus = mapLegacyRepairStatus(job.status);
  const normalizedJob = {
    ...job,
    status: mappedStatus,
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
  const cost = computeRepairJobCost(normalizedJob);
  return {
    ...normalizedJob,
    finalCost: cost.finalCost,
    paymentStatus: normalizePaymentStatus(normalizedJob.paymentStatus, cost.finalCost),
  };
};

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

  /** يولّد توكن موافقة عميل ويخزّن الهاش فقط — الرابط الكامل في الواجهة */
  async requestCustomerApproval(input: { jobId: string; actorUid: string; actorName: string }): Promise<{ token: string } | null> {
    if (!isConfigured) return null;
    const job = await this.getById(input.jobId);
    if (!job) throw new Error('طلب الصيانة غير موجود.');
    const token = generateApprovalToken();
    const hash = await sha256Hex(token);
    const at = nowIso();
    const exp = new Date(Date.now() + 7 * 86400000).toISOString();
    const jobRef = doc(db, REPAIR_JOBS_COLLECTION, input.jobId);
    const evRef = doc(collection(jobRef, REPAIR_SERVICE_EVENTS_SUBCOLLECTION));
    const batch = writeBatch(db);
    batch.update(jobRef, withDefined({
      approvalStatus: 'pending',
      approvalRequestedAt: at,
      approvalTokenHash: hash,
      approvalTokenExpiresAt: exp,
      updatedAt: at,
    }) as Record<string, unknown>);
    batch.set(evRef, {
      tenantId: job.tenantId,
      branchId: job.branchId,
      jobId: input.jobId,
      at,
      actorUid: input.actorUid,
      actorName: input.actorName,
      action: 'approval_requested',
      domainEvent: 'customer.approval_requested',
      eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
      note: 'طلب موافقة عميل على التقدير',
    });
    await batch.commit();
    return { token };
  },

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
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob))),
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
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => cb(snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob))),
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
    const normalizedProducts: RepairJobProduct[] = incomingProducts.length > 0
      ? incomingProducts.map((item, idx) => ({
          ...item,
          itemId: String(item?.itemId || `item-${idx + 1}`),
          accessories: String(item?.accessories || (idx === 0 ? inputRest.accessories || '' : '')),
        }))
      : [{
          itemId: makeItemId(),
          productId: inputRest.productId,
          productName: String(inputRest.productName || inputRest.deviceBrand || 'منتج'),
          deviceType: inputRest.deviceType,
          deviceBrand: inputRest.deviceBrand,
          deviceModel: inputRest.deviceModel,
          accessories: String(inputRest.accessories || ''),
          diagnosis: inputRest.problemDescription || '',
          estimatedCost: Number(inputRest.estimatedCost || 0),
          finalCost: Number(inputRest.finalCost || 0),
          inWarranty: (inputRest.warranty || 'none') !== 'none',
        }];
    const lead = normalizedProducts[0];
    const cost = computeRepairJobCost({
      ...inputRest,
      jobProducts: normalizedProducts,
      finalCost: Number(inputRest.finalCostOverride ?? inputRest.finalCost ?? normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0)),
    } as RepairJob);
    const jobRef = doc(collection(db, REPAIR_JOBS_COLLECTION));
    const batch = writeBatch(db);
    batch.set(
      jobRef,
      withDefined({
        ...withDefined(inputRest),
        jobProducts: normalizedProducts,
        productId: lead?.productId || inputRest.productId,
        productName: lead?.productName || inputRest.productName,
        deviceType: lead?.deviceType || inputRest.deviceType,
        deviceBrand: lead?.deviceBrand || inputRest.deviceBrand,
        deviceModel: lead?.deviceModel || inputRest.deviceModel,
        problemDescription: inputRest.problemDescription || lead?.diagnosis || '',
        estimatedCost: Number(inputRest.estimatedCost || normalizedProducts.reduce((sum, item) => sum + Number(item.estimatedCost || 0), 0)),
        finalCost: cost.finalCost,
        paymentStatus: normalizePaymentStatus(inputRest.paymentStatus, cost.finalCost),
        tenantId,
        receiptNo: receiptResult.receiptNo,
        createdAt: at,
        updatedAt: at,
        statusHistory: history,
        status: initialCanon,
        warranty: inputRest.warranty || settings.defaults.defaultWarranty,
        slaHours: typeof inputRest.slaHours === 'number' ? inputRest.slaHours : settings.defaults.defaultSlaHours,
        isClosed: false,
      }),
    );
    const evRef = doc(collection(jobRef, REPAIR_SERVICE_EVENTS_SUBCOLLECTION));
    batch.set(evRef, {
      tenantId,
      branchId: inputRest.branchId,
      jobId: jobRef.id,
      at,
      actorUid: String(serviceEventActor?.uid || 'unknown'),
      actorName: String(serviceEventActor?.name || 'نظام'),
      action: 'job_created',
      domainEvent: 'job.created',
      eventSchemaVersion: REPAIR_DOMAIN_EVENT_VERSION,
      statusAfter: initialCanon,
      note: `إنشاء طلب صيانة — إيصال ${receiptResult.receiptNo}`,
    });
    await batch.commit();
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
      if (!nextPatch.problemDescription) {
        nextPatch.problemDescription = String(lead?.diagnosis || '');
      }
      const productsTotal = normalizedProducts.reduce((sum, item) => sum + Number(item.finalCost || 0), 0);
      nextPatch.finalCost = Number(nextPatch.finalCostOverride ?? nextPatch.finalCost ?? productsTotal);
    }
    if (
      nextPatch.partsUsed !== undefined
      || nextPatch.laborCost !== undefined
      || nextPatch.serviceOnlyCost !== undefined
      || nextPatch.jobProducts !== undefined
      || nextPatch.finalCostOverride !== undefined
      || nextPatch.finalCost !== undefined
      || nextPatch.paymentStatus !== undefined
    ) {
      const existing = await this.getById(id);
      const merged = { ...(existing || {}), ...nextPatch } as RepairJob;
      const cost = computeRepairJobCost(merged);
      nextPatch.finalCost = cost.finalCost;
      nextPatch.paymentStatus = normalizePaymentStatus(nextPatch.paymentStatus ?? existing?.paymentStatus, cost.finalCost);
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
    const at = nowIso();
    const next = String(technicianId ?? '').trim();
    const prev = String(existing.technicianId || '').trim();
    await this.update(id, { technicianId: next, assignedAt: at });
    if (!next || prev === next) return;
    await appendRepairServiceEvent(id, {
      tenantId: existing.tenantId,
      branchId: existing.branchId,
      at,
      actorUid: String(actor?.uid || 'unknown'),
      actorName: String(actor?.name || 'مستخدم'),
      action: 'technician_assigned',
      domainEvent: 'technician.assigned',
      payload: { technicianId: next, previousTechnicianId: prev || null },
    });
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

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('طلب الصيانة غير موجود.');
      const job = normalizeJob({ id: snap.id, ...snap.data() } as RepairJob);
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
      const resolutionMins = job.assignedAt
        ? Math.max(0, Math.round((Date.parse(at) - Date.parse(String(job.assignedAt || at))) / 60000))
        : undefined;

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
        note: input.reason,
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

      tx.update(ref, {
        status: nextCanon,
        statusHistory: history,
        updatedAt: at,
        technicianId: input.technicianId ?? job.technicianId ?? '',
        ...(setsAssigned && !job.assignedAt ? { assignedAt: at } : {}),
        ...(isDeliveredStatus(nextCanon)
          ? {
              deliveredAt: at,
              isClosed: true,
              finalCost: Number(input.finalCost ?? job.finalCost ?? 0),
              paymentStatus: normalizePaymentStatus(job.paymentStatus, Number(input.finalCost ?? job.finalCost ?? 0)),
              warranty: input.warranty ?? job.warranty ?? 'none',
              resolvedAt: at,
              resolutionMinutes: resolutionMins,
              closedReason: input.reason || job.closedReason || 'delivered',
            }
          : {}),
        ...(isUnrepairableStatus(nextCanon)
          ? {
              notes: input.reason || job.notes || '',
              closedReason: input.reason || job.closedReason || 'unrepairable',
              resolvedAt: at,
              isClosed: true,
              resolutionMinutes: resolutionMins,
            }
          : {}),
        ...(isCancelledStatus(nextCanon)
          ? {
              notes: input.reason || job.notes || '',
              closedReason: input.reason || job.closedReason || 'cancelled',
              resolvedAt: at,
              isClosed: true,
              resolutionMinutes: resolutionMins,
            }
          : {}),
        ...(terminal && !isDeliveredStatus(nextCanon) && !isUnrepairableStatus(nextCanon) && !isCancelledStatus(nextCanon)
          ? {
              resolvedAt: at,
              isClosed: true,
              resolutionMinutes: resolutionMins,
              closedReason: input.reason || job.closedReason || 'terminal_status',
            }
          : {}),
        ...(job.dueAt && Date.parse(at) > Date.parse(String(job.dueAt)) && !job.breachedAt
          ? { breachedAt: at }
          : {}),
      });
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
      console.warn('repairJobService.changeStatus: release reservations', err);
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
    const chunks = await Promise.all(normalized.map((tid) => this.listByTechnician(tid)));
    const byId = new Map<string, RepairJob>();
    chunks.flat().forEach((j) => {
      if (j.id) byId.set(j.id, j);
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
        const partId = String(part.partId || '').trim();
        if (!partId) continue;
        await sparePartsService.adjustStock({
          branchId: row.branchId,
          warehouseId: branchWarehouseId,
          warehouseName: branchWarehouseName,
          partId,
          partName: String(part.partName || '').trim() || partId,
          quantity: Math.abs(Number(part.quantity || 0)),
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
    const q = tenantQuery(db, REPAIR_JOBS_COLLECTION, ...constraints, orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeJob({ id: d.id, ...d.data() } as RepairJob));
  },
};
