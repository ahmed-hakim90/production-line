import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  runTransaction,
  updateDoc,
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import { getCurrentTenantId } from '../../../lib/currentTenant';
import { tenantQuery } from '../../../lib/tenantFirestore';
import type {
  InventoryTransferRequest,
  TransferRequestLine,
  TransferRequestStatus,
  TransferRequestType,
} from '../types';
import { stockService } from './stockService';
import { systemSettingsService } from '../../system/services/systemSettingsService';
import {
  INVENTORY_OPERATION_KEYS,
  INVENTORY_STOCK_MOVE_PATHS,
  assertCurrentTenantOperationPathEnabled,
  type InventoryTransferCreatePath,
  type InventoryTransferDecisionPath,
} from '../../system/lib/operationPathSettings';
import { opsNotificationService } from '../../../services/opsNotificationService';
import { warehouseService } from './warehouseService';
import {
  allocateInvReferenceInTransaction,
  formatInvReference,
  peekNextInvReferenceNo,
} from './inventoryInvSequence';
import { getCurrentBoundInventoryWarehouseId } from './inventoryWarehouseScopeService';
import {
  isRepairSystemWarehouseRole,
  MANUAL_TRANSFER_REPAIR_WAREHOUSE_ERROR,
} from '../lib/manualTransferWarehouses';

const COLLECTION = 'inventory_transfer_requests';
const toIsoNow = () => new Date().toISOString();
const MAX_PAGE_SIZE = 100;

/** Firestore rejects `undefined` — strip deeply before writes. */
const stripUndefinedDeep = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as T;
  }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefinedDeep(v)]),
    ) as T;
  }
  return value;
};

type FirestoreCursor = QueryDocumentSnapshot | null;
type TransferRequestPageResult = {
  items: InventoryTransferRequest[];
  nextCursor: FirestoreCursor;
  hasMore: boolean;
};

type CreateTransferRequestInput = {
  requestType?: TransferRequestType;
  fromWarehouseId: string;
  fromWarehouseName?: string;
  toWarehouseId: string;
  toWarehouseName?: string;
  referenceNo?: string;
  note?: string;
  /** @deprecated Use sourceId */
  sourceReportId?: string;
  sourceModule?: InventoryTransferRequest['sourceModule'];
  sourceId?: string;
  lines: TransferRequestLine[];
  createdBy: string;
  createdByUserId?: string;
};

import { isTransferLikeType, normalizeTransferRequestType } from '../lib/transferRequestTypes';
import { resolveInventoryRoutingV1Async } from './inventoryRoutingService';

const normalizeRequestType = normalizeTransferRequestType;

type UpdateTransferRequestInput = {
  note?: string;
  lines?: TransferRequestLine[];
};

type ApproveRequestOptions = {
  allowNegativeFromSource?: boolean;
  approverUserId?: string;
};

const normalizeActor = (value?: string) => String(value || '').trim().toLowerCase();

async function executeTransferLikeRequest(
  request: InventoryTransferRequest,
  approvedBy: string,
  options?: ApproveRequestOptions,
): Promise<void> {
  for (const line of request.lines) {
    await stockService.createMovement({
      warehouseId: request.fromWarehouseId,
      toWarehouseId: request.toWarehouseId,
      locationId: line.locationId,
      locationCode: line.locationCode,
      toLocationId: line.toLocationId,
      toLocationCode: line.toLocationCode,
      itemType: line.itemType,
      itemId: line.itemId,
      itemName: line.itemName,
      itemCode: line.itemCode,
      movementType: 'TRANSFER',
      quantity: Number(line.quantity || 0),
      unit: line.unit,
      requestQuantity: Number(line.requestQuantity ?? line.quantity ?? 0),
      requestUnit: line.requestUnit || (line.itemType === 'finished_good' ? 'piece' : 'unit'),
      unitsPerCarton: Number(line.unitsPerCarton || 0) || undefined,
      minStock: line.minStock,
      note: request.note,
      referenceNo: request.referenceNo,
      sourceModule: request.sourceModule ?? 'transfer_request',
      sourceId: request.sourceId ?? request.sourceReportId ?? request.id,
      createdBy: approvedBy,
      allowNegative: Boolean(options?.allowNegativeFromSource),
    }, { path: INVENTORY_STOCK_MOVE_PATHS.transferApproval });
  }
}

