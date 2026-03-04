import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  limit,
  startAfter,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db, isConfigured } from '../../auth/services/firebase';
import type {
  InventoryTransferRequest,
  TransferRequestLine,
  TransferRequestStatus,
  TransferRequestType,
} from '../types';
import { stockService } from './stockService';

const COLLECTION = 'inventory_transfer_requests';
const toIsoNow = () => new Date().toISOString();
const MAX_PAGE_SIZE = 100;
const INV_REF_REGEX = /^INV-(\d+)$/i;
const formatInvReference = (seq: number) => `INV-${String(Math.max(1, Math.floor(seq))).padStart(3, '0')}`;

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
  sourceReportId?: string;
  lines: TransferRequestLine[];
  createdBy: string;
  createdByUserId?: string;
};

type UpdateTransferRequestInput = {
  note?: string;
  lines?: TransferRequestLine[];
};

type ApproveRequestOptions = {
  allowNegativeFromSource?: boolean;
  approverUserId?: string;
};

const normalizeActor = (value?: string) => String(value || '').trim().toLowerCase();

export const transferApprovalService = {
  async getNextInvReferenceNo(): Promise<string> {
    if (!isConfigured) return formatInvReference(1);
    const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'), limit(500));
    const snap = await getDocs(q);
    const maxInv = snap.docs.reduce((max, d) => {
      const ref = String((d.data() as any)?.referenceNo || '').trim();
      const match = ref.match(INV_REF_REGEX);
      if (!match) return max;
      return Math.max(max, Number(match[1] || 0));
    }, 0);
    return formatInvReference(maxInv + 1);
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
    const q = query(collection(db, COLLECTION), ...constraints);
    const snap = await getDocs(q);
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
    const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
    return { items, nextCursor, hasMore: snap.docs.length === pageSize };
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
    try {
      const q = query(
        collection(db, COLLECTION),
        where('sourceReportId', '==', sourceReportId.trim()),
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
      const fallbackQ = query(
        collection(db, COLLECTION),
        where('sourceReportId', '==', sourceReportId.trim()),
        limit(500),
      );
      const fallbackSnap = await getDocs(fallbackQ);
      const rows = fallbackSnap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransferRequest));
      rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return rows;
    }
  },

  async createRequest(input: CreateTransferRequestInput): Promise<string | null> {
    if (!isConfigured) return null;
    if (!input.toWarehouseId) {
      throw new Error('يجب تحديد المخزن المصدر والوجهة.');
    }
    const requestType: TransferRequestType = input.requestType || 'transfer';
    if (requestType === 'transfer' && !input.fromWarehouseId) {
      throw new Error('يجب تحديد المخزن المصدر والوجهة.');
    }
    if (requestType === 'transfer' && input.fromWarehouseId === input.toWarehouseId) {
      throw new Error('المخزن المصدر يجب أن يكون مختلفا عن مخزن الوجهة.');
    }
    const lines = input.lines
      .filter((line) => Number(line.quantity) > 0)
      .map((line) => ({ ...line, quantity: Number(line.quantity) }));
    if (!lines.length) {
      throw new Error('لا توجد أصناف صالحة في طلب التحويل.');
    }
    const resolvedReferenceNo = input.referenceNo?.trim() || await this.getNextInvReferenceNo();
    const payload: InventoryTransferRequest = {
      requestType,
      fromWarehouseId: input.fromWarehouseId,
      toWarehouseId: input.toWarehouseId,
      referenceNo: resolvedReferenceNo,
      lines,
      status: 'pending',
      createdBy: input.createdBy,
      createdAt: toIsoNow(),
    };
    const fromWarehouseName = String(input.fromWarehouseName || '').trim();
    if (fromWarehouseName) payload.fromWarehouseName = fromWarehouseName;
    const toWarehouseName = String(input.toWarehouseName || '').trim();
    if (toWarehouseName) payload.toWarehouseName = toWarehouseName;
    const note = String(input.note || '').trim();
    if (note) payload.note = note;
    const sourceReportId = String(input.sourceReportId || '').trim();
    if (sourceReportId) payload.sourceReportId = sourceReportId;
    const createdByUserId = String(input.createdByUserId || '').trim();
    if (createdByUserId) payload.createdByUserId = createdByUserId;
    const ref = await addDoc(collection(db, COLLECTION), payload);
    return ref.id;
  },

  async approveRequest(id: string, approvedBy: string, options?: ApproveRequestOptions): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن اعتماد طلب غير معلق.');
    }

    const requestType: TransferRequestType = request.requestType || 'transfer';
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
        throw new Error('لا يمكن لمنشئ التقرير اعتماد دخول تم الصنع الخاص به. يجب أن يعتمدها مستخدم آخر مخوّل.');
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
          minStock: line.minStock,
          note: request.note || `Approved production entry ${id}`,
          referenceNo: request.referenceNo,
          createdBy: approvedBy,
        });
      } else {
        await stockService.createMovement({
          warehouseId: request.fromWarehouseId,
          toWarehouseId: request.toWarehouseId,
          itemType: line.itemType,
          itemId: line.itemId,
          itemName: line.itemName,
          itemCode: line.itemCode,
          movementType: 'TRANSFER',
          quantity: Number(line.quantity || 0),
          requestQuantity: Number(line.requestQuantity ?? line.quantity ?? 0),
          requestUnit: line.requestUnit || (line.itemType === 'finished_good' ? 'piece' : 'unit'),
          unitsPerCarton: Number(line.unitsPerCarton || 0) || undefined,
          minStock: line.minStock,
          note: request.note,
          referenceNo: request.referenceNo,
          createdBy: approvedBy,
          allowNegative: Boolean(options?.allowNegativeFromSource),
        });
      }
    }

    const approvePatch: Record<string, any> = {
      status: 'approved',
      approvedBy,
      approvedAt: toIsoNow(),
    };
    const approvedByUserId = options?.approverUserId?.trim();
    if (approvedByUserId) approvePatch.approvedByUserId = approvedByUserId;
    await updateDoc(doc(db, COLLECTION, id), approvePatch);
  },

  async rejectRequest(id: string, rejectedBy: string, rejectionReason?: string, rejectedByUserId?: string): Promise<void> {
    if (!isConfigured || !id) return;
    const request = await this.getById(id);
    if (!request) throw new Error('طلب التحويل غير موجود.');
    if (request.status !== 'pending') {
      throw new Error('لا يمكن رفض طلب غير معلق.');
    }
    const rejectPatch: Record<string, any> = {
      status: 'rejected',
      rejectedBy,
      rejectedAt: toIsoNow(),
      rejectionReason: rejectionReason?.trim() || '',
    };
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
    const requestType: TransferRequestType = request.requestType || 'transfer';
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