/**
 * After production_entry lands in WIP, move qty to تم الإنتاج (finished staging)
 * by approving/executing the deferred production_auto_transfer — no second human click.
 */
async function chainProductionEntryToFinishedStaging(
  productionEntry: InventoryTransferRequest,
  approvedBy: string,
  options?: ApproveRequestOptions,
): Promise<void> {
  const reportId = String(productionEntry.sourceReportId || productionEntry.sourceId || '').trim();
  const settings = await systemSettingsService.get();
  if (!settings) return;
  const routing = await resolveInventoryRoutingV1Async(settings);
  if (!routing.autoTransferProductionToFinished) return;

  const wipId = String(routing.productionWipWarehouseId || productionEntry.toWarehouseId || '').trim();
  const stagingId = String(routing.finishedStagingWarehouseId || '').trim();
  if (!wipId || !stagingId || wipId === stagingId) return;

  let pendingAutos: InventoryTransferRequest[] = [];
  if (reportId) {
    const linked = await transferApprovalService.getBySourceReportId(reportId);
    pendingAutos = linked.filter(
      (row) =>
        row.id &&
        row.id !== productionEntry.id &&
        row.status === 'pending' &&
        normalizeRequestType(row.requestType) === 'production_auto_transfer',
    );
  }

  if (pendingAutos.length === 0) {
    // Create and execute immediately for audit trail when report didn't pre-create the auto request.
    const [fromName, toName] = await Promise.all([
      warehouseService.resolveDisplayName(wipId, 'مخزن إنتاج تحت التشغيل'),
      warehouseService.resolveDisplayName(stagingId, 'تم الإنتاج'),
    ]);
    const createdId = await transferApprovalService.createRequest({
      requestType: 'production_auto_transfer',
      fromWarehouseId: wipId,
      fromWarehouseName: fromName,
      toWarehouseId: stagingId,
      toWarehouseName: toName,
      note: `ترحيل تلقائي بعد اعتماد إدخال ${productionEntry.referenceNo || productionEntry.id}`,
      sourceModule: productionEntry.sourceModule ?? 'production_report',
      sourceId: reportId || productionEntry.id,
      sourceReportId: reportId || undefined,
      lines: productionEntry.lines,
      createdBy: approvedBy,
      createdByUserId: options?.approverUserId,
    }, { internal: true });
    if (createdId) {
      const created = await transferApprovalService.getById(createdId);
      if (created) pendingAutos = [created];
    }
  }

  const chainApprover = `${approvedBy} (ترحيل تلقائي)`;
  for (const auto of pendingAutos) {
    if (!auto.id || auto.status !== 'pending') continue;
    await executeTransferLikeRequest(auto, chainApprover, {
      ...options,
      allowNegativeFromSource: Boolean(
        options?.allowNegativeFromSource || routing.allowNegativeFinishedTransferStock,
      ),
    });
    const resolvedAt = toIsoNow();
    const approvePatch: Record<string, unknown> = {
      status: 'approved',
      approvedBy: chainApprover,
      approvedAt: resolvedAt,
      resolvedAt,
      note: [auto.note, 'نُفّذ تلقائياً بعد اعتماد إدخال الإنتاج'].filter(Boolean).join(' — '),
    };
    if (!auto.firstReviewedAt) approvePatch.firstReviewedAt = resolvedAt;
    if (options?.approverUserId?.trim()) approvePatch.approvedByUserId = options.approverUserId.trim();
    await updateDoc(doc(db, COLLECTION, auto.id), approvePatch);
  }
}

export const transferApprovalService = {
  /** Display-only; allocation for new requests is atomic in `createRequest`. */
  async getNextInvReferenceNo(): Promise<string> {
    if (!isConfigured) return formatInvReference(1);
    return peekNextInvReferenceNo();
  },

  async listPaged(params?: {
    status?: TransferRequestStatus;
    requestType?: TransferRequestType;
    limit?: number;
    cursor?: FirestoreCursor;
  }): Promise<TransferRequestPageResult> {
    if (!isConfigured) return { items: [], nextCursor: null, hasMore: false };
    const pageSize = Math.max(1, Math.min(Number(params?.limit || 30), MAX_PAGE_SIZE));
    const constraints: any[] = [orderBy('createdAt', 'desc'), limit(pageSize)];
    if (params?.status) constraints.unshift(where('status', '==', params.status));
    if (params?.requestType) constraints.unshift(where('requestType', '==', params.requestType));
    if (params?.cursor) constraints.push(startAfter(params.cursor));
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    if (!boundWarehouseId) {
      const q = tenantQuery(db, COLLECTION, ...constraints);
      const snap = await getDocs(q);
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
      const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
      return { items, nextCursor, hasMore: snap.docs.length === pageSize };
    }

    // Firestore rules are not filters. Query each authorized side explicitly, then
    // merge by document id so source/destination users see the same request once.
    const [sourceSnap, destinationSnap] = await Promise.all([
      getDocs(tenantQuery(
        db,
        COLLECTION,
        where('fromWarehouseId', '==', boundWarehouseId),
        ...constraints,
      )),
      getDocs(tenantQuery(
        db,
        COLLECTION,
        where('toWarehouseId', '==', boundWarehouseId),
        ...constraints,
      )),
    ]);
    const docsById = new Map(
      [...sourceSnap.docs, ...destinationSnap.docs].map((row) => [row.id, row]),
    );
    const docs = [...docsById.values()]
      .sort((a, b) => String(b.data().createdAt || '').localeCompare(String(a.data().createdAt || '')))
      .slice(0, pageSize);
    const items = docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
    const nextCursor = docs.length > 0 ? docs[docs.length - 1] : null;
    return {
      items,
      nextCursor,
      hasMore: sourceSnap.docs.length === pageSize || destinationSnap.docs.length === pageSize,
    };
  },

  async getAll(): Promise<InventoryTransferRequest[]> {
    if (!isConfigured) return [];
    const rows: InventoryTransferRequest[] = [];
    let cursor: FirestoreCursor = null;
    const maxPages = 10;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.listPaged({ limit: MAX_PAGE_SIZE, cursor });
      rows.push(...res.items);
      if (!res.hasMore || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return rows;
  },

  async getByStatus(status: TransferRequestStatus): Promise<InventoryTransferRequest[]> {
    if (!isConfigured) return [];
    const rows: InventoryTransferRequest[] = [];
    let cursor: FirestoreCursor = null;
    const maxPages = 10;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.listPaged({ status, limit: MAX_PAGE_SIZE, cursor });
      rows.push(...res.items);
      if (!res.hasMore || !res.nextCursor) break;
      cursor = res.nextCursor;
    }
    return rows;
  },

  async getById(id: string): Promise<InventoryTransferRequest | null> {
    if (!isConfigured || !id) return null;
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as InventoryTransferRequest;
  },

  async getBySourceReportId(sourceReportId: string): Promise<InventoryTransferRequest[]> {
    if (!isConfigured || !sourceReportId.trim()) return [];
    const sourceId = sourceReportId.trim();
    const boundWarehouseId = await getCurrentBoundInventoryWarehouseId();
    if (boundWarehouseId) {
      const loadSide = async (field: 'fromWarehouseId' | 'toWarehouseId') => {
        const scoped = tenantQuery(
          db,
          COLLECTION,
          where('sourceReportId', '==', sourceId),
          where(field, '==', boundWarehouseId),
          limit(500),
        );
        const snap = await getDocs(scoped);
        return snap.docs;
      };
      const [sourceDocs, destinationDocs] = await Promise.all([
        loadSide('fromWarehouseId'),
        loadSide('toWarehouseId'),
      ]);
      return [...new Map(
        [...sourceDocs, ...destinationDocs].map((row) => [
          row.id,
          { id: row.id, ...row.data() } as InventoryTransferRequest,
        ]),
      ).values()].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    }
    try {
      const q = tenantQuery(
        db,
        COLLECTION,
        where('sourceReportId', '==', sourceId),
        orderBy('createdAt', 'desc'),
      );
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
    } catch (error) {
      const code = (error as { code?: string })?.code || '';
      const message = String((error as { message?: string })?.message || '');
      const requiresIndex = code === 'failed-precondition' || message.includes('requires an index');
      if (!requiresIndex) throw error;

      // Fallback for environments where sourceReportId+createdAt index is not deployed yet.
      const fallbackQ = tenantQuery(
        db,
        COLLECTION,
        where('sourceReportId', '==', sourceId),
        limit(500),
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
      rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return rows;
    }
  },

  async createRequest(
    input: CreateTransferRequestInput,
    context: { path: InventoryTransferCreatePath } | { internal: true },
  ): Promise<string | null> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        INVENTORY_OPERATION_KEYS.transferCreate,
        context.path,
      );
    }
    if (!isConfigured) return null;
    if (!input.toWarehouseId) {
      throw new Error('يجب تحديد المخزن المصدر والوجهة.');
    }
    const requestType = normalizeRequestType(input.requestType);
    if (requestType !== 'production_entry' && !input.fromWarehouseId) {
      throw new Error('يجب تحديد المخزن المصدر والوجهة.');
    }
    if (isTransferLikeType(requestType) && input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('المخزن المصدر يجب أن يكون مختلفا عن مخزن الوجهة.');
    }
    if (requestType === 'manual_transfer') {
      const warehouseIds = [input.fromWarehouseId, input.toWarehouseId].filter(Boolean);
      const warehouses = await Promise.all(warehouseIds.map((id) => warehouseService.getById(id)));
      if (warehouses.some((w) => isRepairSystemWarehouseRole(w?.warehouseRole))) {
        throw new Error(MANUAL_TRANSFER_REPAIR_WAREHOUSE_ERROR);
      }
    }
    const lines = input.lines
      .filter((line) => Number(line.quantity) > 0)
      .map((line) => stripUndefinedDeep({ ...line, quantity: Number(line.quantity) }));
    if (!lines.length) {
      throw new Error('لا توجد أصناف صالحة في طلب التحويل.');
    }

    const [resolvedFromName, resolvedToName] = await Promise.all([
      input.fromWarehouseId?.startsWith('__')
        ? Promise.resolve(String(input.fromWarehouseName || '').trim())
        : warehouseService.resolveDisplayName(
          input.fromWarehouseId,
          String(input.fromWarehouseName || '').trim(),
        ),
      warehouseService.resolveDisplayName(
        input.toWarehouseId,
        String(input.toWarehouseName || '').trim(),
      ),
    ]);

    const createdId = await runTransaction(db, async (t) => {
      const resolvedReferenceNo =
        input.referenceNo?.trim() || (await allocateInvReferenceInTransaction(t));
      const now = toIsoNow();
      const payload: InventoryTransferRequest = {
        requestType,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        referenceNo: resolvedReferenceNo,
        lines,
        status: 'pending',
        createdBy: input.createdBy,
        createdAt: now,
        submittedAt: now,
      };
      if (requestType === 'production_handover') {
        const reported = lines.reduce(
          (sum, line) => sum + Number(line.reportedQuantity ?? line.quantity ?? 0),
          0,
        );
        payload.reportedQuantity = reported;
        payload.receivedQuantity = 0;
        payload.remainingQuantity = reported;
        payload.lines = lines.map((line) => ({
          ...line,
          reportedQuantity: Number(line.reportedQuantity ?? line.quantity ?? 0),
          receivedQuantity: Number(line.receivedQuantity || 0),
        }));
      }
      if (resolvedFromName) payload.fromWarehouseName = resolvedFromName;
      if (resolvedToName) payload.toWarehouseName = resolvedToName;
      const note = String(input.note || '').trim();
      if (note) payload.note = note;
      const sourceId = String(input.sourceId || input.sourceReportId || '').trim();
      if (sourceId) {
        payload.sourceId = sourceId;
        payload.sourceReportId = sourceId;
      }
      const sourceModule = input.sourceModule;
      if (sourceModule) payload.sourceModule = sourceModule;
      const createdByUserId = String(input.createdByUserId || '').trim();
      if (createdByUserId) payload.createdByUserId = createdByUserId;

      const ref = doc(collection(db, COLLECTION));
      t.set(ref, stripUndefinedDeep({
        ...payload,
        tenantId: getCurrentTenantId(),
      }));
      return ref.id;
    });

    if (createdId) {
      try {
        const [settings, row] = await Promise.all([
          systemSettingsService.get(),
          this.getById(createdId),
        ]);
        if (row?.status === 'pending') {
          void opsNotificationService.notifyPendingTransfer(settings, row.referenceNo, createdId);
        }
      } catch {
        // notifications are best-effort
      }
    }
    return createdId;
  },

  async approveRequest(
    id: string,
    approvedBy: string,
    context: { path: InventoryTransferDecisionPath } | { internal: true },
    options?: ApproveRequestOptions,
  ): Promise<void> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        INVENTORY_OPERATION_KEYS.transferApprove,
        context.path,
      );
    }
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن اعتماد طلب غير معلق.');
    }

    const requestType = normalizeRequestType(request.requestType);
    if (requestType === 'production_handover') {
      throw new Error(
        'استلام التغليف يتم عبر تأكيد الكمية الفعلية من صفحة تحكم التغليف، وليس الاعتماد الكامل دفعة واحدة.',
      );
    }
    if (requestType === 'production_entry') {
      const sameUserById = Boolean(
        options?.approverUserId &&
        request.createdByUserId &&
        options.approverUserId.trim() === request.createdByUserId.trim(),
      );
      const sameUserByName = !sameUserById && (
        normalizeActor(approvedBy) !== '' &&
        normalizeActor(approvedBy) === normalizeActor(request.createdBy)
      );
      if (sameUserById || sameUserByName) {
        throw new Error('لا يمكن لمنشئ التقرير اعتماد إدخال الإنتاج الخاص به. يجب أن يعتمدها مستخدم آخر مخوّل.');
      }
    }
    for (const line of request.lines) {
      if (requestType === 'production_entry') {
        await stockService.createMovement({
          warehouseId: request.toWarehouseId,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          movementType: 'IN',
          quantity: Number(line.quantity || 0),
          unit: line.unit,
          minStock: line.minStock,
          note: request.note || `Approved production entry ${id}`,
          referenceNo: request.referenceNo,
          sourceModule: request.sourceModule ?? 'production_report',
          sourceId: request.sourceId ?? request.sourceReportId,
          createdBy: approvedBy,
          allowNegative: true,
        }, { path: INVENTORY_STOCK_MOVE_PATHS.transferApproval });
      } else if (isTransferLikeType(requestType)) {
        await stockService.createMovement({
          warehouseId: request.fromWarehouseId,
          toWarehouseId: request.toWarehouseId,
          locationId: line.locationId,
          locationCode: line.locationCode,
          toLocationId: line.toLocationId,
          toLocationCode: line.toLocationCode,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          movementType: 'TRANSFER',
          quantity: Number(line.quantity || 0),
          unit: line.unit,
          requestQuantity: Number(line.requestQuantity ?? line.quantity ?? 0),
          requestUnit: line.requestUnit || (line.itemType === 'finished_good' ? 'piece' : 'unit'),
          unitsPerCarton: Number(line.unitsPerCarton || 0) || undefined,
          minStock: line.minStock,
          note: request.note,
          referenceNo: request.referenceNo,
          sourceModule: request.sourceModule ?? 'transfer_request',
          sourceId: request.sourceId ?? request.sourceReportId ?? id,
          createdBy: approvedBy,
          allowNegative: Boolean(options?.allowNegativeFromSource),
        }, { path: INVENTORY_STOCK_MOVE_PATHS.transferApproval });
      }
    }

    const resolvedAt = toIsoNow();
    const approvePatch: Record<string, any> = {
      status: 'approved',
      approvedBy,
      approvedAt: resolvedAt,
      resolvedAt,
    };
    if (!request.firstReviewedAt) approvePatch.firstReviewedAt = resolvedAt;
    const approvedByUserId = options?.approverUserId?.trim();
    if (approvedByUserId) approvePatch.approvedByUserId = approvedByUserId;
    await updateDoc(doc(db, COLLECTION, id), approvePatch);

    if (requestType === 'production_entry') {
      await chainProductionEntryToFinishedStaging(
        { ...request, status: 'approved' },
        approvedBy,
        options,
      );
    }
  },

  async rejectRequest(
    id: string,
    rejectedBy: string,
    context: { path: InventoryTransferDecisionPath } | { internal: true },
    rejectionReason?: string,
    rejectedByUserId?: string,
  ): Promise<void> {
    if ('path' in context) {
      await assertCurrentTenantOperationPathEnabled(
        INVENTORY_OPERATION_KEYS.transferReject,
        context.path,
      );
    }
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن رفض طلب غير معلق.');
    }
    const resolvedAt = toIsoNow();
    const rejectPatch: Record<string, any> = {
      status: 'rejected',
      rejectedBy,
      rejectedAt: resolvedAt,
      resolvedAt,
      rejectionReason: rejectionReason?.trim() || '',
    };
    if (!request.firstReviewedAt) rejectPatch.firstReviewedAt = resolvedAt;
    const rejectedByUserIdClean = rejectedByUserId?.trim();
    if (rejectedByUserIdClean) rejectPatch.rejectedByUserId = rejectedByUserIdClean;
    await updateDoc(doc(db, COLLECTION, id), rejectPatch);
  },

  async cancelRequest(id: string, cancelledBy: string, cancellationReason?: string, cancelledByUserId?: string): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'approved') {
      throw new Error('يمكن إلغاء التحويلات المعتمدة فقط.');
    }
    if (!request.referenceNo?.trim()) {
      throw new Error('لا يمكن إلغاء الحركة بدون رقم مرجع.');
    }
    const requestType = normalizeRequestType(request.requestType);
    if (requestType === 'production_entry') {
      const rows = await stockService.getTransactionsByReferenceNo(request.referenceNo.trim());
      const approvedRows = rows.filter(
        (tx) =>
          tx.movementType === 'IN' &&
          tx.warehouseId === request.toWarehouseId &&
          request.lines.some((line) => line.itemType === tx.itemType && line.itemId === tx.itemId),
      );
      for (const tx of approvedRows) {
        await stockService.deleteMovement(tx);
      }

      // Reverse chained WIP → تم الإنتاج moves for the same report.
      const reportId = String(request.sourceReportId || request.sourceId || '').trim();
      if (reportId) {
        const linked = await this.getBySourceReportId(reportId);
        for (const auto of linked) {
          if (
            !auto.id ||
            auto.id === id ||
            normalizeRequestType(auto.requestType) !== 'production_auto_transfer' ||
            auto.status !== 'approved' ||
            !String(auto.referenceNo || '').trim()
          ) {
            continue;
          }
          await stockService.deleteTransferByReference(auto.referenceNo!.trim());
          await updateDoc(doc(db, COLLECTION, auto.id), {
            status: 'cancelled',
            cancelledBy,
            cancelledAt: toIsoNow(),
            cancellationReason: cancellationReason?.trim() || 'إلغاء مرتبط بإلغاء إدخال الإنتاج',
            ...(cancelledByUserId?.trim() ? { cancelledByUserId: cancelledByUserId.trim() } : {}),
          });
        }
      }
    } else {
      await stockService.deleteTransferByReference(request.referenceNo.trim());
    }
    const cancelPatch: Record<string, any> = {
      status: 'cancelled',
      cancelledBy,
      cancelledAt: toIsoNow(),
      cancellationReason: cancellationReason?.trim() || '',
    };
    const cancelledByUserIdClean = cancelledByUserId?.trim();
    if (cancelledByUserIdClean) cancelPatch.cancelledByUserId = cancelledByUserIdClean;
    await updateDoc(doc(db, COLLECTION, id), cancelPatch);
  },

  async updateRequest(id: string, updates: UpdateTransferRequestInput): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('يمكن تعديل الطلبات المعلقة فقط.');
    }

    const patch: Record<string, any> = {};
    if (typeof updates.note === 'string') patch.note = updates.note.trim();
    if (updates.lines) {
      const lines = updates.lines
        .filter((line) => Number(line.quantity) > 0)
        .map((line) => ({ ...line, quantity: Number(line.quantity || 0) }));
      if (!lines.length) {
        throw new Error('لا توجد أصناف صالحة بعد التعديل.');
      }
      patch.lines = lines;
    }
    if (Object.keys(patch).length === 0) return;
    patch.updatedAt = toIsoNow();
    await updateDoc(doc(db, COLLECTION, id), patch);
  },
};

